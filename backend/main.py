"""rip-assist API."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
import db
from routers import ai, calendar, checkins, habits, jobs, lanes, notifications, tasks, testing

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await db.close()


app = FastAPI(title="rip-assist", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (tasks, lanes, checkins, habits, ai, calendar, testing, notifications, jobs):
    app.include_router(r.router)


@app.get("/health")
async def health():
    return {
        "ok": True,
        "environment": config.ENVIRONMENT,
        "supabase_configured": bool(config.SUPABASE_URL and config.SUPABASE_SERVICE_KEY),
        "tailnet_proxy": bool(config.OLLAMA_PROXY),
    }
