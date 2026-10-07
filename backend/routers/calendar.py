"""Google Calendar (V1 read-only)."""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

import config
import db
from auth import current_user, sign, unsign
from services import gcal

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("/auth-url")
async def auth_url(user=Depends(current_user)):
    if not gcal.configured():
        raise HTTPException(503, "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured on the backend")
    return {"url": gcal.auth_url(sign(user["id"]))}


@router.get("/callback")
async def callback(code: str | None = None, state: str | None = None, error: str | None = None):
    """Google redirects the browser here; we store the token then bounce back to the app."""
    if error or not code or not state:
        return RedirectResponse(f"{config.FRONTEND_URL}#/settings?gcal=error&reason={error or 'missing_code'}")
    user_id = unsign(state)
    try:
        await gcal.exchange_code(user_id, code)
        await gcal.sync_user(user_id)
    except Exception as e:  # noqa: BLE001
        from urllib.parse import quote
        return RedirectResponse(f"{config.FRONTEND_URL}#/settings?gcal=error&reason={quote(str(e)[:120])}")
    return RedirectResponse(f"{config.FRONTEND_URL}#/settings?gcal=connected")


@router.post("/sync")
async def sync(user=Depends(current_user)):
    try:
        return await gcal.sync_user(user["id"])
    except gcal.NotConnected:
        return {"connected": False}


@router.post("/disconnect")
async def disconnect(user=Depends(current_user)):
    await db.rpc("gcal_disconnect", {"p_user": user["id"]})
    return {"ok": True}


@router.post("/events")
async def create_event(user=Depends(current_user)):
    try:
        await gcal.create_event(user["id"])
    except NotImplementedError as e:
        raise HTTPException(501, str(e))
