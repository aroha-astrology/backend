"""Rate limiting via slowapi — entitlement-aware tiered limits.

Free: 20 chat/day, 5 matchmaking/day. Premium: 500 chat/day, 50 matchmaking/day.
Pro: 2000 chat/day, unlimited matchmaking.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("aroha.ratelimit")

TIER_LIMITS: dict[str, dict[str, int]] = {
    "free": {"chat": 20, "matchmaking": 5, "forecast": 10, "onboarding": 3},
    "premium": {"chat": 500, "matchmaking": 50, "forecast": 100, "onboarding": 10},
    "pro": {"chat": 2000, "matchmaking": 500, "forecast": 500, "onboarding": 50},
}

# In-memory counters (replaced by Redis in production)
_counters: dict[str, int] = {}


def _counter_key(user_id: str, action: str, date_str: str) -> str:
    return f"rl:{user_id}:{action}:{date_str}"


async def check_rate_limit(user_id: str, action: str, plan: str = "free") -> bool:
    """Returns True if the request is allowed, False if rate-limited."""
    from datetime import date
    today = date.today().isoformat()
    key = _counter_key(user_id, action, today)
    current = _counters.get(key, 0)
    limit = TIER_LIMITS.get(plan, TIER_LIMITS["free"]).get(action, 100)
    if current >= limit:
        logger.warning("Rate limit hit: user=%s action=%s count=%d limit=%d", user_id, action, current, limit)
        return False
    _counters[key] = current + 1
    return True


def reset_counters() -> None:
    _counters.clear()
