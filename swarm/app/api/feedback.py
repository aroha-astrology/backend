"""Prediction feedback endpoint — fuel for prompt tuning.

POST /v1/feedback — rate a prediction (1-5 stars + optional comment).
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.deps import CurrentUser

router = APIRouter(prefix="/v1", tags=["feedback"])

_feedback_store: list[dict] = []


class FeedbackRequest(BaseModel):
    prediction_id: str = Field(..., description="ID of the prediction being rated")
    rating: int = Field(..., ge=1, le=5)
    helpful: bool = Field(default=True)
    comment: str | None = Field(default=None, max_length=1000)


class FeedbackResponse(BaseModel):
    status: str
    feedback_id: str


@router.post("/feedback", response_model=FeedbackResponse, summary="Rate a prediction")
async def submit_feedback(req: FeedbackRequest, user_id: CurrentUser):
    entry = {
        "id": f"fb_{len(_feedback_store) + 1}",
        "user_id": user_id,
        "prediction_id": req.prediction_id,
        "rating": req.rating,
        "helpful": req.helpful,
        "comment": req.comment,
        "created_at": datetime.now(tz=timezone.utc).isoformat(),
    }
    _feedback_store.append(entry)
    return FeedbackResponse(status="recorded", feedback_id=entry["id"])


def get_feedback() -> list[dict]:
    return list(_feedback_store)
