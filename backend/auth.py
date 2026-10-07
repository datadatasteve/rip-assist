"""Request authentication.

The frontend sends the Supabase access token as a Bearer token. We validate it
by asking Supabase Auth who it belongs to (works with both legacy HS256 and the
newer asymmetric signing keys), caching the answer briefly.
"""
import hashlib
import hmac
import time

import httpx
from fastapi import Header, HTTPException

import config

_cache: dict[str, tuple[float, dict]] = {}
_TTL = 60


async def current_user(authorization: str = Header(default="")) -> dict:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization[7:].strip()
    key = hashlib.sha256(token.encode()).hexdigest()
    hit = _cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]

    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(
            f"{config.SUPABASE_URL}/auth/v1/user",
            headers={"apikey": config.SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
        )
    if r.status_code != 200:
        raise HTTPException(401, "Invalid or expired session")
    user = r.json()
    _cache[key] = (time.time() + _TTL, user)
    if len(_cache) > 500:
        now = time.time()
        for k in [k for k, v in _cache.items() if v[0] < now]:
            _cache.pop(k, None)
    return user


def require_cron(x_cron_secret: str = Header(default="")) -> None:
    if not config.CRON_SECRET or not hmac.compare_digest(x_cron_secret, config.CRON_SECRET):
        raise HTTPException(403, "Bad cron secret")


# --- signed state for OAuth round trips -------------------------------------

def sign(value: str, max_age: int = 600) -> str:
    exp = str(int(time.time()) + max_age)
    mac = hmac.new(config.SECRET_KEY.encode(), f"{value}.{exp}".encode(), hashlib.sha256).hexdigest()[:32]
    return f"{value}.{exp}.{mac}"


def unsign(signed: str) -> str:
    try:
        value, exp, mac = signed.rsplit(".", 2)
    except ValueError:
        raise HTTPException(400, "Bad state")
    good = hmac.new(config.SECRET_KEY.encode(), f"{value}.{exp}".encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(mac, good) or int(exp) < time.time():
        raise HTTPException(400, "Expired or tampered state")
    return value
