"""LLM dispatcher — routes calls to Groq (primary) or NIM (fallback) by tier.

Routing rules
─────────────
  STRUCTURED tier  → always NIM (Mixtral-8x22B — not available on Groq)
  CONVERSATIONAL   → Groq first → NIM on AllGroqKeysExhaustedError
  ROUTING          → Groq first → NIM on AllGroqKeysExhaustedError

All agents should import from here instead of directly from nim_client or
groq_client so the routing logic is centralised in one place.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from app.config import GenerationProfile
from app.llm import groq_client, nim_client
from app.llm.groq_client import AllGroqKeysExhaustedError

logger = logging.getLogger("aroha.dispatcher")


async def generate(
    messages: list[dict],
    profile: GenerationProfile,
    *,
    system: str | None = None,
) -> str:
    """Buffered generation with provider routing.

    STRUCTURED → NIM always (Mixtral-8x22B deterministic JSON).
    CONVERSATIONAL / ROUTING → Groq primary, NIM fallback.
    """
    if profile.model_tier == "structured":
        return await nim_client.generate(messages, profile, system=system)

    try:
        return await groq_client.generate(messages, profile, system=system)
    except AllGroqKeysExhaustedError as exc:
        logger.warning(
            "Groq exhausted for profile=%s (%s) — falling back to NIM",
            profile.name, exc,
        )
        return await nim_client.generate(messages, profile, system=system)
    except Exception as exc:
        logger.warning(
            "Groq unexpected error for profile=%s (%s) — falling back to NIM",
            profile.name, exc,
        )
        return await nim_client.generate(messages, profile, system=system)


async def stream(
    messages: list[dict],
    profile: GenerationProfile,
    *,
    system: str | None = None,
) -> AsyncIterator[str]:
    """Streaming generation with provider routing.

    CONVERSATIONAL → Groq primary, NIM fallback.
    """
    if profile.model_tier == "structured":
        # Structured profiles are never streamed, but guard anyway
        async for token in nim_client.stream(messages, profile, system=system):
            yield token
        return

    try:
        async for token in groq_client.stream(messages, profile, system=system):
            yield token
        return
    except AllGroqKeysExhaustedError as exc:
        logger.warning(
            "Groq exhausted for streaming profile=%s (%s) — falling back to NIM",
            profile.name, exc,
        )
    except Exception as exc:
        logger.warning(
            "Groq unexpected error for streaming profile=%s (%s) — falling back to NIM",
            profile.name, exc,
        )

    # NIM fallback for streaming
    async for token in nim_client.stream(messages, profile, system=system):
        yield token
