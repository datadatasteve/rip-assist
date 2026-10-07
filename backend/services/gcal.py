"""Google Calendar client (V1: read-only).

Stores only event id, title, start, end, calendar id. No descriptions or
attendees. Refresh token lives in Supabase Vault.
"""
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx

import config
import db

SCOPES = "https://www.googleapis.com/auth/calendar.readonly openid email"
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
API = "https://www.googleapis.com/calendar/v3"


class NotConnected(Exception):
    pass


def configured() -> bool:
    return bool(config.GOOGLE_CLIENT_ID and config.GOOGLE_CLIENT_SECRET)


def auth_url(state: str) -> str:
    return AUTH_URL + "?" + urlencode({
        "client_id": config.GOOGLE_CLIENT_ID,
        "redirect_uri": config.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",  # guarantees a refresh token on reconnect
        "include_granted_scopes": "true",
        "state": state,
    })


async def exchange_code(user_id: str, code: str) -> dict:
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(TOKEN_URL, data={
            "code": code, "client_id": config.GOOGLE_CLIENT_ID, "client_secret": config.GOOGLE_CLIENT_SECRET,
            "redirect_uri": config.GOOGLE_REDIRECT_URI, "grant_type": "authorization_code",
        })
        r.raise_for_status()
        tok = r.json()
        email = None
        try:
            ui = await c.get("https://openidconnect.googleapis.com/v1/userinfo",
                             headers={"Authorization": f"Bearer {tok['access_token']}"})
            email = ui.json().get("email")
        except Exception:
            pass
    if not tok.get("refresh_token"):
        raise RuntimeError("Google did not return a refresh token; remove app access in your Google account and reconnect.")
    await db.rpc("gcal_store_refresh_token", {"p_user": user_id, "p_token": tok["refresh_token"], "p_email": email})
    return {"email": email}


async def _access_token(user_id: str) -> str:
    refresh = await db.rpc("gcal_get_refresh_token", {"p_user": user_id})
    if not refresh:
        raise NotConnected()
    async with httpx.AsyncClient(timeout=20) as c:
        r = await c.post(TOKEN_URL, data={
            "refresh_token": refresh, "client_id": config.GOOGLE_CLIENT_ID,
            "client_secret": config.GOOGLE_CLIENT_SECRET, "grant_type": "refresh_token",
        })
    if r.status_code != 200:
        raise RuntimeError(f"token refresh failed: {r.text[:200]}")
    return r.json()["access_token"]


async def sync_user(user_id: str) -> dict:
    """Pull today + next 7 days from every enabled calendar."""
    conn_rows = await db.select_user("calendar_connections", user_id)
    if not conn_rows:
        raise NotConnected()
    conn = conn_rows[0]
    token = await _access_token(user_id)
    headers = {"Authorization": f"Bearer {token}"}

    now = datetime.now(timezone.utc)
    t_min = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=1)  # tz slack
    t_max = now + timedelta(days=8)

    async with httpx.AsyncClient(timeout=30, headers=headers) as c:
        r = await c.get(f"{API}/users/me/calendarList", params={"minAccessRole": "reader"})
        r.raise_for_status()
        remote = r.json().get("items", [])
        existing = {cal["id"]: cal for cal in (conn.get("calendars") or [])}
        calendars = []
        for cal in remote:
            prev = existing.get(cal["id"], {})
            calendars.append({
                "id": cal["id"], "name": cal.get("summaryOverride") or cal.get("summary"),
                "color": cal.get("backgroundColor"), "primary": bool(cal.get("primary")),
                "lane_id": prev.get("lane_id"),
                "enabled": prev.get("enabled", bool(cal.get("selected", True))),
            })

        rows, seen = [], set()
        for cal in calendars:
            if not cal["enabled"]:
                continue
            page = None
            while True:
                params = {"timeMin": t_min.isoformat(), "timeMax": t_max.isoformat(), "singleEvents": "true",
                          "orderBy": "startTime", "maxResults": "250",
                          "fields": "nextPageToken,items(id,summary,start,end,status)"}
                if page:
                    params["pageToken"] = page
                er = await c.get(f"{API}/calendars/{cal['id']}/events", params=params)
                if er.status_code != 200:
                    break
                data = er.json()
                for ev in data.get("items", []):
                    if ev.get("status") == "cancelled":
                        continue
                    s, e = ev.get("start", {}), ev.get("end", {})
                    all_day = "date" in s
                    start = s.get("dateTime") or f"{s.get('date')}T00:00:00+00:00"
                    end = e.get("dateTime") or f"{e.get('date')}T00:00:00+00:00"
                    rows.append({"user_id": user_id, "gcal_event_id": ev["id"], "calendar_id": cal["id"],
                                 "title": ev.get("summary") or "(busy)", "start_at": start, "end_at": end,
                                 "all_day": all_day, "synced_at": now.isoformat()})
                    seen.add((cal["id"], ev["id"]))
                page = data.get("nextPageToken")
                if not page:
                    break

    if rows:
        await db.insert("gcal_events", rows, upsert_on="user_id,calendar_id,gcal_event_id")
    # drop events in the window that no longer exist (or belong to disabled calendars)
    stale = await db.select_user("gcal_events", user_id, {"start_at": f"gte.{t_min.isoformat()}", "select": "id,calendar_id,gcal_event_id"})
    gone = [ev["id"] for ev in stale if (ev["calendar_id"], ev["gcal_event_id"]) not in seen]
    for i in range(0, len(gone), 100):
        await db.delete_in("gcal_events", user_id, "id", gone[i:i + 100])
    await db.update("calendar_connections", user_id, {}, {"calendars": calendars, "last_synced_at": now.isoformat()})
    return {"events": len(rows), "calendars": len(calendars)}


async def sync_all() -> dict:
    out = {}
    for row in await db.select("calendar_connections", {"select": "user_id"}):
        try:
            out[row["user_id"]] = await sync_user(row["user_id"])
        except Exception as e:  # noqa: BLE001
            out[row["user_id"]] = {"error": str(e)[:200]}
    return out


async def create_event(user_id: str, *args, **kwargs):
    """V2: write chunks to Google Calendar. Not implemented in V1 (read-only scope)."""
    raise NotImplementedError("Google Calendar write is a V2 feature")
