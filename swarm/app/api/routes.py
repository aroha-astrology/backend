"""HTTP endpoints — /v1/onboarding, /v1/forecast/daily, /v1/matchmaking, /v1/chat.

The flow is the plan's: auth → consent → graph/agent.
"""

from __future__ import annotations

import json
import logging
import uuid

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.api.schemas import (
    ChatRequest,
    ForecastRequest,
    ForecastResponse,
    MatchmakingRequest,
    MatchmakingResponse,
    OnboardingRequest,
    OnboardingResponse,
)
from app.deps import CurrentUser
from app.middleware.consent import ConsentError, require_consent
from app.swarm.agents.gateway_agent import compile_response
from app.swarm.graph import get_graph
from app.swarm.state import new_state

logger = logging.getLogger("aroha.routes")

router = APIRouter(prefix="/v1", tags=["swarm"])


# ---------------------------------------------------------------------------
# Onboarding (Phase 0)
# ---------------------------------------------------------------------------

@router.post(
    "/onboarding",
    response_model=OnboardingResponse,
    summary="Onboard a user and compute their natal chart",
    description=(
        "Auth → DPDP consent gate → orchestration graph (Gateway → Metrologist). "
        "Returns the deterministic sidereal chart (9 grahas + whole-sign houses + "
        "ascendant + all 24 divisional charts + Vimshottari dasha tree). "
        "In later phases this enqueues warm-up generation and returns a job id."
    ),
    responses={
        401: {"description": "Missing/invalid Firebase token"},
        403: {"description": "DPDP consent required"},
        422: {"description": "Computation error (e.g. malformed birth data)"},
    },
)
async def onboarding(req: OnboardingRequest, user_id: CurrentUser) -> OnboardingResponse:
    try:
        require_consent(user_id, explicit=req.consent)
    except ConsentError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    request_id = uuid.uuid4().hex
    state = new_state(
        request_id=request_id,
        user_id=user_id,
        intent="onboarding",
        consent=True,
        locale=req.locale,
        region=req.region,
        birth_record=req.birth.model_dump(),
    )

    result = await get_graph().ainvoke(state)

    if result.get("errors"):
        raise HTTPException(status_code=422, detail={"errors": result["errors"]})

    payload = compile_response(result)
    return OnboardingResponse(
        requestId=request_id,
        intent="onboarding",
        metrology=payload.get("metrology"),
        findings=payload.get("findings", []),
        warnings=payload.get("warnings", []),
    )


# ---------------------------------------------------------------------------
# Daily Forecast (Phase 2)
# ---------------------------------------------------------------------------

@router.post(
    "/forecast/daily",
    response_model=ForecastResponse,
    summary="Daily forecast with fan-out (Synthesizer + Profiler)",
    description=(
        "Auth → consent → full graph: Gateway → Metrologist → "
        "(Synthesizer || Profiler) → Aggregator. Returns metrology, synthesis "
        "(dasha context), atmosphere (ashtakavarga analysis), and verified findings."
    ),
    responses={
        401: {"description": "Missing/invalid Firebase token"},
        403: {"description": "DPDP consent required"},
        422: {"description": "Computation error"},
    },
)
async def daily_forecast(req: ForecastRequest, user_id: CurrentUser) -> ForecastResponse:
    try:
        require_consent(user_id, explicit=req.consent)
    except ConsentError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    request_id = uuid.uuid4().hex
    state = new_state(
        request_id=request_id,
        user_id=user_id,
        intent="daily_forecast",
        consent=True,
        locale=req.locale,
        region=req.region,
        birth_record=req.birth.model_dump(),
    )

    result = await get_graph().ainvoke(state)

    if result.get("errors"):
        raise HTTPException(status_code=422, detail={"errors": result["errors"]})

    payload = compile_response(result)
    return ForecastResponse(
        requestId=request_id,
        intent="daily_forecast",
        metrology=payload.get("metrology"),
        synthesis=result.get("synthesis"),
        atmosphere=result.get("atmosphere"),
        findings=payload.get("findings", []),
        warnings=payload.get("warnings", []),
    )


# ---------------------------------------------------------------------------
# Matchmaking (Phase 2)
# ---------------------------------------------------------------------------

@router.post(
    "/matchmaking",
    response_model=MatchmakingResponse,
    summary="36-point Ashtakoota marriage compatibility",
    description=(
        "Computes both natal charts and runs the 8-koota compatibility "
        "analysis. Returns per-koota scores, total/36, and overall verdict."
    ),
    responses={
        401: {"description": "Missing/invalid Firebase token"},
        403: {"description": "DPDP consent required"},
        422: {"description": "Computation error"},
    },
)
async def matchmaking(req: MatchmakingRequest, user_id: CurrentUser) -> MatchmakingResponse:
    try:
        require_consent(user_id, explicit=req.consent)
    except ConsentError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    from app.swarm.agents.metrologist_agent import compute_metrology
    from app.tools.ashtakoota import calculate_ashtakoota

    request_id = uuid.uuid4().hex

    try:
        chart1 = compute_metrology(req.person1.model_dump())
        chart2 = compute_metrology(req.person2.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=422, detail={"errors": [str(exc)]}) from exc

    moon1 = next((p for p in chart1["planets"] if p["planet"] == "Moon"), None)
    moon2 = next((p for p in chart2["planets"] if p["planet"] == "Moon"), None)

    if not moon1 or not moon2:
        raise HTTPException(status_code=422, detail={"errors": ["moon_position_not_found"]})

    result = calculate_ashtakoota(
        nak_index_1=moon1["nakshatraIndex"],
        nak_index_2=moon2["nakshatraIndex"],
        moon_sign_1=moon1["sign"],
        moon_sign_2=moon2["sign"],
    )

    return MatchmakingResponse(
        requestId=request_id,
        compatibility=result,
    )


# ---------------------------------------------------------------------------
# Daily synthesis — full predictive stack (Dasha + Transit + SAV + Vedha +
# Kakshya + Tara + Chandrabala + Panchang)
# ---------------------------------------------------------------------------

@router.post(
    "/forecast/daily/full",
    summary="Full daily synthesis with all predictive layers",
    description=(
        "Stacks Dasha-lord transit quality, Ashtakavarga SAV, Vedha obstruction, "
        "Kakshya micro-compartments, Tara Bala, Chandrabala, and Panchang constraints "
        "into a single 1-5 day score with full breakdown."
    ),
)
async def daily_full_synthesis(req: ForecastRequest, user_id: CurrentUser):
    try:
        require_consent(user_id, explicit=req.consent)
    except ConsentError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    from app.swarm.agents.metrologist_agent import compute_metrology
    from app.tools.daily_synthesis import synthesize_daily_forecast

    metrology = compute_metrology(req.birth.model_dump())
    moon = next((p for p in metrology["planets"] if p["planet"] == "Moon"), None)
    asc_idx = metrology["ascendant"]["ascendantSignIndex"]

    dasha = metrology.get("vimshottariDasha", {})
    md = dasha.get("currentMahadasha", {})
    ad = dasha.get("currentAntardasha", {})

    synthesis = synthesize_daily_forecast(
        natal_planets=metrology["planets"],
        natal_asc_sign_idx=asc_idx,
        natal_moon_sign_idx=moon["signIndex"] if moon else 0,
        natal_moon_nak_idx=moon["nakshatraIndex"] if moon else 0,
        current_md_planet=md.get("planet"),
        current_ad_planet=ad.get("planet"),
    )

    return {"requestId": uuid.uuid4().hex, **synthesis}


# ---------------------------------------------------------------------------
# Moon-sign & Sun-sign daily predictions (carousels 2 & 3)
# ---------------------------------------------------------------------------

@router.get(
    "/forecast/moon-sign/{sign_index}",
    summary="Moon-sign daily prediction",
    description="Generic Moon-sign prediction based on current transits. Not personalized to natal chart.",
)
async def moon_sign_forecast(sign_index: int):
    if not 0 <= sign_index <= 11:
        raise HTTPException(status_code=400, detail="sign_index must be 0-11")
    from app.tools.daily_synthesis import moon_sign_prediction
    return moon_sign_prediction(sign_index)


@router.get(
    "/forecast/sun-sign/{sign_index}",
    summary="Sun-sign daily prediction",
    description="Generic Sun-sign prediction based on Jupiter/Saturn transits.",
)
async def sun_sign_forecast(sign_index: int):
    if not 0 <= sign_index <= 11:
        raise HTTPException(status_code=400, detail="sign_index must be 0-11")
    from app.tools.daily_synthesis import sun_sign_prediction
    return sun_sign_prediction(sign_index)


# ---------------------------------------------------------------------------
# Panchang (Phase 3)
# ---------------------------------------------------------------------------

@router.get(
    "/panchang",
    summary="Dual panchang (by_region + by_current_location)",
    description=(
        "Returns the 5 limbs of the Vedic calendar. by_region is consent-exempt "
        "(fixed canonical reference city). by_current_location requires consent + GPS."
    ),
)
async def panchang(
    region: str = "North_Indian",
    lat: float | None = None,
    lon: float | None = None,
    user_id: CurrentUser = None,
):
    from datetime import datetime, timezone
    from app.tools.panchang import compute_regional_panchang, compute_location_panchang

    now = datetime.now(tz=timezone.utc)
    result: dict = {"by_region": compute_regional_panchang(now, region)}

    if lat is not None and lon is not None:
        try:
            require_consent(user_id, explicit=True)
            result["by_current_location"] = compute_location_panchang(now, lat, lon)
        except ConsentError:
            result["by_current_location"] = None
            result["warnings"] = ["GPS panchang requires DPDP consent"]

    return result


# ---------------------------------------------------------------------------
# Chat — SSE streaming (Phase 1)
# ---------------------------------------------------------------------------

@router.post(
    "/chat",
    summary="Chat with the AI Jyotish Scholar (SSE stream)",
    description=(
        "Auth → consent → Scholar agent. Returns an SSE stream with "
        "`event: token` deltas and a final `event: done` frame. "
        "The Scholar is grounded in the user's chart data and verified findings."
    ),
    responses={
        401: {"description": "Missing/invalid Firebase token"},
        403: {"description": "DPDP consent required"},
        422: {"description": "Missing chart context"},
    },
)
async def chat(req: ChatRequest, user_id: CurrentUser):
    try:
        require_consent(user_id, explicit=True)
    except ConsentError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    # Phase 1: in-memory state stub. Phase 2.5+ loads from Supabase.
    state: dict = {
        "user_id": user_id,
        "persona": req.persona,
        "metrology": None,
        "findings": [],
        "chat_context": {"history": [], "summary": ""},
    }

    from app.swarm.agents.scholar_agent import scholar_stream

    async def event_stream():
        full_response = []
        try:
            async for token in scholar_stream(state, req.message):
                full_response.append(token)
                yield f"event: token\ndata: {json.dumps({'content': token})}\n\n"
        except Exception as exc:
            logger.exception("Scholar stream error")
            yield f"event: error\ndata: {json.dumps({'error': str(exc)})}\n\n"
            return

        yield f"event: done\ndata: {json.dumps({'status': 'complete'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
