"""Provider abstraction + registry.

Callers use `complete(user_id, system, user, feature)` and never name a
provider. Every provider speaks the OpenAI-compatible chat completions format.
Every attempt (success or failure) is logged to ai_interactions.
"""
import hashlib
import json
import os
import random
import re
import time
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx

import config
import db
from services.prompts import DEFAULT_PROMPTS, DEFAULT_VERSION

FREE_PROVIDERS = {"ollama", "groq", "gemini", "openrouter", "cloudflare"}

# Defaults used when seeding a user's model registry.
PROVIDER_DEFAULTS = {
    "groq": ("https://api.groq.com/openai/v1", "GROQ_API_KEY", "llama-3.3-70b-versatile"),
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai", "GEMINI_API_KEY", "gemini-2.5-flash"),
    "openrouter": ("https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", "meta-llama/llama-3.3-70b-instruct:free"),
    "cloudflare": (
        "https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1",
        "CLOUDFLARE_AI_API_KEY",
        "@cf/meta/llama-3.1-8b-instruct",
    ),
    "claude": ("https://api.anthropic.com/v1", "ANTHROPIC_API_KEY", "claude-haiku-4-5"),
    "openai": ("https://api.openai.com/v1", "OPENAI_API_KEY", "gpt-4o-mini"),
}
# Every local model gets registered; only the default is enabled at first.
OLLAMA_SEED_MODELS = ["qwen2.5:14b", "qwen2.5:7b", "qwen2.5:32b", "llama3.1:8b", "llama3.2:3b", "gpt-oss:20b"]


@dataclass
class AIResponse:
    content: str
    provider: str
    model: str
    latency_ms: int
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    interaction_id: str | None = None
    agent_config_version: str | None = None
    attempts: list[dict] = field(default_factory=list)

    def json(self) -> dict | list | None:
        return parse_json(self.content)


class AllProvidersFailed(Exception):
    def __init__(self, attempts: list[dict]):
        self.attempts = attempts
        super().__init__("All AI providers failed: " + "; ".join(f"{a['provider']}/{a['model']}: {a['error']}" for a in attempts))


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def parse_json(text: str):
    """Lenient JSON extraction: handles ```json fences and leading prose."""
    if not text:
        return None
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.S)
    try:
        return json.loads(t)
    except Exception:
        pass
    m = re.search(r"(\{.*\}|\[.*\])", t, re.S)
    if m:
        try:
            return json.loads(m.group(1))
        except Exception:
            return None
    return None


def _cost(provider: str, inp: int, out: int) -> float:
    if provider in FREE_PROVIDERS:
        return 0.0
    rates = config.PRICING.get(provider)
    if not rates:
        return 0.0
    return round((inp * rates["input"] + out * rates["output"]) / 1_000_000, 6)


def _resolve_base(cfg: dict) -> str:
    url = (cfg.get("endpoint_url") or "").strip()
    if not url and cfg["provider"] in PROVIDER_DEFAULTS:
        url = PROVIDER_DEFAULTS[cfg["provider"]][0]
    return url.replace("{CLOUDFLARE_ACCOUNT_ID}", os.getenv("CLOUDFLARE_ACCOUNT_ID", "")).rstrip("/")


def _proxy_for(url: str) -> str | None:
    host = urlparse(url).hostname or ""
    # Only tailnet addresses go through the tailscaled userspace proxy.
    if config.OLLAMA_PROXY and (host.startswith("100.") or host.endswith(".ts.net")):
        return config.OLLAMA_PROXY
    return None


_ollama_reach: dict[str, tuple[float, bool]] = {}


async def ollama_reachable(endpoint: str) -> bool:
    hit = _ollama_reach.get(endpoint)
    if hit and hit[0] > time.time():
        return hit[1]
    ok = False
    try:
        async with httpx.AsyncClient(timeout=2.5, proxy=_proxy_for(endpoint)) as c:
            r = await c.get(f"{endpoint}/api/tags")
            ok = r.status_code == 200
    except Exception:
        ok = False
    _ollama_reach[endpoint] = (time.time() + 30, ok)
    return ok


async def resolve_ollama_endpoint(cfg: dict) -> str | None:
    """Explicit endpoint on the config wins; else Tailscale IP, then localhost."""
    candidates = [cfg.get("endpoint_url")] if cfg.get("endpoint_url") else [config.OLLAMA_ENDPOINT, config.OLLAMA_FALLBACK_ENDPOINT]
    for ep in dict.fromkeys(e.rstrip("/") for e in candidates if e):
        if await ollama_reachable(ep):
            return ep
    return None


async def list_ollama_models() -> dict:
    for ep in dict.fromkeys([config.OLLAMA_ENDPOINT, config.OLLAMA_FALLBACK_ENDPOINT]):
        try:
            async with httpx.AsyncClient(timeout=4, proxy=_proxy_for(ep)) as c:
                r = await c.get(f"{ep}/api/tags")
                if r.status_code == 200:
                    return {"endpoint": ep, "models": [m["name"] for m in r.json().get("models", [])]}
        except Exception:
            continue
    return {"endpoint": None, "models": []}


# ---------------------------------------------------------------------------
# registry
# ---------------------------------------------------------------------------

async def seed_registry(user_id: str) -> list[dict]:
    rows = []
    default = config.OLLAMA_DEFAULT_MODEL
    models = [default] + [m for m in OLLAMA_SEED_MODELS if m != default]
    for i, m in enumerate(models):
        rows.append({
            "user_id": user_id, "provider": "ollama", "model_name": m, "endpoint_url": None,
            "api_key_env_var": None, "enabled": m == default, "priority_order": 1 if m == default else 50 + i,
        })
    for i, (prov, (_, key, model)) in enumerate(PROVIDER_DEFAULTS.items()):
        rows.append({
            "user_id": user_id, "provider": prov, "model_name": model, "endpoint_url": None,
            "api_key_env_var": key, "enabled": bool(os.getenv(key)), "priority_order": 10 + i * 10,
        })
    return await db.insert("model_configs", rows)


async def get_registry(user_id: str) -> list[dict]:
    rows = await db.select_user("model_configs", user_id, {"order": "priority_order.asc.nullslast"})
    if not rows:
        rows = await seed_registry(user_id)
    return rows


def _feature_priority(cfg: dict, feature: str) -> int:
    overrides = cfg.get("per_feature_overrides") or {}
    if feature in overrides and overrides[feature] is not None:
        return int(overrides[feature])
    return cfg.get("priority_order") if cfg.get("priority_order") is not None else 999


def order_candidates(configs: list[dict], feature: str) -> list[dict]:
    """Sort by effective priority. Configs sharing a priority for a feature form an
    A/B slot and are shuffled so each request picks one at random first."""
    enabled = [c for c in configs if c.get("enabled")]
    buckets: dict[int, list[dict]] = {}
    for c in enabled:
        buckets.setdefault(_feature_priority(c, feature), []).append(c)
    ordered = []
    for p in sorted(buckets):
        group = buckets[p][:]
        random.shuffle(group)
        ordered.extend(group)
    return ordered


async def get_agent(user_id: str, feature: str) -> tuple[str, str]:
    rows = await db.select_user(
        "agent_configs", user_id, {"feature": f"eq.{feature}", "active": "eq.true", "order": "created_at.desc", "limit": "1"}
    )
    if rows:
        return rows[0]["system_prompt"], rows[0]["version"]
    return DEFAULT_PROMPTS.get(feature, DEFAULT_PROMPTS["benchmark"]), DEFAULT_VERSION


# ---------------------------------------------------------------------------
# calling
# ---------------------------------------------------------------------------

async def _call(cfg: dict, system: str, user: str) -> AIResponse:
    provider = cfg["provider"]
    model = cfg["model_name"]
    headers = {"Content-Type": "application/json"}
    if provider == "ollama":
        base = await resolve_ollama_endpoint(cfg)
        if not base:
            raise RuntimeError("Ollama not reachable")
        url = f"{base}/v1/chat/completions"
        timeout = 180
    else:
        key_var = cfg.get("api_key_env_var") or PROVIDER_DEFAULTS.get(provider, (None, None, None))[1]
        key = os.getenv(key_var or "", "")
        if not key:
            raise RuntimeError(f"env var {key_var} not set")
        headers["Authorization"] = f"Bearer {key}"
        if provider == "claude":
            headers["x-api-key"] = key
            headers["anthropic-version"] = "2023-06-01"
        if provider == "openrouter":
            headers["HTTP-Referer"] = config.FRONTEND_URL
            headers["X-Title"] = "rip-assist"
        base = _resolve_base(cfg)
        if not base:
            raise RuntimeError("no endpoint configured")
        url = f"{base}/chat/completions"
        timeout = 60

    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": 0.4,
        "max_tokens": 1500,
    }
    t0 = time.perf_counter()
    async with httpx.AsyncClient(timeout=timeout, proxy=_proxy_for(url)) as c:
        r = await c.post(url, json=body, headers=headers)
    latency = int((time.perf_counter() - t0) * 1000)
    if r.status_code >= 400:
        raise RuntimeError(f"HTTP {r.status_code}: {r.text[:200]}")
    data = r.json()
    content = data["choices"][0]["message"].get("content") or ""
    usage = data.get("usage") or {}
    inp = int(usage.get("prompt_tokens") or 0)
    out = int(usage.get("completion_tokens") or 0)
    return AIResponse(content=content, provider=provider, model=model, latency_ms=latency,
                      input_tokens=inp, output_tokens=out, cost_usd=_cost(provider, inp, out))


async def _log(user_id: str, cfg: dict, feature: str, system: str, user: str, version: str,
               resp: AIResponse | None, error: str | None, latency_ms: int) -> str | None:
    row = {
        "user_id": user_id,
        "provider": cfg["provider"],
        "model": cfg["model_name"],
        "feature": feature,
        "prompt_hash": hashlib.sha256(f"{system}\n---\n{user}".encode()).hexdigest(),
        "system_prompt": system,
        "user_prompt": user,
        "response": resp.content if resp else None,
        "latency_ms": resp.latency_ms if resp else latency_ms,
        "input_tokens": resp.input_tokens if resp else 0,
        "output_tokens": resp.output_tokens if resp else 0,
        "cost_usd": resp.cost_usd if resp else 0,
        "agent_config_version": version,
        "success": resp is not None,
        "error": error,
        "model_config_id": cfg.get("id"),
    }
    try:
        saved = await db.insert("ai_interactions", row)
        return saved[0]["id"] if saved else None
    except Exception:
        return None


async def complete(user_id: str, user: str, feature: str, *, system: str | None = None,
                   config_id: str | None = None) -> AIResponse:
    """Run a completion with provider fallback. If `system` is None, the active
    agent config for the feature is used (and its version tagged)."""
    if system is None:
        system, version = await get_agent(user_id, feature)
    else:
        version = (await get_agent(user_id, feature))[1]

    registry = await get_registry(user_id)
    if config_id:
        candidates = [c for c in registry if c["id"] == config_id]
    else:
        candidates = order_candidates(registry, feature)
    if not candidates:
        raise AllProvidersFailed([{"provider": "-", "model": "-", "error": "no enabled providers"}])

    attempts = []
    for cfg in candidates:
        t0 = time.perf_counter()
        try:
            resp = await _call(cfg, system, user)
        except Exception as e:  # noqa: BLE001 — fall through to next provider
            err = str(e)[:300]
            attempts.append({"provider": cfg["provider"], "model": cfg["model_name"], "error": err})
            await _log(user_id, cfg, feature, system, user, version, None, err, int((time.perf_counter() - t0) * 1000))
            continue
        resp.agent_config_version = version
        resp.attempts = attempts
        resp.interaction_id = await _log(user_id, cfg, feature, system, user, version, resp, None, resp.latency_ms)
        return resp
    raise AllProvidersFailed(attempts)
