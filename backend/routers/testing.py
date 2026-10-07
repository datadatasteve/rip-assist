"""Benchmark runner. Scenarios are static JSON; responses are stored in
benchmark_runs and scored by hand in the Dev Dashboard (rubric P/F)."""
import asyncio
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import db
from auth import current_user
from services import ai_provider

router = APIRouter(prefix="/api/testing", tags=["testing"])

SCENARIOS = json.loads((Path(__file__).resolve().parent.parent / "data" / "benchmarks.json").read_text())
BY_ID = {s["id"]: s for s in SCENARIOS}


@router.get("/scenarios")
async def scenarios(user=Depends(current_user)):
    return SCENARIOS


class RunIn(BaseModel):
    scenario_ids: list[str]
    model_config_ids: list[str]
    run_group: str | None = None  # the UI sends one pair per request and reuses the group id


async def _one(uid: str, scenario: dict, cfg: dict, group: str) -> dict:
    system, version = await ai_provider.get_agent(uid, scenario["feature"])
    try:
        r = await ai_provider.complete(uid, scenario["prompt"], "benchmark", system=system, config_id=cfg["id"])
        response, latency = r.content, r.latency_ms
    except ai_provider.AllProvidersFailed as e:
        response, latency = f"[ERROR] {e.attempts[0]['error'] if e.attempts else e}", None
    row = await db.insert("benchmark_runs", {
        "user_id": uid, "scenario_id": scenario["id"], "provider": cfg["provider"], "model": cfg["model_name"],
        "agent_config_version": f"{scenario['feature']}@{version}", "prompt": scenario["prompt"], "response": response,
        "rubric_scores": {c: None for c in scenario["rubric"]}, "rubric_total": None, "rubric_max": len(scenario["rubric"]),
        "latency_ms": latency, "run_group": group,
    })
    return row[0]


@router.post("/run")
async def run(body: RunIn, user=Depends(current_user)):
    uid = user["id"]
    reg = {c["id"]: c for c in await ai_provider.get_registry(uid)}
    cfgs = [reg[i] for i in body.model_config_ids if i in reg]
    scen = [BY_ID[i] for i in body.scenario_ids if i in BY_ID]
    if not cfgs or not scen:
        raise HTTPException(400, "pick at least one scenario and one model")
    group = body.run_group or str(uuid.uuid4())
    results = []
    # providers in parallel, scenarios sequential per provider (keeps local Ollama from thrashing)
    async def per_cfg(cfg):
        out = []
        for s in scen:
            for _ in range(s.get("repeat", 1)):
                out.append(await _one(uid, s, cfg, group))
        return out
    for chunk in await asyncio.gather(*(per_cfg(c) for c in cfgs)):
        results.extend(chunk)
    return {"run_group": group, "runs": results}
