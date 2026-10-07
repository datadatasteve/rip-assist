"""Thin async PostgREST client using the service key.

The service key bypasses RLS, so every query that touches user data MUST filter
by user_id explicitly. Helpers below take user_id as a required argument for
that reason.
"""
from typing import Any

import httpx

import config

_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            base_url=f"{config.SUPABASE_URL}/rest/v1",
            headers={
                "apikey": config.SUPABASE_SERVICE_KEY,
                "Authorization": f"Bearer {config.SUPABASE_SERVICE_KEY}",
                "Content-Type": "application/json",
            },
            timeout=20,
        )
    return _client


async def close() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


def _raise(r: httpx.Response) -> None:
    if r.status_code >= 400:
        raise RuntimeError(f"Supabase {r.request.method} {r.request.url.path} -> {r.status_code}: {r.text[:300]}")


async def select(table: str, params: dict[str, str] | None = None) -> list[dict[str, Any]]:
    """params are raw PostgREST query params, e.g. {"user_id": "eq.<id>", "select": "*"}."""
    p = {"select": "*", **(params or {})}
    r = await client().get(f"/{table}", params=p)
    _raise(r)
    return r.json()


async def select_user(table: str, user_id: str, params: dict[str, str] | None = None) -> list[dict[str, Any]]:
    return await select(table, {"user_id": f"eq.{user_id}", **(params or {})})


async def get_one(table: str, user_id: str, row_id: str) -> dict[str, Any] | None:
    rows = await select_user(table, user_id, {"id": f"eq.{row_id}"})
    return rows[0] if rows else None


async def insert(table: str, data: dict | list, upsert_on: str | None = None) -> list[dict[str, Any]]:
    headers = {"Prefer": "return=representation"}
    params = {}
    if upsert_on:
        headers["Prefer"] += ",resolution=merge-duplicates"
        params["on_conflict"] = upsert_on
    r = await client().post(f"/{table}", json=data, headers=headers, params=params)
    _raise(r)
    return r.json()


async def update(table: str, user_id: str, match: dict[str, str], data: dict) -> list[dict[str, Any]]:
    params = {"user_id": f"eq.{user_id}", **{k: f"eq.{v}" for k, v in match.items()}}
    r = await client().patch(f"/{table}", json=data, params=params, headers={"Prefer": "return=representation"})
    _raise(r)
    return r.json()


async def delete(table: str, user_id: str, match: dict[str, str]) -> None:
    params = {"user_id": f"eq.{user_id}", **{k: f"eq.{v}" for k, v in match.items()}}
    r = await client().delete(f"/{table}", params=params)
    _raise(r)


async def delete_in(table: str, user_id: str, column: str, values: list[str]) -> None:
    if not values:
        return
    params = {"user_id": f"eq.{user_id}", column: f"in.({','.join(values)})"}
    r = await client().delete(f"/{table}", params=params)
    _raise(r)


async def rpc(fn: str, args: dict) -> Any:
    r = await client().post(f"/rpc/{fn}", json=args)
    _raise(r)
    return r.json() if r.content else None


async def all_user_ids() -> list[str]:
    """Users with settings rows (created on first app load). Used by cron jobs."""
    rows = await select("user_settings", {"select": "user_id"})
    return [r["user_id"] for r in rows]
