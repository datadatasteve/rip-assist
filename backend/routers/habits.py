"""Habit streak maintenance. Logging a habit is a direct Supabase insert from the
frontend (which also updates the streak). This keeps stored streaks honest
when days are missed and nobody opens the app."""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends

import db
from auth import current_user
from services.scheduler import get_settings, tz_of

router = APIRouter(prefix="/api/habits", tags=["habits"])


def _due(h: dict, d: date) -> bool:
    if h["frequency"] == "daily":
        return True
    if h["frequency"] == "custom":
        # custom_days uses 0=Sun; Python weekday() uses 0=Mon
        return ((d.weekday() + 1) % 7) in (h.get("custom_days") or [])
    return True


def compute_streak(h: dict, done: set[date], today: date) -> int:
    """Mirrors frontend/src/lib/habits.js."""
    if h["frequency"] == "weekly":
        def wk(d: date) -> date:
            return d - timedelta(days=(d.weekday() + 1) % 7)  # week starts Sunday
        weeks = {wk(d) for d in done}
        cur = wk(today)
        if cur not in weeks:
            cur -= timedelta(days=7)  # this week still open
        n = 0
        while cur in weeks:
            n += 1
            cur -= timedelta(days=7)
        return n
    d = today
    if d not in done:
        d -= timedelta(days=1)  # today still open
    n, guard = 0, 0
    while guard < 3660:
        guard += 1
        if not _due(h, d):
            d -= timedelta(days=1)
            continue
        if d in done:
            n += 1
            d -= timedelta(days=1)
        else:
            break
    return n


async def recompute_user(user_id: str) -> int:
    habits = await db.select_user("habits", user_id, {"archived_at": "is.null"})
    logs = await db.select_user("habit_logs", user_id, {"select": "habit_id,completed_date"})
    today = datetime.now(tz_of(await get_settings(user_id))).date()
    changed = 0
    for h in habits:
        done = {date.fromisoformat(l["completed_date"]) for l in logs if l["habit_id"] == h["id"]}
        streak = compute_streak(h, done, today)
        longest = max(h.get("longest_streak") or 0, streak)
        if streak != h.get("current_streak") or longest != h.get("longest_streak"):
            await db.update("habits", user_id, {"id": h["id"]}, {"current_streak": streak, "longest_streak": longest})
            changed += 1
    return changed


@router.post("/recompute")
async def recompute(user=Depends(current_user)):
    return {"changed": await recompute_user(user["id"])}
