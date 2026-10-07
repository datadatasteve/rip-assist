"""Task/goal/chunk endpoints that need server logic. Plain CRUD goes
frontend → Supabase directly (RLS), so it isn't duplicated here."""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import db
from auth import current_user
from services import momentum, scheduler

router = APIRouter(prefix="/api", tags=["tasks"])


class MomentumEvent(BaseModel):
    entity_type: Literal["task", "goal", "chunk"]
    entity_id: str
    event: str


@router.post("/momentum/event")
async def momentum_event(body: MomentumEvent, user=Depends(current_user)):
    try:
        return await momentum.apply_event(user["id"], body.entity_type, body.entity_id, body.event)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/momentum/recompute")
async def momentum_recompute(user=Depends(current_user)):
    """Run the decay pass for just this user (Momentum Inspector button)."""
    return await momentum.run_decay_for_user(user["id"])


@router.get("/suggestions")
async def get_suggestions(limit: int = 8, user=Depends(current_user)):
    return await scheduler.suggestions(user["id"], limit)


@router.get("/feasibility")
async def get_feasibility(user=Depends(current_user)):
    return await scheduler.maybe_offer_replan(user["id"])


@router.get("/momentum/inspector")
async def inspector(user=Depends(current_user)):
    uid = user["id"]
    out = []
    for kind, table in (("goal", "goals"), ("task", "tasks")):
        for it in await db.select_user(table, uid, {"order": "momentum.asc"}):
            out.append({
                "kind": kind, "id": it["id"], "title": it["title"], "status": it["status"],
                "momentum": it["momentum"], "trend": it.get("momentum_trend"), "color": momentum.color_for(it),
                "last_interaction": it.get("last_interaction"), "decay_threshold_days": it.get("decay_threshold_days"),
                "decay_applied_on": it.get("decay_applied_on"), "low_since": it.get("low_since"),
                "suggestion_score": momentum.suggestion_score(it), "due_date": it.get("due_date"),
            })
    return out
