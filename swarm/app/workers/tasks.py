"""Arq worker task definitions.

Job types: chart_generation, interpretation_generation, daily_precompute,
push_notifications, warmup. Each acquires a distributed lock before starting
to prevent duplicate work. Failed jobs are sent to the DLQ.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.tools import locks
from app.workers.dlq import record_failure

logger = logging.getLogger("aroha.workers")


async def chart_generation(ctx: dict, user_id: str, profile_id: str, birth_record: dict) -> dict:
    """Generate and cache all static charts for a user profile."""
    lock_owner = await locks.acquire("chart", user_id, profile_id, "all")
    if not lock_owner:
        logger.info("chart_generation already running for %s/%s — skipping", user_id, profile_id)
        return {"status": "skipped", "reason": "lock_held"}

    try:
        from app.swarm.agents.metrologist_agent import compute_metrology
        from app.tools.cache import set_cached_chart

        metrology = compute_metrology(birth_record)

        engine_version = metrology.get("engineVersion", {})
        await set_cached_chart(user_id, profile_id, "kundli", metrology, birth_record, engine_version)

        vargas = metrology.get("divisionalCharts", {})
        for chart_type, chart_data in vargas.items():
            await set_cached_chart(user_id, profile_id, chart_type, chart_data, birth_record, engine_version)

        dasha = metrology.get("vimshottariDasha")
        if dasha:
            await set_cached_chart(user_id, profile_id, "vimshottari", dasha, birth_record, engine_version)

        logger.info("chart_generation complete for %s/%s", user_id, profile_id)
        return {"status": "complete", "charts_cached": len(vargas) + 2}

    except Exception as exc:
        await record_failure("chart_generation", {"user_id": user_id, "profile_id": profile_id}, exc)
        raise
    finally:
        await locks.release("chart", user_id, profile_id, "all", owner=lock_owner)


async def warmup(ctx: dict, user_id: str, profile_id: str, birth_record: dict) -> dict:
    """First-login warmup: generate static charts + initial predictions."""
    result = await chart_generation(ctx, user_id, profile_id, birth_record)
    logger.info("warmup complete for %s/%s", user_id, profile_id)
    return {"status": "warmup_complete", "chart_result": result}


async def daily_precompute(ctx: dict, user_id: str, profile_id: str) -> dict:
    """Pre-generate daily forecast for tomorrow. Stub until NIM generation lands."""
    lock_owner = await locks.acquire("gen", user_id, "daily", "tomorrow", "en")
    if not lock_owner:
        return {"status": "skipped", "reason": "lock_held"}

    try:
        logger.info("daily_precompute stub for %s/%s", user_id, profile_id)
        return {"status": "stub_complete"}
    finally:
        await locks.release("gen", user_id, "daily", "tomorrow", "en", owner=lock_owner)
