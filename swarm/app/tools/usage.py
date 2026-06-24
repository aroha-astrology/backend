"""AI usage cost tracking.

Logs every NIM call to the ai_usage table for cost attribution per user,
per agent, per model. Phase 2.5: in-memory accumulator; Phase 3 persists
to Supabase.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone

logger = logging.getLogger("aroha.usage")

_usage_log: list[dict] = []


@dataclass
class UsageRecord:
    user_id: str
    agent: str
    model: str
    tokens_in: int = 0
    tokens_out: int = 0
    cost: float = 0.0
    created_at: str = field(default_factory=lambda: datetime.now(tz=timezone.utc).isoformat())


async def log_usage(record: UsageRecord) -> None:
    entry = {
        "user_id": record.user_id,
        "agent": record.agent,
        "model": record.model,
        "tokens_in": record.tokens_in,
        "tokens_out": record.tokens_out,
        "cost": record.cost,
        "created_at": record.created_at,
    }
    _usage_log.append(entry)
    logger.debug(
        "NIM usage: user=%s agent=%s model=%s in=%d out=%d",
        record.user_id, record.agent, record.model, record.tokens_in, record.tokens_out,
    )


def get_usage_log() -> list[dict]:
    return list(_usage_log)


def clear_usage_log() -> None:
    _usage_log.clear()
