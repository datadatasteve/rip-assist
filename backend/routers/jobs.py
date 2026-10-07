"""Cron-triggered jobs (Supabase pg_cron → pg_net → here). Protected by X-Cron-Secret."""
from fastapi import APIRouter, Depends, HTTPException

import db
from auth import require_cron
from routers import checkins, habits
from services import gcal, momentum

router = APIRouter(prefix="/api/jobs", tags=["jobs"], dependencies=[Depends(require_cron)])


async def _hourly() -> dict:
    out = {"momentum": await momentum.run_decay(), "habits": {}}
    for uid in await db.all_user_ids():
        try:
            out["habits"][uid] = await habits.recompute_user(uid)
        except Exception as e:  # noqa: BLE001
            out["habits"][uid] = str(e)[:200]
    return out


JOBS = {
    "momentum-decay": _hourly,
    "calendar-sync": gcal.sync_all,
    "checkin-dispatch": checkins.dispatch_all,
}


@router.post("/{name}")
async def run(name: str):
    job = JOBS.get(name)
    if not job:
        raise HTTPException(404, "unknown job")
    return {"job": name, "result": await job()}
