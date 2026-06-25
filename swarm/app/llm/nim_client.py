"""NVIDIA NIM client — multi-key pool, tiered model routing, generation profiles.

Port of jyotish-backend/apps/api/src/lib/ai/aiProvider.ts. Resilience:
  - Dynamic key discovery (NVIDIA_NIM_API_KEY + _2.._20)
  - Dead-key kill list (auth/expired — skip for process lifetime)
  - Least-busy-first key selection (in-flight counter)
  - Model-degraded short-circuit (DEGRADED/410/500 inference-connection)
  - Exponential backoff retry with 429 Retry-After awareness

Tiered model routing (profile.model_tier resolves via Settings.model_for_tier):
  - routing:        meta/llama-3.1-8b-instruct       (fast classification)
  - structured:     mistralai/mixtral-8x22b-instruct  (deterministic JSON)
  - conversational: meta/llama-3.1-70b-instruct       (warm streamed chat)
"""

from __future__ import annotations

import asyncio
import json as _json
import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx

from app.config import GenerationProfile, get_settings

logger = logging.getLogger("aroha.nim")

# ---------------------------------------------------------------------------
# Key management (process-lifetime state, mirrors the TS module-level maps)
# ---------------------------------------------------------------------------

_dead_keys: dict[str, str] = {}
_in_flight: dict[str, int] = {}

_MAX_NUMBERED_SLOT = 20


def _sanitize_key(key: str) -> str:
    return key.replace("﻿", "").strip()


def get_available_keys() -> list[str]:
    import os

    collected: list[str] = []

    def push_if_set(raw: str | None) -> None:
        if not raw:
            return
        clean = _sanitize_key(raw)
        if clean:
            collected.append(clean)

    push_if_set(os.environ.get("NVIDIA_NIM_API_KEY"))
    for i in range(2, _MAX_NUMBERED_SLOT + 1):
        push_if_set(os.environ.get(f"NVIDIA_NIM_API_KEY_{i}"))

    all_keys = list(dict.fromkeys(collected))
    live = [k for k in all_keys if k not in _dead_keys]

    if not live and all_keys:
        logger.warning("All NIM keys were marked dead — resetting kill list")
        _dead_keys.clear()
        return all_keys
    return live


def _is_dead_key_error(status: int | None, msg: str) -> bool:
    if status in (401, 403):
        return True
    if re.search(r"invalid\s*api\s*key", msg, re.I):
        return True
    if re.search(r"api\s*key.*(expired|revoked|disabled)", msg, re.I):
        return True
    if re.search(r"unauthorized", msg, re.I):
        return True
    return False


def _is_model_degraded_error(status: int | None, msg: str) -> bool:
    if status == 400 and "DEGRADED" in msg:
        return True
    if status == 404 and re.search(r"not found for account", msg, re.I):
        return True
    if status == 410:
        return True
    if status == 500 and (
        "urn:inference-connection" in msg
        or re.search(r"inference connection error", msg, re.I)
    ):
        return True
    return False


def _resolve_model(profile: GenerationProfile) -> str:
    """Resolve the NIM model ID from the profile's tier."""
    return get_settings().model_for_tier(profile.model_tier)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

@dataclass
class NIMError(Exception):
    message: str
    status: int | None = None
    retry_after_ms: int | None = None

    def __str__(self) -> str:
        return self.message


class AllKeysExhaustedError(NIMError):
    pass


class ModelDegradedError(NIMError):
    pass


# ---------------------------------------------------------------------------
# Core: key-fallback
# ---------------------------------------------------------------------------

async def _call_nim_once(
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
    if profile.json_mode:
        body["response_format"] = {"type": "json_object"}

    resp = await client.post(
        f"{settings.nvidia_nim_base_url}/chat/completions",
        json=body,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=270.0,
    )

    if resp.status_code != 200:
        err_text = resp.text
        err = NIMError(
            message=f"NIM error {resp.status_code}: {err_text[:300]}",
            status=resp.status_code,
        )
        if resp.status_code == 429:
            ra = resp.headers.get("retry-after")
            if ra:
                try:
                    err.retry_after_ms = int(float(ra) * 1000)
                except ValueError:
                    pass
        raise err

    return resp.json()


async def _stream_nim(
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
        f"{settings.nvidia_nim_base_url}/chat/completions",
        json=body,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=270.0,
    ) as resp:
        if resp.status_code != 200:
            err_text = await resp.aread()
            raise NIMError(
                message=f"NIM error {resp.status_code}: {err_text.decode()[:300]}",
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


async def _fetch_with_key_fallback(
    client: httpx.AsyncClient,
    keys: list[str],
    model: str,
    messages: list[dict],
    profile: GenerationProfile,
    *,
    streaming: bool = False,
):
    if not keys:
        raise AllKeysExhaustedError("No NVIDIA NIM API key configured")

    order = sorted(
        enumerate(keys),
        key=lambda ik: (_in_flight.get(ik[1], 0), ik[0]),
    )

    last_error: Exception | None = None
    for attempt, (orig_idx, key) in enumerate(order):
        if key in _dead_keys:
            continue

        _in_flight[key] = _in_flight.get(key, 0) + 1
        try:
            if streaming:
                return _stream_nim(client, key, model, messages, profile)
            else:
                return await _call_nim_once(client, key, model, messages, profile)
        except NIMError as err:
            last_error = err
            if _is_dead_key_error(err.status, err.message):
                _dead_keys[key] = err.message[:100]
                logger.warning(
                    "NIM key ...%s marked DEAD: %s", key[-6:], err.message[:100]
                )
                continue
            if _is_model_degraded_error(err.status, err.message):
                logger.warning(
                    "NIM model degraded on key %d/%d — skipping remaining keys",
                    orig_idx + 1,
                    len(keys),
                )
                raise ModelDegradedError(err.message, status=err.status) from err
            if attempt < len(order) - 1:
                logger.warning(
                    "NIM key %d/%d failed (status=%s) — trying next",
                    orig_idx + 1,
                    len(keys),
                    err.status,
                )
            continue
        except Exception as err:
            last_error = err
            if attempt < len(order) - 1:
                logger.warning(
                    "NIM key %d/%d exception: %s — trying next",
                    orig_idx + 1,
                    len(keys),
                    err,
                )
                continue
        finally:
            count = _in_flight.get(key, 1) - 1
            if count <= 0:
                _in_flight.pop(key, None)
            else:
                _in_flight[key] = count

    if last_error is None:
        last_error = AllKeysExhaustedError(
            "All NIM keys are dead — rotate in env"
        )
    raise last_error


# ---------------------------------------------------------------------------
# Retry wrapper (429-aware)
# ---------------------------------------------------------------------------

_MAX_429_WAITS = 5
_MAX_RETRY_AFTER_MS = 60_000


async def _with_retry(fn, max_retries: int = 3):
    last_error: Exception | None = None
    attempt = 0
    rate_limit_waits = 0

    while attempt < max_retries:
        try:
            return await fn()
        except NIMError as err:
            last_error = err
            if err.status == 429 and rate_limit_waits < _MAX_429_WAITS:
                fallback = min(
                    2000 * (2**rate_limit_waits), _MAX_RETRY_AFTER_MS
                )
                wait_ms = min(err.retry_after_ms or fallback, _MAX_RETRY_AFTER_MS)
                logger.warning("NIM 429 rate-limited, waiting %dms", wait_ms)
                rate_limit_waits += 1
                await asyncio.sleep(wait_ms / 1000)
                continue
            if isinstance(err, ModelDegradedError):
                raise
            attempt += 1
            if attempt < max_retries:
                delay = min(1000 * (2 ** (attempt - 1)), 8000)
                await asyncio.sleep(delay / 1000)
        except Exception as err:
            last_error = err
            attempt += 1
            if attempt < max_retries:
                delay = min(1000 * (2 ** (attempt - 1)), 8000)
                await asyncio.sleep(delay / 1000)

    raise last_error  # type: ignore[misc]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def generate(
    messages: list[dict],
    profile: GenerationProfile,
    *,
    system: str | None = None,
) -> str:
    """Buffered generation (forecast/interpretation). Returns the full text.

    Model is resolved from profile.model_tier via Settings.model_for_tier.
    """
    keys = get_available_keys()
    model = _resolve_model(profile)

    if system:
        messages = [{"role": "system", "content": system}, *messages]

    async with httpx.AsyncClient() as client:

        async def _attempt():
            return await _fetch_with_key_fallback(
                client, keys, model, messages, profile
            )

        data = await _with_retry(_attempt)
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
    """Streaming generation (chat). Yields token deltas.

    Model is resolved from profile.model_tier via Settings.model_for_tier.
    """
    keys = get_available_keys()
    model = _resolve_model(profile)

    if system:
        messages = [{"role": "system", "content": system}, *messages]

    async with httpx.AsyncClient() as client:
        result = await _fetch_with_key_fallback(
            client, keys, model, messages, profile, streaming=True
        )
        async for token in result:
            yield token
