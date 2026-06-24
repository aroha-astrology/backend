"""FastAPI dependencies — auth + settings wiring."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, HTTPException

from app.config import Settings, get_settings
from app.middleware.auth import AuthError, verify_bearer_token


def settings_dep() -> Settings:
    return get_settings()


def get_current_user(authorization: Annotated[str | None, Header()] = None) -> str:
    """Resolve the authenticated Firebase uid (or the dev user) or raise 401."""
    try:
        return verify_bearer_token(authorization)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


CurrentUser = Annotated[str, Depends(get_current_user)]
SettingsDep = Annotated[Settings, Depends(settings_dep)]
