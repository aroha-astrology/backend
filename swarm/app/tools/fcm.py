"""Firebase Cloud Messaging — push notifications.

Port of jyotish-backend/apps/api/src/lib/push/fcm.ts. Sends push via
Firebase Admin SDK (HTTP v1). Used by the precompute scheduler to notify
users when their daily reading is ready.
"""

from __future__ import annotations

import logging

logger = logging.getLogger("aroha.fcm")


async def send_push(
    device_token: str,
    title: str,
    body: str,
    data: dict | None = None,
) -> bool:
    """Send a push notification via FCM. Returns True on success."""
    try:
        import firebase_admin.messaging as messaging

        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data=data or {},
            token=device_token,
        )
        messaging.send(message)
        logger.info("FCM push sent to %s...%s", device_token[:8], device_token[-4:])
        return True
    except ImportError:
        logger.debug("firebase_admin.messaging not available — skipping push")
        return False
    except Exception as exc:
        logger.warning("FCM push failed: %s", exc)
        return False


async def send_push_batch(
    device_tokens: list[str],
    title: str,
    body: str,
    data: dict | None = None,
) -> int:
    """Send push to multiple devices. Returns count of successes."""
    successes = 0
    for token in device_tokens:
        if await send_push(token, title, body, data):
            successes += 1
    return successes
