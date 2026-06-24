"""Redis SETNX distributed locks.

Prevents duplicate generation when multiple workers (or the on-demand read path
and a precompute job) race to produce the same artifact. Key pattern:
  lock:gen:{user_id}:{period_type}:{period_key}:{language}
  lock:chart:{user_id}:{profile_id}:{kind}

Phase 2.5: in-memory stub. Production uses Redis SETNX with TTL + owner token.
"""

from __future__ import annotations

import logging
import uuid

logger = logging.getLogger("aroha.locks")

_mem_locks: dict[str, str] = {}


def _lock_key(prefix: str, *parts: str) -> str:
    return ":".join(["lock", prefix, *parts])


async def acquire(prefix: str, *parts: str, ttl_seconds: int = 300) -> str | None:
    """Try to acquire a lock. Returns the owner token on success, None if held."""
    key = _lock_key(prefix, *parts)
    if key in _mem_locks:
        logger.debug("Lock already held: %s", key)
        return None
    owner = uuid.uuid4().hex[:12]
    _mem_locks[key] = owner
    logger.debug("Lock acquired: %s (owner=%s)", key, owner)
    return owner


async def release(prefix: str, *parts: str, owner: str = "") -> bool:
    """Release a lock. Only the owner can release it."""
    key = _lock_key(prefix, *parts)
    held = _mem_locks.get(key)
    if held is None:
        return False
    if owner and held != owner:
        logger.warning("Lock release denied: %s (held by %s, attempted by %s)", key, held, owner)
        return False
    del _mem_locks[key]
    logger.debug("Lock released: %s", key)
    return True


async def is_locked(prefix: str, *parts: str) -> bool:
    key = _lock_key(prefix, *parts)
    return key in _mem_locks
