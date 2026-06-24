"""Firebase auth — the backend only *verifies* tokens.

Phone OTP send/verify happens client-side (Capacitor FirebaseAuthentication);
Firebase issues an ID token which the client sends as `Authorization: Bearer`.
Here we verify it and return the uid.

In dev (AROHA_DEV_AUTH_BYPASS=true and no Firebase credentials configured) an
absent/any token resolves to DEV_USER_ID so the service is runnable without
Firebase set up. The bypass is hard-disabled in prod.
"""

from __future__ import annotations

import threading

from app.config import get_settings

_init_lock = threading.Lock()
_firebase_ready: bool | None = None


def _init_firebase() -> bool:
    """Initialise firebase-admin once. Returns True if credentials were loaded."""
    global _firebase_ready
    if _firebase_ready is not None:
        return _firebase_ready
    with _init_lock:
        if _firebase_ready is not None:
            return _firebase_ready
        settings = get_settings()
        if not settings.firebase_credentials_file:
            _firebase_ready = False
            return _firebase_ready
        import firebase_admin
        from firebase_admin import credentials

        if not firebase_admin._apps:
            cred = credentials.Certificate(settings.firebase_credentials_file)
            firebase_admin.initialize_app(cred)
        _firebase_ready = True
        return _firebase_ready


class AuthError(Exception):
    """Raised when a request cannot be authenticated (mapped to 401 at the API)."""


def verify_bearer_token(authorization: str | None) -> str:
    """Verify a Firebase ID token from an Authorization header; return the uid."""
    settings = get_settings()
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()

    if _init_firebase():
        if not token:
            raise AuthError("missing bearer token")
        from firebase_admin import auth as fb_auth

        try:
            decoded = fb_auth.verify_id_token(token)
        except Exception as exc:  # noqa: BLE001
            raise AuthError(f"invalid token: {exc}") from exc
        return decoded["uid"]

    # No Firebase configured.
    if settings.aroha_dev_auth_bypass and not settings.is_prod:
        return settings.dev_user_id
    raise AuthError("authentication not configured")
