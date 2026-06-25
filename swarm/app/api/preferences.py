"""User preferences — personalisation layer.

GET/PUT /v1/preferences — focus areas, relationship status, career goals.
Stored per-user; Scholar + Synthesizer bias outputs based on these.
"""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.deps import CurrentUser

router = APIRouter(prefix="/v1", tags=["preferences"])

_prefs_store: dict[str, dict] = {}


class UserPreferences(BaseModel):
    focus: list[str] = Field(default_factory=list, description="Focus areas: career, love, health, finance, spiritual")
    relationship_status: str | None = Field(default=None)
    career_goals: str | None = Field(default=None)
    panchang_driver: str = Field(default="by_region", description="by_region or by_current_location")
    notification_daily: bool = Field(default=True)
    notification_weekly: bool = Field(default=True)


@router.get("/preferences", response_model=UserPreferences, summary="Get user preferences")
async def get_preferences(user_id: CurrentUser):
    stored = _prefs_store.get(user_id, {})
    return UserPreferences(**stored)


@router.put("/preferences", response_model=UserPreferences, summary="Update user preferences")
async def update_preferences(prefs: UserPreferences, user_id: CurrentUser):
    _prefs_store[user_id] = prefs.model_dump()
    return prefs
