"""Dead Letter Queue — failed jobs that exceeded retries or hit terminal errors.

Captures {job_type, payload, last_error, attempts, traceback} so an admin can
inspect and requeue. Distinguishes retryable (provider/transient) from terminal
(bad input) failures.
"""

from __future__ import annotations

import logging
import traceback as tb
from datetime import datetime, timezone

logger = logging.getLogger("aroha.dlq")

_dlq: list[dict] = []


def _is_terminal(exc: Exception) -> bool:
    """Terminal errors should not be retried (bad input, validation, etc)."""
    terminal_types = (ValueError, TypeError, KeyError)
    return isinstance(exc, terminal_types)


async def record_failure(
    job_type: str,
    payload: dict,
    exc: Exception,
    attempts: int = 1,
) -> None:
    entry = {
        "job_type": job_type,
        "payload": payload,
        "last_error": str(exc),
        "traceback": tb.format_exception(type(exc), exc, exc.__traceback__),
        "attempts": attempts,
        "is_terminal": _is_terminal(exc),
        "failed_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    _dlq.append(entry)
    logger.error("DLQ: %s failed (%s): %s", job_type, "terminal" if entry["is_terminal"] else "retryable", exc)


def get_failed_jobs() -> list[dict]:
    return list(_dlq)


def clear_dlq() -> None:
    _dlq.clear()
