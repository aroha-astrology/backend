"""Groq LLM client — multi-key pool, 40 req/min sliding-window rate limiter.

Mirrors the architecture of nim_client.py so llm_dispatcher.py can swap
providers transparently.

Key management:
  - Reads GROQ_API_KEY, GROQ_API_KEY_2 … GROQ_API_KEY_20 from env
  - Dead-key kill list (401/403 — skip for process lifetime)
  - Least-used-first key selection via sliding 60s window counter
  - On 429: marks key as rate-limited for remainder of window, rotates instantly
  - AllGroqKeysExhaustedError raised when all keys are at limit/dead → caller falls back to NIM

Model routing (via config.py):
  - conversational: llama-3.3-70b-versatile   (Scholar chat)
  - routing:        llama-3.1-8b-instant       (intent classification, summarizer)
  - structured:     NOT used — NIM Mixtral-8x22B handles that tier
"""

from __future__ import annotations

import asyncio
import json as _json
import logging
import os
import re
import time
from collections import deque
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

import httpx

from app.config import GenerationProfile, get_settings

logger = logging.getLogger("aroha.groq")

# ---------------------------------------------------------------------------
# Process-lifetime key state
# ---------------------------------------------------------------------------

_dead_keys: dict[str, str] = {}          # key → reason
_rate_windows: dict[str, deque] = {}     # key → deque of UNIX timestamps (last 60s)
_MAX_NUMBERED_SLOT = 20
_WINDOW_SECONDS = 60


def _sanitize_key(key: str) -> str:
    return key.replace("\ufeff", "").strip()


def get_available_keys() -> list[str]:
    """Collect all configured Groq keys, excluding dead ones."""
    collected: list[str] = []

    def push_if_set(raw: str | None) -> None:
        if not raw:
            return
        clean = _sanitize_key(raw)
        if clean:
            collected.append(clean)

    push_if_set(os.environ.get("GROQ_API_KEY"))
    for i in range(2, _MAX_NUMBERED_SLOT + 1):
        push_if_set(os.environ.get(f"GROQ_API_KEY_{i}"))

    all_keys = list(dict.fromkeys(collected))  # deduplicate, preserve order
    live = [k for k in all_keys if k not in _dead_keys]

    if not live and all_keys:
        logger.warning("All Groq keys were marked dead — resetting kill list")
        _dead_keys.clear()
        return all_keys
    return live


def _requests_this_window(key: str) -> int:
    """Count requests made on this key in the last 60 seconds."""
    now = time.monotonic()
    if key not in _rate_windows:
        _rate_windows[key] = deque()
    dq = _rate_windows[key]
    # Evict expired timestamps
    while dq and now - dq[0] > _WINDOW_SECONDS:
        dq.popleft()
    return len(dq)


def _record_request(key: str) -> None:
    """Record a new request timestamp for this key."""
    if key not in _rate_windows:
        _rate_windows[key] = deque()
    _rate_windows[key].append(time.monotonic())


def _is_rate_limited(key: str) -> bool:
    """Return True if this key has hit the configured RPM limit."""
    rpm_limit = get_settings().groq_rpm_limit
    return _requests_this_window(key) >= rpm_limit


def _pick_key(keys: list[str]) -> str | None:
    """Pick the least-used live key that hasn't hit its RPM limit."""
    candidates = [
        (k, _requests_this_window(k))
        for k in keys
        if k not in _dead_keys and not _is_rate_limited(k)
    ]
    if not candidates:
        return None
    # Least-busy first
    candidates.sort(key=lambda x: x[1])
    return candidates[0][0]


# ---------------------------------------------------------------------------
# Error types
# ---------------------------------------------------------------------------

@dataclass
class GroqError(Exception):
    message: str
    status: int | None = None

    def __str__(self) -> str:
        return self.message


class AllGroqKeysExhaustedError(GroqError):
    """Raised when every configured key is dead or rate-limited this window."""
    pass


def _is_dead_key_error(status: int | None, msg: str) -> bool:
    if status in (401, 403):
        return True
    if re.search(r"invalid\s*api\s*key", msg, re.I):
        return True
    if re.search(r"api\s*key.*(expired|revoked|disabled)", msg, re.I):
        return True
    return False


# ---------------------------------------------------------------------------
# Model resolution
# ---------------------------------------------------------------------------

def _resolve_model(profile: GenerationProfile) -> str:
    s = get_settings()
    if profile.model_tier == "conversational":
        return s.groq_model_conversational
    # routing tier and anything else → fast 8B
    return s.groq_model_routing


# ---------------------------------------------------------------------------
# Core single-call helpers
# ---------------------------------------------------------------------------

async def _call_groq_once(
    client: httpx.AsyncClient,
    api_key: str,
    model: str,
    messages: list[dict],
    profile: GenerationProfile,
) -> dict:
    settings = get_settings()
    body: dict = {
        "model": model,
        "messages": messages,
        "max_tokens": profile.max_tokens,
        "temperature": profile.temperature,
        "stream": False,
    }

    resp = await client.post(
        f"{settings.groq_base_url}/chat/completions",
        json=body,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=60.0,
    )

    if resp.status_code != 200:
        err_text = resp.text
        raise GroqError(
            message=f"Groq error {resp.status_code}: {err_text[:300]}",
            status=resp.status_code,
        )

    return resp.json()


async def _stream_groq(
    client: httpx.AsyncClient,
    api_key: str,
    model: str,
    messages: list[dict],
    profile: GenerationProfile,
) -> AsyncIterator[str]:
    settings = get_settings()
    body: dict = {
        "model": model,
        "messages": messages,
        "max_tokens": profile.max_tokens,
        "temperature": profile.temperature,
        "stream": True,
    }

    async with client.stream(
        "POST",
        f"{settings.groq_base_url}/chat/completions",
        json=body,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=60.0,
    ) as resp:
        if resp.status_code != 200:
            err_text = await resp.aread()
            raise GroqError(
                message=f"Groq error {resp.status_code}: {err_text.decode()[:300]}",
                status=resp.status_code,
            )
        async for line in resp.aiter_lines():
            if not line.startswith("data: "):
                continue
            payload = line[6:].strip()
            if payload == "[DONE]":
                return
            try:
                chunk = _json.loads(payload)
            except _json.JSONDecodeError:
                continue
            delta = chunk.get("choices", [{}])[0].get("delta", {})
            content = delta.get("content")
            if content:
                yield content


# ---------------------------------------------------------------------------
# Key-rotating wrapper
# ---------------------------------------------------------------------------

async def _with_key_rotation(
    keys: list[str],
    model: str,
    messages: list[dict],
    profile: GenerationProfile,
    *,
    streaming: bool = False,
):
    """Try each available key in least-busy order. Raise AllGroqKeysExhaustedError if all fail."""
    if not keys:
        raise AllGroqKeysExhaustedError("No Groq API keys configured")

    async with httpx.AsyncClient() as client:
        # Try up to len(keys) times, rotating on rate-limit or transient errors
        attempts = 0
        max_attempts = len(keys) * 2  # allow retrying after brief wait

        while attempts < max_attempts:
            key = _pick_key(keys)
            if key is None:
                # All keys rate-limited — wait until the oldest window entry expires
                logger.warning(
                    "All %d Groq keys at RPM limit — waiting for window to clear", len(keys)
                )
                raise AllGroqKeysExhaustedError(
                    f"All {len(keys)} Groq keys have hit the {get_settings().groq_rpm_limit} req/min limit"
                )

            _record_request(key)
            attempts += 1

            try:
                if streaming:
                    return _stream_groq(client, key, model, messages, profile)
                else:
                    return await _call_groq_once(client, key, model, messages, profile)

            except GroqError as err:
                if _is_dead_key_error(err.status, err.message):
                    _dead_keys[key] = err.message[:100]
                    logger.warning(
                        "Groq key ...%s marked DEAD: %s", key[-6:], err.message[:100]
                    )
                    continue

                if err.status == 429:
                    # Force this key to look fully used for this window
                    logger.warning(
                        "Groq key ...%s returned 429 — rotating to next key", key[-6:]
                    )
                    rpm_limit = get_settings().groq_rpm_limit
                    now = time.monotonic()
                    dq = _rate_windows.setdefault(key, deque())
                    while len(dq) < rpm_limit:
                        dq.append(now)
                    continue

                logger.warning(
                    "Groq key ...%s error (status=%s): %s — rotating",
                    key[-6:], err.status, err.message[:80],
                )
                continue

            except Exception as err:
                logger.warning("Groq key ...%s exception: %s — rotating", key[-6:], err)
                continue

    raise AllGroqKeysExhaustedError(
        f"All Groq keys failed after {attempts} attempts"
    )


# ---------------------------------------------------------------------------
# Public API (same signatures as nim_client for drop-in use via dispatcher)
# ---------------------------------------------------------------------------

async def generate(
    messages: list[dict],
    profile: GenerationProfile,
    *,
    system: str | None = None,
) -> str:
    """Buffered generation. Returns the full response text."""
    keys = get_available_keys()
    model = _resolve_model(profile)

    if system:
        messages = [{"role": "system", "content": system}, *messages]

    data = await _with_key_rotation(keys, model, messages, profile, streaming=False)
    return (
        data.get("choices", [{}])[0]
        .get("message", {})
        .get("content", "")
    )


async def stream(
    messages: list[dict],
    profile: GenerationProfile,
    *,
    system: str | None = None,
) -> AsyncIterator[str]:
    """Streaming generation. Yields token deltas."""
    keys = get_available_keys()
    model = _resolve_model(profile)

    if system:
        messages = [{"role": "system", "content": system}, *messages]

    result = await _with_key_rotation(keys, model, messages, profile, streaming=True)
    async for token in result:
        yield token
