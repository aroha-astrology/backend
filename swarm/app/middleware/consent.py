"""DPDP consent gate (Phase 0 stub).

For any endpoint processing personal data (birth data or live GPS), consent must
be present before any pyswisseph call or cache read. Phase 0 uses a permissive
in-memory stub (granted in dev); Phase 3 replaces this with a real consent store
+ audit row written before processing.
"""

from __future__ import annotations

from app.config import get_settings


class ConsentError(Exception):
    """Raised when consent is required but absent (mapped to 403 at the API)."""


def check_consent(user_id: str, *, explicit: bool | None = None) -> bool:
    """Return True if consent is on record for this user.

    `explicit` lets a request pass a consent flag in the payload (used in dev /
    onboarding before the real store exists). In dev with the bypass on, consent
    defaults to granted.
    """
    if explicit is not None:
        return explicit
    settings = get_settings()
    if settings.aroha_dev_auth_bypass and not settings.is_prod:
        return True
    return False


def require_consent(user_id: str, *, explicit: bool | None = None) -> None:
    if not check_consent(user_id, explicit=explicit):
        raise ConsentError("consent_required")
