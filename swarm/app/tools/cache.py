"""Redis read-through cache + Supabase write-through.

Hot reads: Redis → (miss) → Supabase → backfill Redis.
Write-time invalidation: any generation that writes a row also refreshes its
Redis key, so versioning bumps and birth-data edits never serve stale cache.

Phase 2.5: stubbed with in-memory dict for dev (no Redis/Supabase connection
required). Production uses real Redis via the REDIS_URL setting.
"""

from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timezone

logger = logging.getLogger("aroha.cache")

# In-memory stub cache (replaced by Redis in production)
_mem_cache: dict[str, str] = {}


def _cache_key(prefix: str, *parts: str) -> str:
    return ":".join([prefix, *parts])


def source_hash(birth_record: dict) -> str:
    """Deterministic hash of birth inputs for cache invalidation."""
    canonical = json.dumps(birth_record, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Chart cache
# ---------------------------------------------------------------------------

async def get_cached_chart(user_id: str, profile_id: str, kind: str) -> dict | None:
    key = _cache_key("chart", user_id, profile_id, kind)
    raw = _mem_cache.get(key)
    if raw:
        return json.loads(raw)
    return None


async def set_cached_chart(
    user_id: str,
    profile_id: str,
    kind: str,
    payload: dict,
    birth_record: dict,
    engine_version: dict,
) -> None:
    key = _cache_key("chart", user_id, profile_id, kind)
    entry = {
        "payload": payload,
        "source_hash": source_hash(birth_record),
        "engine_version": engine_version,
        "computed_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    _mem_cache[key] = json.dumps(entry)


# ---------------------------------------------------------------------------
# Prediction cache
# ---------------------------------------------------------------------------

async def get_cached_prediction(
    user_id: str,
    profile_id: str,
    period_type: str,
    period_key: str,
    language: str = "en",
) -> dict | None:
    key = _cache_key("pred", user_id, profile_id, period_type, period_key, language)
    raw = _mem_cache.get(key)
    if raw:
        return json.loads(raw)
    return None


async def set_cached_prediction(
    user_id: str,
    profile_id: str,
    period_type: str,
    period_key: str,
    payload: dict,
    engine_version: dict,
    language: str = "en",
    version: str = "forecast_v1",
    prompt_hash: str = "",
) -> None:
    key = _cache_key("pred", user_id, profile_id, period_type, period_key, language)
    entry = {
        "payload": payload,
        "version": version,
        "prompt_hash": prompt_hash,
        "engine_version": engine_version,
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    _mem_cache[key] = json.dumps(entry)


# ---------------------------------------------------------------------------
# Invalidation
# ---------------------------------------------------------------------------

async def invalidate_user_charts(user_id: str) -> int:
    """Remove all chart cache entries for a user (e.g. birth-data edit)."""
    prefix = _cache_key("chart", user_id)
    keys_to_remove = [k for k in _mem_cache if k.startswith(prefix)]
    for k in keys_to_remove:
        del _mem_cache[k]
    return len(keys_to_remove)


async def invalidate_user_predictions(user_id: str) -> int:
    prefix = _cache_key("pred", user_id)
    keys_to_remove = [k for k in _mem_cache if k.startswith(prefix)]
    for k in keys_to_remove:
        del _mem_cache[k]
    return len(keys_to_remove)
