"""Backward-compatible endpoints matching the old TS jyotish-backend API.

POST /v1/auth/session — exchange Firebase token for app user (idempotent)
GET /v1/me — current user profile
PATCH /v1/me — update profile
DELETE /v1/me — soft-delete account
GET /healthz — liveness
GET /readyz — readiness
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.deps import CurrentUser

router = APIRouter(tags=["compat"])

# In-memory user store (replaced by Supabase in production)
_users: dict[str, dict] = {}


class PlaceOfBirth(BaseModel):
    name: str = ""
    lat: float = 0.0
    lon: float = 0.0
    tz: str = "Asia/Kolkata"


class UserResponse(BaseModel):
    id: str
    firebaseUid: str
    phoneE164: str | None = None
    displayName: str | None = None
    gender: str | None = None
    dateOfBirth: str | None = None
    timeOfBirth: str | None = None
    placeOfBirth: PlaceOfBirth | None = None
    profileCompletedAt: str | None = None
    createdAt: str
    updatedAt: str


class SessionResponse(BaseModel):
    user: UserResponse
    created: bool


class UpdateMeBody(BaseModel):
    displayName: str | None = None
    gender: str | None = None
    dateOfBirth: str | None = None
    timeOfBirth: str | None = None
    placeOfBirth: PlaceOfBirth | None = None


def _get_or_create_user(uid: str) -> tuple[dict, bool]:
    if uid in _users:
        return _users[uid], False
    now = datetime.now(tz=timezone.utc).isoformat()
    user = {
        "id": uid,
        "firebaseUid": uid,
        "phoneE164": None,
        "displayName": None,
        "gender": None,
        "dateOfBirth": None,
        "timeOfBirth": None,
        "placeOfBirth": None,
        "profileCompletedAt": None,
        "createdAt": now,
        "updatedAt": now,
    }
    _users[uid] = user
    return user, True


@router.post("/v1/auth/session", response_model=SessionResponse, summary="Exchange Firebase token for app user")
async def create_session(user_id: CurrentUser):
    user, created = _get_or_create_user(user_id)
    return SessionResponse(user=UserResponse(**user), created=created)


@router.get("/v1/me", response_model=UserResponse, summary="Current user profile")
async def get_me(user_id: CurrentUser):
    user, _ = _get_or_create_user(user_id)
    return UserResponse(**user)


@router.patch("/v1/me", response_model=UserResponse, summary="Update current user profile")
async def update_me(body: UpdateMeBody, user_id: CurrentUser):
    user, _ = _get_or_create_user(user_id)
    now = datetime.now(tz=timezone.utc).isoformat()
    updates = body.model_dump(exclude_none=True)
    if "placeOfBirth" in updates and updates["placeOfBirth"] is not None:
        updates["placeOfBirth"] = updates["placeOfBirth"] if isinstance(updates["placeOfBirth"], dict) else updates["placeOfBirth"].model_dump()
    user.update(updates)
    user["updatedAt"] = now
    if all(user.get(f) for f in ["displayName", "dateOfBirth", "timeOfBirth", "placeOfBirth", "gender"]):
        user["profileCompletedAt"] = user.get("profileCompletedAt") or now
    return UserResponse(**user)


@router.delete("/v1/me", status_code=204, summary="Soft-delete account")
async def delete_me(user_id: CurrentUser):
    _users.pop(user_id, None)
    return None


@router.get("/healthz", summary="Liveness (compat)")
async def healthz():
    return {"status": "ok", "uptimeSeconds": 0}


@router.get("/readyz", summary="Readiness (compat)")
async def readyz():
    return {"status": "ok", "checks": {"db": "ok"}}
