// =============================================================================
// NVIDIA NIM LLM Client
// Multi-key pool with dead-key cooldown, least-busy-first selection,
// retry with 429 Retry-After awareness, exponential backoff, per-request
// timeout + caller-driven cancellation.
// =============================================================================

import { env } from '../../config/env.js';
import { modelForTier, type GenerationProfile } from '../../config/llm.js';
import { logger } from '../logger.js';

// =============================================================================
// Error Classes
// =============================================================================

export class NIMError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'NIMError';
  }
}

export class AllKeysExhaustedError extends NIMError {
  constructor(message = 'All API keys are exhausted or dead') {
    super(message);
    this.name = 'AllKeysExhaustedError';
  }
}

export class ModelDegradedError extends NIMError {
  constructor(message: string, statusCode?: number, body?: string) {
    super(message, statusCode, body);
    this.name = 'ModelDegradedError';
  }
}

// =============================================================================
// Key Pool
// =============================================================================

interface KeyState {
  key: string;
  /** Epoch ms until which this key is considered dead; 0 = alive. */
  deadUntil: number;
  inflight: number;
}

/** A dead key is retired only temporarily, so transient 401/403s self-heal. */
const DEAD_KEY_COOLDOWN_MS = 5 * 60_000;
/**
 * A timeout/network-error is a weaker signal than a clean 401/403 (could be
 * one slow request), so it gets a much shorter cooldown than a dead key —
 * just enough to push the next attempt onto a different key instead of
 * re-hitting whichever key just hung, without fully sidelining it.
 */
const TIMEOUT_COOLDOWN_MS = 30_000;

function loadKeys(): KeyState[] {
  const keys: KeyState[] = [];

  if (env.NVIDIA_NIM_API_KEY) {
    keys.push({ key: env.NVIDIA_NIM_API_KEY, deadUntil: 0, inflight: 0 });
  }

  for (let i = 2; i <= 20; i++) {
    const envKey = `NVIDIA_NIM_API_KEY_${i}` as keyof typeof env;
    const value = env[envKey] as string | undefined;
    if (value) {
      keys.push({ key: value, deadUntil: 0, inflight: 0 });
    }
  }

  return keys;
}

const keyPool: KeyState[] = loadKeys();

function markDead(keyState: KeyState): void {
  keyState.deadUntil = Date.now() + DEAD_KEY_COOLDOWN_MS;
}

/** Never shortens an existing longer cooldown (e.g. an already-dead key). */
function markTimedOut(keyState: KeyState): void {
  keyState.deadUntil = Math.max(keyState.deadUntil, Date.now() + TIMEOUT_COOLDOWN_MS);
}

// =============================================================================
// Dead-Key / Model-Degraded Detection
// =============================================================================

function isDeadKeyError(status: number, msg: string): boolean {
  if (status === 401 || status === 403) return true;
  if (/invalid\s*api\s*key/i.test(msg)) return true;
  if (/api\s*key.*(expired|revoked|disabled)/i.test(msg)) return true;
  if (/unauthorized/i.test(msg)) return true;
  return false;
}

function isModelDegraded(status: number, msg: string): boolean {
  if (status === 400 && /degraded/i.test(msg)) return true;
  if (status === 404 && /not\s*found/i.test(msg)) return true;
  if (status === 410) return true;
  if (status === 500 && /inference.connection/i.test(msg)) return true;
  return false;
}

// =============================================================================
// Key Selection (least-busy-first, skip keys in cooldown)
// =============================================================================

function selectKey(): KeyState | null {
  const now = Date.now();
  const alive = keyPool.filter((k) => k.deadUntil <= now);
  if (alive.length === 0) return null;
  alive.sort((a, b) => a.inflight - b.inflight);
  return alive[0] ?? null;
}

// =============================================================================
// Backoff + cancellation helpers
// =============================================================================

function generalBackoff(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt - 1), 8000);
}

function rateLimitBackoff(rateLimitWaits: number): number {
  return Math.min(2000 * Math.pow(2, rateLimitWaits), 60000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Default per-request wall-clock cap (covers connect, headers, and body). */
const GENERATE_TIMEOUT_MS = 60_000;
const STREAM_TIMEOUT_MS = 120_000;

/**
 * Combine an optional caller AbortSignal with a timeout into a single signal,
 * so a hung upstream OR a client disconnect aborts the in-flight fetch.
 */
function makeAbort(external: AbortSignal | undefined, ms: number) {
  const ac = new AbortController();
  const onExternal = () => ac.abort();
  if (external) {
    if (external.aborted) ac.abort();
    else external.addEventListener('abort', onExternal, { once: true });
  }
  const timer = setTimeout(() => ac.abort(), ms);
  return {
    signal: ac.signal,
    clear: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternal);
    },
  };
}

// =============================================================================
// Request Types
// =============================================================================

interface ChatMessage {
  role: string;
  content: string;
}

interface NIMRequestOptions {
  profile: GenerationProfile;
  messages: ChatMessage[];
  /** Override the model for this request. */
  model?: string;
  /** Caller cancellation (e.g. client disconnect on an SSE stream). */
  signal?: AbortSignal | undefined;
  /** Override GENERATE_TIMEOUT_MS for this call (e.g. a large background job). */
  timeoutMs?: number;
}

interface NIMChoice {
  message?: { content: string };
  delta?: { content?: string };
  finish_reason?: string;
}

interface NIMResponse {
  choices: NIMChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

// =============================================================================
// Core Request (single attempt with a specific key)
// =============================================================================

async function doRequest(
  keyState: KeyState,
  opts: NIMRequestOptions,
  signal: AbortSignal,
): Promise<Response> {
  const model = opts.model ?? modelForTier(opts.profile.modelTier);
  const baseUrl = env.NVIDIA_NIM_BASE_URL;

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.profile.temperature,
    max_tokens: opts.profile.maxTokens,
    stream: opts.profile.stream,
  };

  if (opts.profile.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  return fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${keyState.key}`,
    },
    body: JSON.stringify(body),
    signal,
  });
}

// =============================================================================
// Buffered Generate (non-streaming)
// =============================================================================

export async function generate(opts: NIMRequestOptions): Promise<string> {
  if (keyPool.length === 0) {
    throw new AllKeysExhaustedError('No API keys configured');
  }

  const MAX_ATTEMPTS = 3;
  const MAX_RATE_LIMIT_RETRIES = 5;
  let rateLimitWaits = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const keyState = selectKey();
    if (!keyState) {
      throw new AllKeysExhaustedError();
    }

    keyState.inflight++;
    const abort = makeAbort(opts.signal, opts.timeoutMs ?? GENERATE_TIMEOUT_MS);
    let response: Response;
    let bodyText: string;

    try {
      const nonStreamProfile: GenerationProfile = { ...opts.profile, stream: false };
      response = await doRequest(keyState, { ...opts, profile: nonStreamProfile }, abort.signal);
      bodyText = await response.text();
    } catch (err) {
      logger.warn({ err, attempt }, 'NIM request network error/timeout');
      markTimedOut(keyState);
      if (attempt < MAX_ATTEMPTS) {
        await sleep(generalBackoff(attempt));
        continue;
      }
      throw new NIMError(`Network error after ${MAX_ATTEMPTS} attempts: ${String(err)}`);
    } finally {
      keyState.inflight--;
      abort.clear();
    }

    // Dead key detection
    if (isDeadKeyError(response.status, bodyText)) {
      logger.warn({ status: response.status }, 'NIM key marked dead (cooldown)');
      markDead(keyState);
      attempt--; // try next key immediately, don't count as a retry
      continue;
    }

    if (isModelDegraded(response.status, bodyText)) {
      throw new ModelDegradedError(`Model degraded: ${response.status}`, response.status, bodyText);
    }

    if (response.status === 429) {
      if (rateLimitWaits >= MAX_RATE_LIMIT_RETRIES) {
        throw new NIMError(`Rate limited after ${MAX_RATE_LIMIT_RETRIES} waits`, 429, bodyText);
      }
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
      const waitMs = Number.isNaN(retryAfterSec)
        ? rateLimitBackoff(rateLimitWaits)
        : retryAfterSec * 1000;
      logger.warn({ waitMs, rateLimitWaits }, 'NIM 429 rate limited, backing off');
      await sleep(waitMs);
      rateLimitWaits++;
      attempt--;
      continue;
    }

    if (!response.ok) {
      logger.warn({ status: response.status, body: bodyText.slice(0, 500) }, 'NIM API error');
      if (attempt < MAX_ATTEMPTS) {
        await sleep(generalBackoff(attempt));
        continue;
      }
      throw new NIMError(
        `NIM API error ${response.status}: ${bodyText.slice(0, 500)}`,
        response.status,
        bodyText,
      );
    }

    // Success — guard the parse so a malformed 200 body doesn't throw raw.
    let data: NIMResponse;
    try {
      data = JSON.parse(bodyText) as NIMResponse;
    } catch (parseErr) {
      logger.warn({ sample: bodyText.slice(0, 500) }, 'NIM success body not valid JSON');
      throw new NIMError(
        `NIM returned non-JSON success body: ${String(parseErr)}`,
        response.status,
      );
    }
    const content = data.choices?.[0]?.message?.content ?? '';
    logger.debug(
      { model: opts.model ?? modelForTier(opts.profile.modelTier), usage: data.usage },
      'NIM generate success',
    );
    return content;
  }

  throw new NIMError('Exhausted all retry attempts');
}

// =============================================================================
// Streaming Generate (SSE async generator)
// =============================================================================

export async function* stream(opts: NIMRequestOptions): AsyncGenerator<string, void, unknown> {
  if (keyPool.length === 0) {
    throw new AllKeysExhaustedError('No API keys configured');
  }

  const MAX_ATTEMPTS = 3;
  const MAX_RATE_LIMIT_RETRIES = 5;
  let rateLimitWaits = 0;
  // Once we have emitted tokens to the consumer we must NOT silently retry and
  // replay a fresh completion — that produces duplicated/garbled output.
  let yieldedAny = false;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const keyState = selectKey();
    if (!keyState) {
      throw new AllKeysExhaustedError();
    }

    keyState.inflight++;
    const abort = makeAbort(opts.signal, STREAM_TIMEOUT_MS);
    try {
      const streamProfile: GenerationProfile = { ...opts.profile, stream: true };
      let response: Response;
      try {
        response = await doRequest(keyState, { ...opts, profile: streamProfile }, abort.signal);
      } catch (err) {
        logger.warn({ err, attempt }, 'NIM stream request network error/timeout');
        markTimedOut(keyState);
        if (attempt < MAX_ATTEMPTS) {
          await sleep(generalBackoff(attempt));
          continue;
        }
        throw new NIMError(`Network error after ${MAX_ATTEMPTS} attempts: ${String(err)}`);
      }

      // Error handling BEFORE any token is yielded.
      if (!response.ok) {
        const bodyText = await response.text();

        if (isDeadKeyError(response.status, bodyText)) {
          markDead(keyState);
          attempt--;
          continue;
        }
        if (isModelDegraded(response.status, bodyText)) {
          throw new ModelDegradedError(
            `Model degraded: ${response.status}`,
            response.status,
            bodyText,
          );
        }
        if (response.status === 429) {
          if (rateLimitWaits >= MAX_RATE_LIMIT_RETRIES) {
            throw new NIMError(`Rate limited after ${MAX_RATE_LIMIT_RETRIES} waits`, 429, bodyText);
          }
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
          const waitMs = Number.isNaN(retryAfterSec)
            ? rateLimitBackoff(rateLimitWaits)
            : retryAfterSec * 1000;
          logger.warn({ waitMs, rateLimitWaits }, 'NIM stream 429 rate limited');
          await sleep(waitMs);
          rateLimitWaits++;
          attempt--;
          continue;
        }

        logger.warn(
          { status: response.status, body: bodyText.slice(0, 500) },
          'NIM stream API error',
        );
        if (attempt < MAX_ATTEMPTS) {
          await sleep(generalBackoff(attempt));
          continue;
        }
        throw new NIMError(
          `NIM API error ${response.status}: ${bodyText.slice(0, 500)}`,
          response.status,
          bodyText,
        );
      }

      if (!response.body) {
        throw new NIMError('Response body is null for streaming request');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (trimmed === 'data: [DONE]') continue;
            if (trimmed.startsWith('data: ')) {
              try {
                const chunk = JSON.parse(trimmed.slice(6)) as NIMResponse;
                const delta = chunk.choices?.[0]?.delta?.content;
                if (delta) {
                  yieldedAny = true;
                  yield delta;
                }
              } catch {
                logger.debug({ sample: trimmed.slice(0, 200) }, 'Skipping malformed SSE chunk');
              }
            }
          }
        }

        if (buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
          try {
            const chunk = JSON.parse(buffer.trim().slice(6)) as NIMResponse;
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              yieldedAny = true;
              yield delta;
            }
          } catch {
            // ignore trailing partial
          }
        }
      } finally {
        reader.releaseLock();
      }

      return; // streamed to completion
    } catch (err) {
      if (
        err instanceof NIMError ||
        err instanceof ModelDegradedError ||
        err instanceof AllKeysExhaustedError
      ) {
        throw err;
      }
      // A read error AFTER tokens were emitted cannot be retried safely.
      if (yieldedAny) {
        throw new NIMError(`Stream interrupted after partial output: ${String(err)}`);
      }
      logger.warn({ err, attempt }, 'NIM stream read error');
      if (attempt < MAX_ATTEMPTS) {
        await sleep(generalBackoff(attempt));
        continue;
      }
      throw new NIMError(`Stream read error after ${MAX_ATTEMPTS} attempts: ${String(err)}`);
    } finally {
      keyState.inflight--;
      abort.clear();
    }
  }

  throw new NIMError('Exhausted all retry attempts for streaming');
}
