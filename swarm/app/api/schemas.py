"""Pydantic request/response DTOs (OpenAPI-compliant contract)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class BirthInput(BaseModel):
    date: str = Field(..., examples=["1990-08-15"], description="ISO birth date")
    time: str = Field(default="12:00", examples=["07:30"], description="Local birth time HH:MM")
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    timezone: str = Field(default="Asia/Kolkata", examples=["Asia/Kolkata"])


class OnboardingRequest(BaseModel):
    birth: BirthInput
    locale: str = Field(default="en")
    region: str = Field(default="North_Indian")
    # Dev/onboarding consent flag until the real consent store lands (Phase 3).
    consent: bool | None = Field(default=None)


class OnboardingResponse(BaseModel):
    requestId: str
    intent: str
    metrology: dict | None = None
    findings: list[dict] = []
    warnings: list[str] = []


class ChatRequest(BaseModel):
    message: str = Field(..., max_length=2000, description="User message text")
    profile_id: str | None = Field(default=None, description="Birth profile ID (for multi-profile)")
    locale: str = Field(default="en")
    persona: str = Field(default="general", description="Astrologer persona: general | career | love | health")


class ChatMessage(BaseModel):
    role: str
    content: str
    created_at: str | None = None


class ForecastRequest(BaseModel):
    birth: BirthInput
    locale: str = Field(default="en")
    region: str = Field(default="North_Indian")
    consent: bool | None = Field(default=None)


class ForecastResponse(BaseModel):
    requestId: str
    intent: str
    metrology: dict | None = None
    synthesis: dict | None = None
    atmosphere: dict | None = None
    findings: list[dict] = []
    warnings: list[str] = []


class MatchmakingRequest(BaseModel):
    person1: BirthInput
    person2: BirthInput
    locale: str = Field(default="en")
    consent: bool | None = Field(default=None)


class MatchmakingResponse(BaseModel):
    requestId: str
    compatibility: dict | None = None
    findings: list[dict] = []
    warnings: list[str] = []


class HealthResponse(BaseModel):
    status: str
    checks: dict[str, str] = {}
