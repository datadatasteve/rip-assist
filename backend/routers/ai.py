"""AI endpoints: suggestions, re-plan, chunk decomposition, momentum review,
model registry tools, agent config versioning."""
import json
import os
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import config
import db
from auth import current_user
from services import ai_provider, scheduler
from services.ai_provider import AllProvidersFailed, parse_json
from services.prompts import DEFAULT_PROMPTS, DEFAULT_VERSION, FEATURES

router = APIRouter(prefix="/api/ai", tags=["ai"])


def _out(r: ai_provider.AIResponse, parsed=None) -> dict:
    return {
        "content": r.content, "parsed": parsed, "interaction_id": r.interaction_id, "provider": r.provider,
        "model": r.model, "latency_ms": r.latency_ms, "cost_usd": r.cost_usd,
        "agent_config_version": r.agent_config_version, "fallback_attempts": r.attempts,
    }


async def _run(uid: str, prompt: str, feature: str, want_json: bool = True) -> dict:
    try:
        r = await ai_provider.complete(uid, prompt, feature)
    except AllProvidersFailed as e:
        raise HTTPException(503, str(e))
    return _out(r, parse_json(r.content) if want_json else None)


async def _calendar_context(uid: str, settings: dict, include_details: bool) -> str:
    """Free time only by default. Event titles are shared with the AI only when the
    user explicitly opts in on that request."""
    f = await scheduler.feasibility(uid, settings)
    tz = scheduler.tz_of(settings)
    fmt = lambda iso: datetime.fromisoformat(iso).astimezone(tz).strftime("%H:%M")  # noqa: E731
    lines = [f"Free time remaining today: {f['free_minutes']} min. Free slots: "
             + (", ".join(f"{fmt(s['start'])}-{fmt(s['end'])}" for s in f["free_slots"]) or "none")]
    if include_details:
        now, start, end = scheduler.today_window(settings)
        events = await db.select_user("gcal_events", uid, {
            "start_at": f"lt.{end.isoformat()}", "end_at": f"gt.{start.isoformat()}", "order": "start_at.asc",
        })
        if events:
            lines.append("Calendar events: " + "; ".join(f"{fmt(e['start_at'])}-{fmt(e['end_at'])} {e['title']}" for e in events))
    return "\n".join(lines)


class CalOpt(BaseModel):
    include_calendar_details: bool = False


@router.post("/suggest")
async def suggest(body: CalOpt, user=Depends(current_user)):
    uid = user["id"]
    settings = await scheduler.get_settings(uid)
    s = await scheduler.suggestions(uid, limit=8)
    if not s["suggestions"]:
        return {"parsed": None, "content": "Nothing active yet. Add a task or goal first.", "candidates": [], "interaction_id": None}
    now = datetime.now(scheduler.tz_of(settings))
    cands = [{k: c.get(k) for k in ("ref_id", "title", "parent_title", "minutes", "score", "reasons", "kind")} for c in s["suggestions"]]
    prompt = (
        f"Current local time: {now.strftime('%a %H:%M')}.\n"
        f"{await _calendar_context(uid, settings, body.include_calendar_details)}\n"
        f"{('Lane balance: ' + s['lane_balance_flag']) if s['lane_balance_flag'] else ''}\n"
        f"Ranked candidates (higher score = more important/momentum):\n{json.dumps(cands, indent=1)}"
    )
    out = await _run(uid, prompt, "suggestion")
    out["candidates"] = s["suggestions"]
    out["lane_balance_flag"] = s["lane_balance_flag"]
    return out


@router.post("/replan")
async def replan(body: CalOpt, user=Depends(current_user)):
    uid = user["id"]
    settings = await scheduler.get_settings(uid)
    tz = scheduler.tz_of(settings)
    chunks = await scheduler.todays_chunks(uid, settings)
    remaining = [c for c in chunks if not c.get("completed_at") and not c.get("skipped_at")]
    s = await scheduler.suggestions(uid, limit=12)
    items = [{"ref_id": c["id"], "title": c["title"], "minutes": c["duration_minutes"],
              "currently_at": datetime.fromisoformat(c["scheduled_start"]).astimezone(tz).strftime("%H:%M")} for c in remaining]
    backlog = [{"ref_id": c.get("chunk_id") or c["ref_id"], "title": c["title"], "minutes": c["minutes"], "score": c["score"]}
               for c in s["suggestions"] if c.get("chunk_id") not in {r["ref_id"] for r in items}]
    prompt = (
        f"Current local time: {datetime.now(tz).strftime('%H:%M')}. Workday ends {str(settings.get('workday_end'))[:5]}.\n"
        f"{await _calendar_context(uid, settings, body.include_calendar_details)}\n"
        f"Already scheduled today (not done): {json.dumps(items)}\n"
        f"Other candidates by priority: {json.dumps(backlog[:8])}\n"
        "Produce a realistic plan for the rest of today."
    )
    return await _run(uid, prompt, "schedule")


class DecomposeIn(BaseModel):
    goal_id: str | None = None
    text: str | None = None
    total_minutes: int | None = None
    days: int = 7
    include_calendar_details: bool = False


@router.post("/decompose")
async def decompose(body: DecomposeIn, user=Depends(current_user)):
    uid = user["id"]
    title = body.text
    if body.goal_id:
        g = await db.get_one("goals", uid, body.goal_id) or await db.get_one("tasks", uid, body.goal_id)
        if not g:
            raise HTTPException(404, "goal/task not found")
        title = f"{g['title']}. {g.get('description') or ''}"
    if not title:
        raise HTTPException(400, "goal_id or text required")
    settings = await scheduler.get_settings(uid)
    prompt = (
        f"Goal: {title}\n"
        f"{'Total time: ' + str(body.total_minutes) + ' minutes' if body.total_minutes else 'Infer a sensible total time from the goal.'}\n"
        f"Days available: {body.days} (day_offset 0 = today).\n"
        f"Workday: {str(settings.get('workday_start'))[:5]}-{str(settings.get('workday_end'))[:5]}.\n"
        + (await _calendar_context(uid, settings, True) if body.include_calendar_details else "")
    )
    return await _run(uid, prompt, "chunk_decompose")


@router.post("/momentum-review")
async def momentum_review(user=Depends(current_user)):
    uid = user["id"]
    tasks = await db.select_user("tasks", uid, {"status": "in.(active,waiting_on)"})
    goals = await db.select_user("goals", uid, {"status": "in.(active,waiting_on)"})
    hist = [{"title": t["title"], "status": t["status"], "momentum": t["momentum"], "trend": t.get("momentum_trend"),
             "last_interaction": t.get("last_interaction"), "waiting_on": t.get("waiting_on_whom"),
             "threshold_days": t.get("decay_threshold_days")} for t in tasks + goals]
    prompt = f"Now: {datetime.utcnow().isoformat()}Z\nItems:\n{json.dumps(hist, indent=1)}"
    return await _run(uid, prompt, "momentum")


# ---------------------------------------------------------------------------
# registry tools
# ---------------------------------------------------------------------------

@router.get("/health")
async def health(user=Depends(current_user)):
    ollama = await ai_provider.list_ollama_models()
    keys = {p: bool(os.getenv(k)) for p, (_, k, _) in ai_provider.PROVIDER_DEFAULTS.items()}
    return {"ollama": ollama, "provider_keys_present": keys, "tailnet_proxy": bool(config.OLLAMA_PROXY),
            "default_ollama_model": config.OLLAMA_DEFAULT_MODEL}


@router.get("/models")
async def models(user=Depends(current_user)):
    return await ai_provider.get_registry(user["id"])


@router.post("/models/import-ollama")
async def import_ollama(user=Depends(current_user)):
    uid = user["id"]
    found = await ai_provider.list_ollama_models()
    have = {c["model_name"] for c in await ai_provider.get_registry(uid) if c["provider"] == "ollama"}
    new = [{"user_id": uid, "provider": "ollama", "model_name": m, "enabled": False, "priority_order": 60}
           for m in found["models"] if m not in have]
    if new:
        await db.insert("model_configs", new)
    return {"endpoint": found["endpoint"], "added": [n["model_name"] for n in new], "available": found["models"]}


@router.post("/models/{config_id}/test")
async def test_model(config_id: str, user=Depends(current_user)):
    try:
        r = await ai_provider.complete(user["id"], "Reply with exactly: pong", "benchmark",
                                       system="You are a connectivity test. Follow instructions exactly.", config_id=config_id)
    except AllProvidersFailed as e:
        return {"ok": False, "error": e.attempts[0]["error"] if e.attempts else str(e)}
    return {"ok": True, "latency_ms": r.latency_ms, "reply": r.content[:200], "provider": r.provider, "model": r.model}


@router.post("/models/{config_id}/make-default")
async def make_default(config_id: str, user=Depends(current_user)):
    """Put this config first globally (priority 1) and enable it."""
    uid = user["id"]
    reg = await ai_provider.get_registry(uid)
    if not any(c["id"] == config_id for c in reg):
        raise HTTPException(404, "config not found")
    for c in reg:
        if c["id"] == config_id:
            await db.update("model_configs", uid, {"id": c["id"]}, {"priority_order": 1, "enabled": True})
        elif (c.get("priority_order") or 999) <= 1:
            await db.update("model_configs", uid, {"id": c["id"]}, {"priority_order": 2})
    return {"ok": True}


# ---------------------------------------------------------------------------
# agent configs (system prompts, semver)
# ---------------------------------------------------------------------------

@router.get("/agents")
async def agents(user=Depends(current_user)):
    rows = await db.select_user("agent_configs", user["id"], {"order": "created_at.desc"})
    return {
        "features": FEATURES,
        "defaults": {f: {"system_prompt": p, "version": DEFAULT_VERSION} for f, p in DEFAULT_PROMPTS.items()},
        "versions": rows,
    }


def _bump(v: str, kind: str) -> str:
    try:
        major, minor, patch = (int(x) for x in v.split("."))
    except ValueError:
        major, minor, patch = 1, 0, 0
    if kind == "major":
        return f"{major + 1}.0.0"
    if kind == "minor":
        return f"{major}.{minor + 1}.0"
    return f"{major}.{minor}.{patch + 1}"


class AgentIn(BaseModel):
    feature: str
    system_prompt: str
    bump: Literal["patch", "minor", "major"] = "patch"
    notes: str | None = None


@router.post("/agents")
async def save_agent(body: AgentIn, user=Depends(current_user)):
    uid = user["id"]
    if body.feature not in FEATURES:
        raise HTTPException(400, "unknown feature")
    existing = await db.select_user("agent_configs", uid, {"feature": f"eq.{body.feature}", "select": "version"})

    def key(v: str):
        try:
            return tuple(int(x) for x in v.split("."))
        except ValueError:
            return (0, 0, 0)
    current = max([r["version"] for r in existing] + [DEFAULT_VERSION], key=key)
    version = _bump(current, body.bump)
    await db.client().patch("/agent_configs", params={"user_id": f"eq.{uid}", "feature": f"eq.{body.feature}"},
                            json={"active": False})
    row = await db.insert("agent_configs", {"user_id": uid, "feature": body.feature, "system_prompt": body.system_prompt,
                                            "version": version, "active": True, "notes": body.notes})
    return row[0]


@router.post("/agents/{agent_id}/activate")
async def activate_agent(agent_id: str, user=Depends(current_user)):
    uid = user["id"]
    a = await db.get_one("agent_configs", uid, agent_id)
    if not a:
        raise HTTPException(404, "not found")
    await db.client().patch("/agent_configs", params={"user_id": f"eq.{uid}", "feature": f"eq.{a['feature']}"},
                            json={"active": False})
    await db.update("agent_configs", uid, {"id": agent_id}, {"active": True})
    return {"ok": True}


@router.post("/agents/{feature}/reset")
async def reset_agent(feature: str, user=Depends(current_user)):
    """Deactivate all overrides → built-in default prompt is used again."""
    await db.client().patch("/agent_configs", params={"user_id": f"eq.{user['id']}", "feature": f"eq.{feature}"},
                            json={"active": False})
    return {"ok": True}
