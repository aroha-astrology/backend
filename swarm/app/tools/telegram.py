"""Telegram alert notifications.

Port of jyotish-backend/apps/api/src/lib/telegram.ts notifyBackendError.
Fires on: NIM all-keys-failed, worker job failures, tool/ephemeris failures,
consent/auth anomalies. Complements Sentry for ops visibility.
"""

from __future__ import annotations

import logging

import httpx

from app.config import get_settings

logger = logging.getLogger("aroha.telegram")


async def send_alert(title: str, message: str) -> bool:
    """Send an alert message to the configured Telegram chat."""
    settings = get_settings()
    if not settings.telegram_bot_token or not settings.telegram_alert_chat_id:
        logger.debug("Telegram not configured — skipping alert: %s", title)
        return False

    text = f"*{_escape_md(title)}*\n{_escape_md(message[:3000])}"
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(url, json={
                "chat_id": settings.telegram_alert_chat_id,
                "text": text,
                "parse_mode": "MarkdownV2",
            }, timeout=10.0)
            if resp.status_code != 200:
                logger.warning("Telegram alert failed: %s", resp.text[:200])
                return False
            return True
    except Exception as exc:
        logger.warning("Telegram alert error: %s", exc)
        return False


async def notify_error(context: str, error: Exception) -> bool:
    return await send_alert(f"Error: {context}", str(error)[:1000])


async def notify_dlq(job_type: str, error: str) -> bool:
    return await send_alert(f"DLQ: {job_type}", error[:1000])


def _escape_md(text: str) -> str:
    """Escape MarkdownV2 special characters."""
    special = r"_*[]()~`>#+-=|{}.!"
    for ch in special:
        text = text.replace(ch, f"\\{ch}")
    return text
