"""Environment-driven settings. Nothing secret is ever hardcoded."""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env first, then repo-root .env (first value wins).
_here = Path(__file__).resolve().parent
load_dotenv(_here / ".env")
load_dotenv(_here.parent / ".env")


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _float(name: str, default: float) -> float:
    try:
        return float(_env(name) or default)
    except ValueError:
        return default


SUPABASE_URL = _env("SUPABASE_URL").rstrip("/")
SUPABASE_ANON_KEY = _env("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = _env("SUPABASE_SERVICE_KEY")

OLLAMA_ENDPOINT = _env("OLLAMA_ENDPOINT", "http://localhost:11434").rstrip("/")
OLLAMA_FALLBACK_ENDPOINT = _env("OLLAMA_FALLBACK_ENDPOINT", "http://localhost:11434").rstrip("/")
OLLAMA_DEFAULT_MODEL = _env("OLLAMA_DEFAULT_MODEL", "qwen2.5:14b")
# Set automatically by start.sh when the container has joined the tailnet.
OLLAMA_PROXY = _env("OLLAMA_PROXY") or None

GOOGLE_CLIENT_ID = _env("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = _env("GOOGLE_CLIENT_SECRET")
# Must point at the BACKEND callback, e.g. https://rip-assist-api.fly.dev/api/calendar/callback
GOOGLE_REDIRECT_URI = _env("GOOGLE_REDIRECT_URI", "http://localhost:8000/api/calendar/callback")

VAPID_PUBLIC_KEY = _env("VAPID_PUBLIC_KEY")
VAPID_PRIVATE_KEY = _env("VAPID_PRIVATE_KEY")
VAPID_EMAIL = _env("VAPID_EMAIL")

SECRET_KEY = _env("SECRET_KEY", "dev-insecure-secret")
CRON_SECRET = _env("CRON_SECRET")
ENVIRONMENT = _env("ENVIRONMENT", "development")
FRONTEND_URL = _env("FRONTEND_URL", "http://localhost:5173/rip-assist/").rstrip("/") + "/"
CORS_ORIGINS = [
    o.strip()
    for o in _env(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,https://datadatasteve.github.io",
    ).split(",")
    if o.strip()
]

# Paid provider token prices, USD per 1M tokens. Override via env when rates change.
PRICING = {
    "claude": {"input": _float("CLAUDE_INPUT_PER_MTOK", 1.0), "output": _float("CLAUDE_OUTPUT_PER_MTOK", 5.0)},
    "openai": {"input": _float("OPENAI_INPUT_PER_MTOK", 0.15), "output": _float("OPENAI_OUTPUT_PER_MTOK", 0.60)},
}
