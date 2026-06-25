"""T&C / disclaimer / consent click-wrap endpoints.

Versioned legal documents the user must explicitly accept. Onboarding cannot
complete until the current doc_version of both T&C and DPDP consent is on record.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.deps import CurrentUser

router = APIRouter(prefix="/v1/legal", tags=["legal"])

# In-memory store (replaced by legal_acceptances table in production)
_acceptances: list[dict] = []

CURRENT_DOCS = {
    "terms": {"version": "1.0", "title": "Terms & Conditions"},
    "disclaimer": {"version": "1.0", "title": "Astrological Disclaimer"},
    "consent": {"version": "1.0", "title": "DPDP Data Processing Consent"},
}


class AcceptRequest(BaseModel):
    doc_type: str = Field(..., description="terms | disclaimer | consent")
    doc_version: str = Field(..., description="Version being accepted")


class AcceptResponse(BaseModel):
    status: str
    doc_type: str
    doc_version: str
    accepted_at: str


@router.get("/current", summary="Get active legal document versions")
async def get_current_docs() -> dict:
    return {"documents": CURRENT_DOCS}


@router.post("/accept", response_model=AcceptResponse, summary="Accept a legal document")
async def accept_doc(req: AcceptRequest, user_id: CurrentUser, request: Request):
    if req.doc_type not in CURRENT_DOCS:
        raise HTTPException(status_code=400, detail=f"Unknown doc_type: {req.doc_type}")

    current = CURRENT_DOCS[req.doc_type]
    if req.doc_version != current["version"]:
        raise HTTPException(status_code=400, detail=f"Stale version: current is {current['version']}")

    now = datetime.now(tz=timezone.utc).isoformat()
    _acceptances.append({
        "user_id": user_id,
        "doc_type": req.doc_type,
        "doc_version": req.doc_version,
        "accepted_at": now,
        "ip": request.client.host if request.client else None,
    })

    return AcceptResponse(
        status="accepted",
        doc_type=req.doc_type,
        doc_version=req.doc_version,
        accepted_at=now,
    )


@router.get("/status", summary="Check which documents user has accepted")
async def get_acceptance_status(user_id: CurrentUser) -> dict:
    user_accepts = [a for a in _acceptances if a["user_id"] == user_id]
    accepted = {}
    for a in user_accepts:
        key = a["doc_type"]
        if key not in accepted or a["doc_version"] > accepted[key]["doc_version"]:
            accepted[key] = a

    missing = []
    for doc_type, doc_info in CURRENT_DOCS.items():
        user_ver = accepted.get(doc_type, {}).get("doc_version")
        if user_ver != doc_info["version"]:
            missing.append(doc_type)

    return {"accepted": accepted, "missing": missing, "all_accepted": len(missing) == 0}
