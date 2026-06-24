"""Health-check endpoints for load-balancer / uptime probes.

- /health       basic process-up
- /health/live  liveness (no dependency calls)
- /health/ready readiness (probe dependencies; 503 if a hard dep is down)

Phase 0 only has the engine + (optional) Firebase wired, so readiness probes
what exists and reports the rest as "not_configured". Redis/Supabase probes are
filled in as those land.
"""

from __future__ import annotations

from fastapi import APIRouter, Response

from app.api.schemas import HealthResponse
from app.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/health/live", response_model=HealthResponse)
async def live() -> HealthResponse:
    return HealthResponse(status="ok")


@router.get("/health/ready", response_model=HealthResponse)
async def ready(response: Response) -> HealthResponse:
    settings = get_settings()
    checks: dict[str, str] = {}

    # Ephemeris engine — import + a trivial calc proves the native lib loads.
    try:
        from datetime import datetime, timezone

        from app.tools import swe_engine

        jd = swe_engine.to_julian_day(datetime(2000, 1, 1, tzinfo=timezone.utc))
        swe_engine.get_sidereal_longitudes(jd)
        checks["engine"] = "ok"
    except Exception as exc:  # noqa: BLE001
        checks["engine"] = f"error: {exc}"

    checks["firebase"] = "configured" if settings.firebase_credentials_file else "not_configured"
    checks["supabase"] = "configured" if settings.supabase_url else "not_configured"
    checks["redis"] = "configured" if settings.redis_url else "not_configured"

    hard_down = checks["engine"] != "ok"
    if hard_down:
        response.status_code = 503
        return HealthResponse(status="degraded", checks=checks)
    return HealthResponse(status="ok", checks=checks)
