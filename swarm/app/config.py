"""Central configuration via pydantic-settings.

Holds the two distinct LLM *generation profiles* (Forecast Generator vs Chat
Scholar) which the plan requires never be conflated, plus NIM / auth / engine
settings. Everything is env-driven (see .env.example).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class GenerationProfile(BaseModel):
    """A fixed bundle of LLM call settings for one *kind* of generation.

    Three tiers, each mapped to a purpose-fit model:
      - ROUTING: lightweight classification (8B)
      - STRUCTURED: deterministic JSON forecasts (large MoE)
      - CONVERSATIONAL: warm streamed chat (70B instruct)
    """

    name: str
    model_tier: str          # "routing" | "structured" | "conversational"
    temperature: float
    json_mode: bool
    stream: bool
    max_tokens: int


ROUTING_PROFILE = GenerationProfile(
    name="routing",
    model_tier="routing",
    temperature=0.0,
    json_mode=True,
    stream=False,
    max_tokens=256,
)
FORECAST_PROFILE = GenerationProfile(
    name="forecast",
    model_tier="structured",
    temperature=0.2,
    json_mode=True,
    stream=False,
    max_tokens=2048,
)
CHAT_PROFILE = GenerationProfile(
    name="chat",
    model_tier="conversational",
    temperature=0.7,
    json_mode=False,
    stream=True,
    max_tokens=1024,
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # Runtime
    aroha_env: str = Field(default="dev")
    aroha_region: str = Field(default="ap-south-1")

    # Auth
    firebase_credentials_file: str = Field(default="")
    aroha_dev_auth_bypass: bool = Field(default=True)
    dev_user_id: str = Field(default="dev-user-0001")

    # NIM — base
    nvidia_nim_api_key: str = Field(default="")
    nvidia_nim_base_url: str = Field(default="https://integrate.api.nvidia.com/v1")

    # NIM — tiered model routing
    model_routing: str = Field(default="meta/llama-3.1-8b-instruct")
    model_structured: str = Field(default="mistralai/mixtral-8x22b-instruct")
    model_conversational: str = Field(default="meta/llama-3.1-70b-instruct")
    nim_summarizer_model: str = Field(default="meta/llama-3.1-8b-instruct")

    # Engine
    ayanamsa: str = Field(default="lahiri")
    se_ephe_path: str = Field(default="")
    engine_rule_version: str = Field(default="v1")

    # Supabase / Redis (used Phase 2.5+)
    supabase_url: str = Field(default="")
    supabase_service_role_key: str = Field(default="")
    database_url: str = Field(default="")
    redis_url: str = Field(default="redis://localhost:6379/0")

    # Ops
    cron_secret: str = Field(default="")
    telegram_bot_token: str = Field(default="")
    telegram_alert_chat_id: str = Field(default="")
    sentry_dsn: str = Field(default="")

    @property
    def is_prod(self) -> bool:
        return self.aroha_env.lower() in {"prod", "production"}

    def model_for_tier(self, tier: str) -> str:
        """Resolve a model ID from a generation-profile tier name."""
        return {
            "routing": self.model_routing,
            "structured": self.model_structured,
            "conversational": self.model_conversational,
        }.get(tier, self.model_structured)


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — import this everywhere rather than constructing Settings."""
    return Settings()
