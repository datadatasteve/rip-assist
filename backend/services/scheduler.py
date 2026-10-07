"""Suggestion engine + plan feasibility."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import db
from services import push
from services.momentum import color_for, parse_ts, suggestion_score

WAITING_FOLLOWUP_AFTER = timedelta(days=3)
INFEASIBLE_MARGIN_MIN = 30


async def get_settings(user_id: str) -> dict:
    rows = await db.select_user("user_settings", user_id)
    if rows:
        return rows[0]
    rows = await db.insert("user_settings", {"user_id": user_id}, upsert_on="user_id")
    return rows[0]


def tz_of(settings: dict) -> ZoneInfo:
    try:
        return ZoneInfo(settings.get("timezone") or "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _t(v: str | None, default: time) -> time:
    if not v:
        return default
    h, m, *_ = v.split(":")
    return time(int(h), int(m))


def today_window(settings: dict) -> tuple[datetime, datetime, datetime]:
    """(now, window_start, window_end) for today in the user's timezone, as aware datetimes."""
    tz = tz_of(settings)
    now = datetime.now(tz)
    start = datetime.combine(now.date(), _t(settings.get("workday_start"), time(8)), tz)
    end = datetime.combine(now.date(), _t(settings.get("workday_end"), time(22)), tz)
    return now, max(start, now), end


def _merge(intervals: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    out: list[list[datetime]] = []
    for s, e in sorted(intervals):
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return [(s, e) for s, e in out]


async def free_slots(user_id: str, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    if end <= start:
        return []
    events = await db.select_user("gcal_events", user_id, {
        "start_at": f"lt.{end.isoformat()}", "end_at": f"gt.{start.isoformat()}", "all_day": "eq.false",
    })
    busy = _merge([(max(parse_ts(e["start_at"]), start), min(parse_ts(e["end_at"]), end)) for e in events])
    slots, cur = [], start
    for s, e in busy:
        if s > cur:
            slots.append((cur, s))
        cur = max(cur, e)
    if cur < end:
        slots.append((cur, end))
    return [(s, e) for s, e in slots if (e - s) >= timedelta(minutes=5)]


async def todays_chunks(user_id: str, settings: dict) -> list[dict]:
    tz = tz_of(settings)
    d = datetime.now(tz).date()
    s = datetime.combine(d, time(0), tz).astimezone(timezone.utc)
    e = s + timedelta(days=1)
    return await db.select_user("chunks", user_id, {
        "scheduled_start": f"gte.{s.isoformat()}", "and": f"(scheduled_start.lt.{e.isoformat()})",
        "order": "scheduled_start.asc",
    })


async def feasibility(user_id: str, settings: dict | None = None) -> dict:
    settings = settings or await get_settings(user_id)
    now, start, end = today_window(settings)
    slots = await free_slots(user_id, start, end)
    free_min = int(sum((e - s).total_seconds() for s, e in slots) // 60)
    chunks = await todays_chunks(user_id, settings)
    remaining = [
        c for c in chunks
        if not c.get("completed_at") and not c.get("skipped_at")
        and (parse_ts(c.get("scheduled_end")) or parse_ts(c["scheduled_start"]) + timedelta(minutes=c["duration_minutes"])) > now
    ]
    remaining_min = 0
    for c in remaining:
        cs = parse_ts(c["scheduled_start"])
        ce = parse_ts(c.get("scheduled_end")) or cs + timedelta(minutes=c["duration_minutes"])
        remaining_min += int((ce - max(cs, now)).total_seconds() // 60)
    over = remaining_min - free_min
    return {
        "free_minutes": free_min,
        "remaining_scheduled_minutes": remaining_min,
        "over_by_minutes": max(0, over),
        "infeasible": over > INFEASIBLE_MARGIN_MIN,
        "free_slots": [{"start": s.isoformat(), "end": e.isoformat(), "minutes": int((e - s).total_seconds() // 60)} for s, e in slots],
    }


async def maybe_offer_replan(user_id: str, settings: dict | None = None) -> dict:
    """Proactive re-suggestion: once per day, only when infeasible. Never repeats after it's offered."""
    settings = settings or await get_settings(user_id)
    f = await feasibility(user_id, settings)
    today = datetime.now(tz_of(settings)).date().isoformat()
    offer = f["infeasible"] and settings.get("infeasible_offered_on") != today
    if offer:
        await db.update("user_settings", user_id, {}, {"infeasible_offered_on": today})
        await push.notify(user_id, "plan_infeasible", "Today's plan doesn't fit",
                          f"About {f['over_by_minutes']} min more scheduled than free time. Want a re-plan?",
                          url="#/?replan=1")
    return {**f, "offered": offer}


async def suggestions(user_id: str, limit: int = 8) -> dict:
    settings = await get_settings(user_id)
    now, start, end = today_window(settings)
    slots = await free_slots(user_id, start, end)
    next_slot_min = int((slots[0][1] - slots[0][0]).total_seconds() // 60) if slots and slots[0][0] <= now + timedelta(minutes=15) else 0
    largest_slot = max((int((e - s).total_seconds() // 60) for s, e in slots), default=0)

    lanes = {l["id"]: l for l in await db.select_user("lanes", user_id, {"archived_at": "is.null"})}
    goals = {g["id"]: g for g in await db.select_user("goals", user_id, {"status": "in.(active,waiting_on)"})}
    tasks = await db.select_user("tasks", user_id, {"status": "in.(active,waiting_on)"})
    open_chunks = await db.select_user("chunks", user_id, {"completed_at": "is.null", "skipped_at": "is.null"})
    today_chunks = await todays_chunks(user_id, settings)

    # lane balance
    lane_counts: dict[str, int] = {}
    for c in today_chunks:
        lid = c.get("lane_id") or next((t.get("lane_id") for t in tasks if t["id"] == c.get("task_id")), None)
        if lid:
            lane_counts[lid] = lane_counts.get(lid, 0) + 1
    lane_flag = None
    if sum(lane_counts.values()) >= 3 and len(lane_counts) == 1:
        only = next(iter(lane_counts))
        lane_flag = f"Today is all {lanes.get(only, {}).get('name', 'one lane')}. Consider one thing from another lane."
    dominant = next(iter(lane_counts)) if lane_flag else None

    def next_chunk(kind: str, item_id: str) -> dict | None:
        cs = [c for c in open_chunks if c.get(f"{kind}_id") == item_id]
        cs.sort(key=lambda c: (c.get("scheduled_start") is None, c.get("scheduled_start") or ""))
        return cs[0] if cs else None

    out = []
    goals_with_tasks = {t.get("goal_id") for t in tasks if t.get("goal_id")}
    items = [("task", t) for t in tasks] + [("goal", g) for g in goals.values() if g["id"] not in goals_with_tasks]
    for kind, it in items:
        lane_id = it.get("lane_id") or (goals.get(it.get("goal_id") or "", {}) or {}).get("lane_id")
        if it["status"] == "waiting_on":
            since = parse_ts(it.get("waiting_since")) or parse_ts(it.get("last_interaction"))
            if since and datetime.now(timezone.utc) - since >= WAITING_FOLLOWUP_AFTER:
                out.append({
                    "kind": "followup", "ref_type": kind, "ref_id": it["id"], "lane_id": lane_id,
                    "title": f"Follow up with {it.get('waiting_on_whom') or 'them'}: {it['title']}",
                    "minutes": 5, "score": suggestion_score(it) + 10, "reasons": ["waiting 3+ days"],
                    "momentum": it.get("momentum"), "color": color_for(it),
                })
            continue
        score = suggestion_score(it)
        reasons = [f"priority {it.get('priority_user') or '-'} / momentum {it.get('momentum')}"]
        ch = next_chunk(kind, it["id"])
        minutes = ch["duration_minutes"] if ch else 30
        if next_slot_min and minutes <= next_slot_min:
            score += 5
            reasons.append("fits your next free slot")
        elif largest_slot and minutes > largest_slot:
            score -= 10
            reasons.append("longer than any free slot today")
        if it.get("due_date"):
            days = (date.fromisoformat(it["due_date"]) - now.date()).days
            if days <= 1:
                score += 8
                reasons.append("due " + ("today" if days <= 0 else "tomorrow"))
        if dominant and lane_id and lane_id != dominant:
            score += 3
            reasons.append("balances today's lanes")
        out.append({
            "kind": "chunk" if ch else kind, "ref_type": kind, "ref_id": it["id"], "chunk_id": ch["id"] if ch else None,
            "lane_id": lane_id, "title": ch["title"] if ch else it["title"], "parent_title": it["title"] if ch else None,
            "minutes": minutes, "score": round(score, 2), "reasons": reasons,
            "momentum": it.get("momentum"), "color": color_for(it),
        })
    out.sort(key=lambda x: x["score"], reverse=True)
    return {
        "suggestions": out[:limit],
        "free_minutes_today": int(sum((e - s).total_seconds() for s, e in slots) // 60),
        "next_free_slot_minutes": next_slot_min,
        "lane_balance_flag": lane_flag,
    }
