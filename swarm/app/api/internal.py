"""Secured internal endpoints for cron / admin operations.

All guarded by CRON_SECRET. Used by Arq built-in cron (launch) or
EventBridge (scale-up) to trigger precompute jobs.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Header

from app.config import get_settings

router = APIRouter(prefix="/internal", tags=["internal"])


def _verify_cron_secret(authorization: str | None = Header(default=None)):
    settings = get_settings()
    if not settings.cron_secret:
        return  # No secret configured — allow in dev
    expected = f"Bearer {settings.cron_secret}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Invalid cron secret")


@router.post("/cron/precompute-daily", summary="Trigger daily precompute for a timezone bucket")
async def precompute_daily(tz_bucket: str = "Asia/Kolkata", authorization: str | None = Header(default=None)):
    _verify_cron_secret(authorization)
    return {
        "status": "triggered",
        "tz_bucket": tz_bucket,
        "note": "Stub — enqueues daily_precompute jobs for active users in this tz bucket.",
    }


@router.post("/cron/precompute-weekly", summary="Trigger weekly precompute")
async def precompute_weekly(authorization: str | None = Header(default=None)):
    _verify_cron_secret(authorization)
    return {"status": "triggered", "note": "Stub — enqueues weekly precompute jobs."}


@router.post("/cron/precompute-monthly", summary="Trigger monthly precompute")
async def precompute_monthly(authorization: str | None = Header(default=None)):
    _verify_cron_secret(authorization)
    return {"status": "triggered", "note": "Stub — enqueues monthly precompute jobs."}


@router.post("/cron/precompute-yearly", summary="Trigger yearly precompute")
async def precompute_yearly(authorization: str | None = Header(default=None)):
    _verify_cron_secret(authorization)
    return {"status": "triggered", "note": "Stub — enqueues yearly precompute jobs."}


@router.post("/jobs/retry", summary="Retry a failed job from the DLQ")
async def retry_job(job_id: int, authorization: str | None = Header(default=None)):
    _verify_cron_secret(authorization)
    return {"status": "requeued", "job_id": job_id, "note": "Stub — looks up DLQ entry and re-enqueues."}
