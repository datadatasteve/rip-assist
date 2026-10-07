"""Check-ins: submission with behavioral-signal snapshot, AI reply, and the
scheduled/random reminder dispatcher."""
import random
from datetime import datetime, time, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import db
from auth import current_user
from services import ai_provider, push, scheduler
from services.momentum import parse_ts

router = APIRouter(prefix="/api/checkins", tags=["checkins"])

LATE_GRACE = timedelta(minutes=45)  # don't push a reminder that's this stale


class CheckinIn(BaseModel):
    mood: Literal["green", "yellow", "red"]
    energy: int = Field(ge=1, le=5)
    reflection: str | None = None
    notes: str | None = None
    triggered_by: Literal["scheduled", "on_demand", "random"] = "on_demand"


async def behavioral_signals(user_id: str) -> dict:
    now = datetime.now(timezone.utc)
    prev = await db.select_user("checkins", user_id, {"order": "created_at.desc", "limit": "1", "select": "created_at"})
    since = parse_ts(prev[0]["created_at"]) if prev else now - timedelta(hours=24)
    s, n = since.isoformat(), now.isoformat()

    ended = await db.select_user("chunks", user_id, {
        "scheduled_end": f"gte.{s}", "and": f"(scheduled_end.lte.{n})", "select": "id,title,completed_at,skipped_at",
    })
    missed = [c for c in ended if not c.get("completed_at") and not c.get("skipped_at")]
    completed = await db.select_user("chunks", user_id, {"completed_at": f"gte.{s}", "select": "id"})
    skipped = await db.select_user("chunks", user_id, {"skipped_at": f"gte.{s}", "select": "id"})
    last_ai = await db.select_user("ai_interactions", user_id, {"order": "created_at.desc", "limit": "1", "select": "created_at"})
    reminders = await db.select_user("notifications", user_id, {
        "type": "eq.checkin_reminder", "created_at": f"gte.{s}", "select": "id",
    })
    return {
        "since": s,
        "minutes_since_last_checkin": int((now - since).total_seconds() // 60) if prev else None,
        "missed_chunks": len(missed),
        "missed_chunk_titles": [c["title"] for c in missed][:10],
        "completed_chunks": len(completed),
        "skipped_chunks": len(skipped),
        "ai_interaction_gap_minutes": int((now - parse_ts(last_ai[0]["created_at"])).total_seconds() // 60) if last_ai else None,
        "reminders_since_last": len(reminders),
    }


@router.post("")
async def submit(body: CheckinIn, user=Depends(current_user)):
    uid = user["id"]
    signals = await behavioral_signals(uid)
    # a reminder this check-in answers isn't "skipped"
    answered = 1 if body.triggered_by in ("scheduled", "random") else 0
    signals["skipped_checkins"] = max(0, signals.pop("reminders_since_last") - answered)
    settings = await scheduler.get_settings(uid)
    replan = await scheduler.maybe_offer_replan(uid, settings)
    signals["feasibility"] = {k: replan[k] for k in ("free_minutes", "remaining_scheduled_minutes", "over_by_minutes", "infeasible")}
    row = (await db.insert("checkins", {
        "user_id": uid, **body.model_dump(), "behavioral_signals": signals,
        "plan_resuggest_triggered": bool(replan["offered"]),
    }))[0]
    return {"checkin": row, "replan_recommended": bool(replan["offered"]), "infeasible": replan["infeasible"]}


@router.post("/{checkin_id}/reply")
async def ai_reply(checkin_id: str, user=Depends(current_user)):
    uid = user["id"]
    c = await db.get_one("checkins", uid, checkin_id)
    if not c:
        raise HTTPException(404, "check-in not found")
    sig = c.get("behavioral_signals") or {}
    prompt = (
        f"Mood relative to today's plan: {c['mood']}. Energy: {c['energy']}/5.\n"
        f"What they've been up to: {c.get('reflection') or '(no answer)'}\n"
        f"Notes: {c.get('notes') or '(none)'}\n"
        f"Since last check-in: {sig.get('completed_chunks', 0)} chunks done, {sig.get('missed_chunks', 0)} missed"
        f"{' (' + ', '.join(sig.get('missed_chunk_titles') or []) + ')' if sig.get('missed_chunk_titles') else ''}, "
        f"{sig.get('skipped_chunks', 0)} skipped. Plan feasible today: {not (sig.get('feasibility') or {}).get('infeasible')}."
    )
    try:
        r = await ai_provider.complete(uid, prompt, "checkin")
    except ai_provider.AllProvidersFailed as e:
        raise HTTPException(503, str(e))
    return {"reply": r.content.strip(), "interaction_id": r.interaction_id, "provider": r.provider, "model": r.model}


# ---------------------------------------------------------------------------
# reminder planning + dispatch
# ---------------------------------------------------------------------------

def _hm(v) -> time:
    h, m, *_ = str(v).split(":")
    return time(int(h), int(m))


async def ensure_day_plan(user_id: str, settings: dict) -> dict:
    """Distribute today's random check-ins across the window (one per equal segment)."""
    tz = scheduler.tz_of(settings)
    today = datetime.now(tz).date().isoformat()
    state = settings.get("checkin_state") or {}
    n = settings.get("checkin_random_per_day") or 0
    if state.get("date") == today and len(state.get("random_times") or []) == n:
        return state
    ws, we = _hm(settings.get("checkin_window_start") or "09:00"), _hm(settings.get("checkin_window_end") or "21:00")
    start_m, end_m = ws.hour * 60 + ws.minute, we.hour * 60 + we.minute
    times = []
    if n > 0 and end_m > start_m:
        seg = (end_m - start_m) / n
        for i in range(n):
            m = int(start_m + seg * i + random.uniform(0.1, 0.9) * seg)
            times.append(f"{m // 60:02d}:{m % 60:02d}")
    keep_sent = state.get("sent", []) if state.get("date") == today else []
    state = {"date": today, "random_times": times, "sent": keep_sent}
    await db.update("user_settings", user_id, {}, {"checkin_state": state})
    return state


def due_slots(settings: dict, state: dict) -> list[tuple[str, str]]:
    """[(key, trigger)] for today's slots that have passed and weren't sent."""
    tz = scheduler.tz_of(settings)
    now = datetime.now(tz)
    sent = set(state.get("sent") or [])
    slots = [(f"s:{t}", t, "scheduled") for t in (settings.get("checkin_times") or [])]
    slots += [(f"r:{t}", t, "random") for t in (state.get("random_times") or [])]
    out = []
    for key, t, trig in slots:
        at = datetime.combine(now.date(), _hm(t), tz)
        if at <= now and key not in sent and now - at <= LATE_GRACE:
            out.append((key, trig))
    return out


async def dispatch_user(user_id: str) -> dict:
    settings = await scheduler.get_settings(user_id)
    state = await ensure_day_plan(user_id, settings)
    sent = []
    for key, trig in due_slots(settings, state):
        await push.notify(user_id, "checkin_reminder", "Quick check-in?",
                          "How's today going? Takes 20 seconds.", url=f"#/checkin?trigger={trig}")
        sent.append(key)
    if sent:
        state["sent"] = (state.get("sent") or []) + sent
        await db.update("user_settings", user_id, {}, {"checkin_state": state})
    replan = await scheduler.maybe_offer_replan(user_id, settings)
    return {"reminders": sent, "replan_offered": replan["offered"]}


async def dispatch_all() -> dict:
    out = {}
    for uid in await db.all_user_ids():
        try:
            out[uid] = await dispatch_user(uid)
        except Exception as e:  # noqa: BLE001
            out[uid] = {"error": str(e)[:200]}
    return out


@router.post("/plan-day")
async def plan_day(user=Depends(current_user)):
    """Called by the frontend on load so random times exist even before cron runs."""
    settings = await scheduler.get_settings(user["id"])
    return await ensure_day_plan(user["id"], settings)
