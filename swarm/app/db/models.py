"""SQLAlchemy models for Alembic migrations.

These define the schema for all aroha-swarm-owned tables. The actual DB is
Supabase (Postgres); Alembic manages the DDL. RLS policies are applied as
raw SQL in the migration files (Alembic doesn't model RLS).
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean, Column, DateTime, Float, Integer, String, Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class ChartCache(Base):
    __tablename__ = "chart_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    profile_id = Column(String, nullable=False)
    kind = Column(String(32), nullable=False)  # kundli, D1..D60, ashtakavarga, vimshottari
    payload = Column(JSONB, nullable=False)
    source_hash = Column(String(64), nullable=False)
    engine_version = Column(JSONB, nullable=False)
    computed_at = Column(DateTime, server_default=func.now())


class ChartInterpretation(Base):
    __tablename__ = "chart_interpretation"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    profile_id = Column(String, nullable=False)
    kind = Column(String(32), nullable=False)
    language = Column(String(8), nullable=False, default="en")
    payload = Column(JSONB, nullable=False)
    prompt_hash = Column(String(64))
    generated_at = Column(DateTime, server_default=func.now())


class PredictionCache(Base):
    __tablename__ = "prediction_cache"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    profile_id = Column(String, nullable=False)
    period_type = Column(String(16), nullable=False)  # daily, weekly, monthly, yearly
    period_key = Column(String(16), nullable=False)    # YYYY-MM-DD, YYYY-Www, YYYY-MM, YYYY
    language = Column(String(8), nullable=False, default="en")
    version = Column(String(32), nullable=False, default="forecast_v1")
    payload = Column(JSONB, nullable=False)
    engine_version = Column(JSONB, nullable=False)
    prompt_hash = Column(String(64))
    generated_at = Column(DateTime, server_default=func.now())


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    profile_id = Column(String, nullable=False, default="default")
    role = Column(String(16), nullable=False)  # user | assistant
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class ChatSummary(Base):
    __tablename__ = "chat_summary"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    profile_id = Column(String, nullable=False, default="default")
    summary_text = Column(Text, nullable=False, default="")
    summarized_through_message_id = Column(Integer)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class LegalAcceptance(Base):
    __tablename__ = "legal_acceptances"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    doc_type = Column(String(32), nullable=False)  # terms | disclaimer | consent
    doc_version = Column(String(16), nullable=False)
    accepted_at = Column(DateTime, server_default=func.now())
    ip = Column(String(45))


class AuditEvent(Base):
    """Immutable, append-only audit trail (no UPDATE/DELETE via RLS)."""
    __tablename__ = "audit_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    actor = Column(String(16), nullable=False)  # user | admin | system
    actor_id = Column(String, nullable=False)
    user_id = Column(String, nullable=False, index=True)
    event_type = Column(String(64), nullable=False)
    before = Column(JSONB)
    after = Column(JSONB)
    ip = Column(String(45))
    created_at = Column(DateTime, server_default=func.now())


class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, unique=True, index=True)
    plan = Column(String(16), nullable=False, default="free")  # free | premium | pro
    status = Column(String(16), nullable=False, default="active")
    started_at = Column(DateTime, server_default=func.now())
    renews_at = Column(DateTime)
    provider_ref = Column(String)


class TokenLedger(Base):
    """Append-only token/credit wallet. Balance = SUM(delta)."""
    __tablename__ = "token_ledger"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    delta = Column(Integer, nullable=False)
    reason = Column(String, nullable=False)
    balance_after = Column(Integer, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class FailedJob(Base):
    """Dead Letter Queue for failed async jobs."""
    __tablename__ = "failed_jobs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_type = Column(String(64), nullable=False)
    payload = Column(JSONB, nullable=False)
    last_error = Column(Text)
    traceback = Column(Text)
    attempts = Column(Integer, nullable=False, default=1)
    is_terminal = Column(Boolean, nullable=False, default=False)
    failed_at = Column(DateTime, server_default=func.now())


class AIUsage(Base):
    """Per-call NIM cost tracking."""
    __tablename__ = "ai_usage"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, index=True)
    agent = Column(String(32), nullable=False)
    model = Column(String(128), nullable=False)
    tokens_in = Column(Integer, nullable=False, default=0)
    tokens_out = Column(Integer, nullable=False, default=0)
    cost = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, server_default=func.now())


class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, nullable=False, unique=True, index=True)
    daily_push = Column(Boolean, nullable=False, default=True)
    weekly_push = Column(Boolean, nullable=False, default=True)
    chat_updates = Column(Boolean, nullable=False, default=False)


class FeatureFlag(Base):
    __tablename__ = "feature_flags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(64), nullable=False, unique=True)
    enabled = Column(Boolean, nullable=False, default=False)
    metadata_ = Column("metadata", JSONB)
