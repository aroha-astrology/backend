"""Rolling pre-generation scheduling.

For every active user, in every period granularity, the cache always holds the
current period AND the next period. The user never waits and never sees an
empty state at rollover.

Daily: ~30 min before local midnight, per timezone bucket.
Weekly: a few hours before ISO-week rollover.
Monthly: 1-2 days before month end.
Yearly: late December.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta

logger = logging.getLogger("aroha.precompute")


def get_next_period_key(period_type: str, current_date: date | None = None) -> str:
    """Compute the next period key that needs to be pre-generated."""
    today = current_date or date.today()

    if period_type == "daily":
        return (today + timedelta(days=1)).isoformat()
    elif period_type == "weekly":
        next_week = today + timedelta(days=7 - today.weekday())
        return next_week.strftime("%G-W%V")
    elif period_type == "monthly":
        if today.month == 12:
            return f"{today.year + 1}-01"
        return f"{today.year}-{today.month + 1:02d}"
    elif period_type == "yearly":
        return str(today.year + 1)
    else:
        return today.isoformat()


def should_precompute(period_type: str, current_date: date | None = None) -> bool:
    """Check if it's time to trigger precompute for this period type."""
    today = current_date or date.today()

    if period_type == "daily":
        return True  # Always precompute tomorrow
    elif period_type == "weekly":
        return today.weekday() >= 5  # Saturday or Sunday
    elif period_type == "monthly":
        days_in_month = (today.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
        return today.day >= days_in_month.day - 1
    elif period_type == "yearly":
        return today.month == 12 and today.day >= 28
    return False


async def run_precompute(period_type: str, tz_bucket: str = "Asia/Kolkata") -> dict:
    """Run precompute for all active users in the given timezone bucket.

    Stub: in production, queries active users, generates forecasts, and
    enqueues FCM push notifications.
    """
    period_key = get_next_period_key(period_type)
    logger.info("Precompute %s: period_key=%s, tz=%s", period_type, period_key, tz_bucket)

    return {
        "period_type": period_type,
        "period_key": period_key,
        "tz_bucket": tz_bucket,
        "status": "stub_complete",
        "users_processed": 0,
    }
