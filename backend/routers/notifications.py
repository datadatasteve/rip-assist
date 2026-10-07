"""Web Push subscription management + test sends."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import config
import db
from auth import current_user
from services import push

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("/vapid-public-key")
async def vapid_public_key():
    if not config.VAPID_PUBLIC_KEY:
        raise HTTPException(503, "VAPID keys not configured")
    return {"key": config.VAPID_PUBLIC_KEY}


class SubscribeIn(BaseModel):
    subscription: dict
    device_label: str | None = None


@router.post("/subscribe")
async def subscribe(body: SubscribeIn, user=Depends(current_user)):
    uid = user["id"]
    endpoint = body.subscription.get("endpoint")
    if not endpoint:
        raise HTTPException(400, "subscription.endpoint missing")
    # one row per endpoint: replace if this device re-subscribes
    for s in await db.select_user("push_subscriptions", uid):
        if s["subscription"].get("endpoint") == endpoint:
            await db.delete("push_subscriptions", uid, {"id": s["id"]})
    row = await db.insert("push_subscriptions", {"user_id": uid, "device_label": body.device_label,
                                                 "subscription": body.subscription})
    return row[0]


class UnsubscribeIn(BaseModel):
    endpoint: str


@router.post("/unsubscribe")
async def unsubscribe(body: UnsubscribeIn, user=Depends(current_user)):
    uid = user["id"]
    for s in await db.select_user("push_subscriptions", uid):
        if s["subscription"].get("endpoint") == body.endpoint:
            await db.delete("push_subscriptions", uid, {"id": s["id"]})
    return {"ok": True}


class TestIn(BaseModel):
    type: str = "test"


@router.post("/test")
async def test(body: TestIn, user=Depends(current_user)):
    titles = {
        "test": ("rip-assist test", "Push is working on this device.", "#/"),
        "checkin_reminder": ("Quick check-in?", "How's today going? Takes 20 seconds.", "#/checkin?trigger=scheduled"),
        "momentum_alert": ("Momentum dropping", "A task just went red.", "#/tasks"),
        "waiting_followup": ("Still blocked?", "Something has been waiting 7+ days. Reach out?", "#/tasks"),
        "plan_infeasible": ("Today's plan doesn't fit", "Want a re-plan?", "#/?replan=1"),
    }
    t, b, url = titles.get(body.type, titles["test"])
    result = await push.notify(user["id"], body.type if body.type in push.NOTIFICATION_TYPES else "test", t, b, url)
    return {"sent": result, "webpush_configured": push.WebPushChannel.configured()}
