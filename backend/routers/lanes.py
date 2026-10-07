"""Lane aggregates. (The frontend computes the same thing live from Realtime
data; this endpoint serves AI context and API consumers.)"""
from fastapi import APIRouter, Depends

import db
from auth import current_user

router = APIRouter(prefix="/api/lanes", tags=["lanes"])


def aggregate(items: list[dict]) -> dict:
    active = [i for i in items if i.get("status") in ("active", "waiting_on")]
    if not active:
        return {"momentum": None, "trend": "flat", "color": "yellow"}
    avg = round(sum(i.get("momentum") or 0 for i in active) / len(active))
    votes = {"rising": 0, "flat": 0, "falling": 0}
    for i in active:
        votes[i.get("momentum_trend") or "flat"] += 1
    trend = max(votes, key=lambda k: (votes[k], k == "flat"))
    return {"momentum": avg, "trend": trend, "color": {"rising": "green", "falling": "red"}.get(trend, "yellow")}


@router.get("/summary")
async def summary(user=Depends(current_user)):
    uid = user["id"]
    lanes = await db.select_user("lanes", uid, {"archived_at": "is.null", "order": "sort_order.asc"})
    goals = await db.select_user("goals", uid)
    tasks = await db.select_user("tasks", uid)
    chunks = await db.select_user("chunks", uid, {"completed_at": "is.null", "skipped_at": "is.null"})
    goal_lane = {g["id"]: g.get("lane_id") for g in goals}
    task_lane = {t["id"]: t.get("lane_id") or goal_lane.get(t.get("goal_id")) for t in tasks}
    out = []
    for lane in lanes:
        lid = lane["id"]
        items = [g for g in goals if g.get("lane_id") == lid] + [t for t in tasks if task_lane.get(t["id"]) == lid]
        lane_chunks = [c for c in chunks if (c.get("lane_id") or task_lane.get(c.get("task_id")) or goal_lane.get(c.get("goal_id"))) == lid]
        last = max((i.get("last_interaction") or "" for i in items), default=None) or None
        out.append({**lane, **aggregate(items), "last_activity": last, "active_chunks": len(lane_chunks)})
    return out
