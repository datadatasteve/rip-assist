"""Momentum scoring engine.

- `apply_event` runs immediately on any task/goal/chunk interaction.
- `run_decay` runs hourly (pg_cron → /api/jobs/momentum-decay) for all users.
"""
from datetime import date, datetime, timedelta, timezone

import db
from services import push

EVENT_DELTAS = {
    "progress": 15,
    "chunk_completed": 20,
    "viewed": 2,
    "in_progress": 10,
    "scheduled_soon": 5,
    "unblocked": 10,
    "chunk_skipped": -10,
    "due_passed": -20,
    "decay": -5,
}
CHUNK_PARENT_PROPAGATION = 10
VIEW_COOLDOWN = timedelta(hours=1)
WAITING_PROMPT_AFTER = timedelta(days=7)
DEAD_LOW_THRESHOLD = 10
DEAD_LOW_DURATION = timedelta(days=3)

TABLE = {"task": "tasks", "goal": "goals"}


def now() -> datetime:
    return datetime.now(timezone.utc)


def parse_ts(v: str | None) -> datetime | None:
    if not v:
        return None
    return datetime.fromisoformat(v.replace("Z", "+00:00"))


def clamp(v: int) -> int:
    return max(0, min(100, v))


def suggestion_score(item: dict) -> float:
    pu = item.get("priority_user") or 5
    pa = item.get("priority_app") or pu
    priority_effective = (pu + pa) / 2
    # priority is 1-10, momentum 0-100: scale priority to 0-100 so both weights mean something
    return round(priority_effective * 10 * 0.6 + (item.get("momentum") or 0) * 0.4, 2)


def color_for(item: dict) -> str:
    return {"rising": "green", "falling": "red"}.get(item.get("momentum_trend") or "flat", "yellow")


async def compute_trend(entity_id: str, current: int) -> str:
    hist = await db.select("momentum_history", {
        "entity_id": f"eq.{entity_id}",
        "created_at": f"lte.{(now() - timedelta(hours=72)).isoformat()}",
        "order": "created_at.desc", "limit": "1", "select": "momentum",
    })
    if not hist:  # younger than 72h: compare to the oldest point we have
        hist = await db.select("momentum_history", {
            "entity_id": f"eq.{entity_id}", "order": "created_at.asc", "limit": "1", "select": "momentum",
        })
    base = hist[0]["momentum"] if hist else 50
    net = current - base
    if abs(net) <= 5:
        # 72h flat — let a sharp 24h swing still show
        recent = await db.select("momentum_history", {
            "entity_id": f"eq.{entity_id}",
            "created_at": f"lte.{(now() - timedelta(hours=24)).isoformat()}",
            "order": "created_at.desc", "limit": "1", "select": "momentum",
        })
        if recent and abs(current - recent[0]["momentum"]) > 5:
            return "rising" if current > recent[0]["momentum"] else "falling"
        return "flat"
    return "rising" if net > 0 else "falling"


async def _adjust(user_id: str, entity_type: str, item: dict, delta: int, event: str,
                  extra: dict | None = None, touch: bool = True) -> dict:
    new_m = clamp((item.get("momentum") or 0) + delta)
    patch: dict = dict(extra or {})
    patch["momentum"] = new_m
    if touch:
        patch["last_interaction"] = now().isoformat()
    # low tracking for dead detection
    if new_m < DEAD_LOW_THRESHOLD:
        patch["low_since"] = item.get("low_since") or now().isoformat()
    else:
        patch["low_since"] = None
    # positive interaction revives a dead item
    if delta > 0 and item.get("status") == "dead":
        patch["status"] = "active"
        patch["dead_at"] = None
    has_history = await db.select("momentum_history", {"entity_id": f"eq.{item['id']}", "limit": "1", "select": "id"})
    if not has_history:
        # baseline point so the very first event already shows a trend
        await db.insert("momentum_history", {
            "user_id": user_id, "entity_type": entity_type, "entity_id": item["id"],
            "momentum": item.get("momentum") or 0, "delta": 0, "event": "baseline",
            "created_at": item.get("created_at") or now().isoformat(),
        })
    await db.insert("momentum_history", {
        "user_id": user_id, "entity_type": entity_type, "entity_id": item["id"],
        "momentum": new_m, "delta": delta, "event": event,
    })
    patch["momentum_trend"] = await compute_trend(item["id"], new_m)
    if patch["momentum_trend"] != "falling":
        patch["red_alerted_at"] = None
    rows = await db.update(TABLE[entity_type], user_id, {"id": item["id"]}, patch)
    return rows[0] if rows else {**item, **patch}


async def apply_event(user_id: str, entity_type: str, entity_id: str, event: str) -> dict:
    """entity_type: task | goal | chunk."""
    if event not in EVENT_DELTAS:
        raise ValueError(f"unknown event {event}")
    delta = EVENT_DELTAS[event]
    touched = []

    if entity_type == "chunk":
        chunk = await db.get_one("chunks", user_id, entity_id)
        if not chunk:
            raise LookupError("chunk not found")
        if chunk.get("task_id"):
            task = await db.get_one("tasks", user_id, chunk["task_id"])
            if task:
                touched.append(await _adjust(user_id, "task", task, delta, event))
                if event == "chunk_completed" and task.get("goal_id"):
                    goal = await db.get_one("goals", user_id, task["goal_id"])
                    if goal:
                        touched.append(await _adjust(user_id, "goal", goal, CHUNK_PARENT_PROPAGATION, "chunk_completed_child"))
        elif chunk.get("goal_id"):
            goal = await db.get_one("goals", user_id, chunk["goal_id"])
            if goal:
                touched.append(await _adjust(user_id, "goal", goal, delta, event))
        return {"updated": touched}

    item = await db.get_one(TABLE[entity_type], user_id, entity_id)
    if not item:
        raise LookupError(f"{entity_type} not found")

    if event == "viewed":
        last = parse_ts(item.get("last_interaction"))
        if last and now() - last < VIEW_COOLDOWN:
            return {"updated": [], "skipped": "view cooldown"}

    extra = {}
    if event == "unblocked":
        extra = {"status": "active", "waiting_on_whom": None, "waiting_since": None, "waiting_prompted_at": None}
    touched.append(await _adjust(user_id, entity_type, item, delta, event, extra, touch=delta > 0))
    return {"updated": touched}


async def run_decay_for_user(user_id: str) -> dict:
    from services.scheduler import get_settings, tz_of  # local import: scheduler imports this module
    today = datetime.now(tz_of(await get_settings(user_id))).date()
    stats = {"decayed": 0, "due_penalties": 0, "dead": 0, "waiting_prompts": 0, "red_alerts": 0}
    for entity_type, table in TABLE.items():
        items = await db.select_user(table, user_id, {"status": "in.(active,waiting_on)"})
        for item in items:
            current = item
            last = parse_ts(item.get("last_interaction")) or now()

            if item["status"] == "waiting_on":
                since = parse_ts(item.get("waiting_since")) or last
                if now() - since > WAITING_PROMPT_AFTER and not item.get("waiting_prompted_at"):
                    who = item.get("waiting_on_whom") or "someone"
                    await push.notify(user_id, "waiting_followup", f"Still blocked on {who}?",
                                      f"“{item['title']}” has been waiting 7+ days. Reach out?",
                                      url="#/tasks", entity_id=item["id"])
                    await db.update(table, user_id, {"id": item["id"]}, {"waiting_prompted_at": now().isoformat()})
                    stats["waiting_prompts"] += 1
                continue  # decay paused while waiting

            threshold = item.get("decay_threshold_days") or 3
            overdue_days = (now() - last).days - threshold
            if overdue_days > 0 and item.get("decay_applied_on") != today.isoformat():
                current = await _adjust(user_id, entity_type, current, EVENT_DELTAS["decay"], "decay",
                                        {"decay_applied_on": today.isoformat()}, touch=False)
                stats["decayed"] += 1

            due = item.get("due_date")
            if due and date.fromisoformat(due) < today and not item.get("due_penalty_applied"):
                current = await _adjust(user_id, entity_type, current, EVENT_DELTAS["due_passed"], "due_passed",
                                        {"due_penalty_applied": True}, touch=False)
                stats["due_penalties"] += 1

            low_since = parse_ts(current.get("low_since"))
            if (current.get("momentum") or 0) <= 0 or (low_since and now() - low_since >= DEAD_LOW_DURATION):
                await db.update(table, user_id, {"id": item["id"]}, {"status": "dead", "dead_at": now().isoformat()})
                await push.notify(user_id, "dead_item", f"“{item['title']}” has stalled out",
                                  "Marked dead. Revive, reschedule, or archive it?", url="#/tasks", entity_id=item["id"])
                stats["dead"] += 1
                continue

            if current.get("momentum_trend") == "falling" and not current.get("red_alerted_at"):
                await push.notify(user_id, "momentum_alert", f"Momentum dropping: {item['title']}",
                                  f"Momentum {current.get('momentum')}/100 and falling.", url="#/tasks", entity_id=item["id"])
                await db.update(table, user_id, {"id": item["id"]}, {"red_alerted_at": now().isoformat()})
                stats["red_alerts"] += 1
    return stats


async def run_decay() -> dict:
    out = {}
    for uid in await db.all_user_ids():
        try:
            out[uid] = await run_decay_for_user(uid)
        except Exception as e:  # noqa: BLE001 — one user's failure shouldn't stop the job
            out[uid] = {"error": str(e)[:200]}
    return out
