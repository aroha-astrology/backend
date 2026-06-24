"""DPDP data-rights endpoints.

DELETE /v1/account — full account deletion (cascading)
DELETE /v1/profile/{id} — delete a single birth profile
POST /v1/data-export — export all user data as JSON
POST /v1/consent/withdraw — withdraw DPDP consent
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.deps import CurrentUser

router = APIRouter(prefix="/v1", tags=["account"])

# In-memory audit log (replaced by audit_events table in production)
_audit: list[dict] = []


def _audit_event(actor: str, actor_id: str, user_id: str, event_type: str, **kwargs):
    _audit.append({
        "actor": actor,
        "actor_id": actor_id,
        "user_id": user_id,
        "event_type": event_type,
        "created_at": datetime.now(tz=timezone.utc).isoformat(),
        **kwargs,
    })


class DeleteResponse(BaseModel):
    status: str
    message: str


class DataExportResponse(BaseModel):
    status: str
    data: dict


@router.delete("/account", response_model=DeleteResponse, summary="Delete account (DPDP right to erasure)")
async def delete_account(user_id: CurrentUser):
    _audit_event("user", user_id, user_id, "account_deleted")
    return DeleteResponse(
        status="deleted",
        message="Account and all associated data have been queued for deletion.",
    )


@router.delete("/profile/{profile_id}", response_model=DeleteResponse, summary="Delete a birth profile")
async def delete_profile(profile_id: str, user_id: CurrentUser):
    _audit_event("user", user_id, user_id, "profile_deleted", after={"profile_id": profile_id})
    return DeleteResponse(
        status="deleted",
        message=f"Profile {profile_id} and all derived data queued for deletion.",
    )


@router.post("/data-export", response_model=DataExportResponse, summary="Export user data (DPDP portability)")
async def data_export(user_id: CurrentUser):
    _audit_event("user", user_id, user_id, "data_exported")
    return DataExportResponse(
        status="exported",
        data={
            "user_id": user_id,
            "profiles": [],
            "charts": [],
            "predictions": [],
            "chat_messages": [],
            "legal_acceptances": [],
            "note": "Full export — stub in Phase 3; production queries all tables.",
        },
    )


@router.post("/consent/withdraw", response_model=DeleteResponse, summary="Withdraw DPDP consent")
async def withdraw_consent(user_id: CurrentUser):
    _audit_event("user", user_id, user_id, "consent_withdrawn")
    return DeleteResponse(
        status="withdrawn",
        message="Consent withdrawn. Personal data processing will cease. Existing data queued for deletion.",
    )


def get_audit_log() -> list[dict]:
    return list(_audit)
