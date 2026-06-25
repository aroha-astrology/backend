"""FastAPI application factory + lifespan.

Single deployable "layer": all agents + the deterministic tool layer run
in-process. Lifespan asserts the data-localization region in prod and warms the
ephemeris engine.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app import __version__
from app.api import account, billing, compat, feedback, health, internal, legal, preferences, routes
from app.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    # Data localization: fail fast in prod if the region is wrong.
    if settings.is_prod and settings.aroha_region != "ap-south-1":
        raise RuntimeError(
            f"Region must be ap-south-1 in prod (got {settings.aroha_region})"
        )
    # Warm the ephemeris (init sid mode / ephemeris path once).
    from datetime import datetime, timezone

    from app.tools import swe_engine

    swe_engine.to_julian_day(datetime(2000, 1, 1, tzinfo=timezone.utc))
    yield


_OPENAPI_TAGS = [
    {"name": "health", "description": "Liveness/readiness probes for the load balancer."},
    {"name": "swarm", "description": "Astrology orchestration endpoints (auth → consent → graph)."},
    {"name": "legal", "description": "T&C / disclaimer / DPDP consent click-wrap."},
    {"name": "account", "description": "DPDP data-rights: delete, export, withdraw consent."},
    {"name": "billing", "description": "Subscription plan + token wallet."},
    {"name": "internal", "description": "Secured cron/admin endpoints (CRON_SECRET)."},
]

_DESCRIPTION = """
**Aroha Astrology — 6-agent Vedic orchestration swarm.**

Single FastAPI layer running the Gateway Broker, Computational Metrologist,
Transit & Dasha Synthesizer, Atmospheric Profiler, Compatibility Evaluator, and
AI Jyotish Scholar over a deterministic ephemeris tool layer.

Auth: send the Firebase ID token as `Authorization: Bearer <token>` (in dev with
the auth bypass on, the token is optional). All personal-data endpoints are
DPDP consent-gated.

Interactive docs: **/docs** (Swagger UI) · **/redoc** · schema at **/openapi.json**.
""".strip()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Aroha Swarm API",
        version=__version__,
        description=_DESCRIPTION,
        summary="6-agent Vedic astrology orchestration swarm",
        openapi_tags=_OPENAPI_TAGS,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        contact={"name": "Aroha Astrology"},
        servers=[
            {"url": "http://13.232.179.137:3000", "description": "EC2 (ap-south-1)"},
            {"url": "http://localhost:3000", "description": "Local dev"},
        ],
        lifespan=lifespan,
    )
    app.include_router(health.router)
    app.include_router(routes.router)
    app.include_router(legal.router)
    app.include_router(account.router)
    app.include_router(billing.router)
    app.include_router(internal.router)
    app.include_router(feedback.router)
    app.include_router(preferences.router)
    app.include_router(compat.router)

    @app.get("/", include_in_schema=False)
    async def root() -> dict:
        return {
            "service": "aroha-swarm",
            "version": __version__,
            "env": settings.aroha_env,
            "docs": "/docs",
        }

    return app


app = create_app()
