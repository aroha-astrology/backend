// =============================================================================
// NVIDIA NIM LLM Client
// Multi-key pool with dead-key tracking, least-busy-first selection,
// retry with 429 Retry-After awareness, and exponential backoff.
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
  constructor(
    message: string,
    statusCode?: number,
    body?: string,
  ) {
    super(message, statusCode, body);
    this.name = 'ModelDegradedError';
  }
}

// =============================================================================
// Key Pool
// =============================================================================

interface KeyState {
  key: string;
  dead: boolean;
  inflight: number;
}

function loadKeys(): KeyState[] {
  const keys: KeyState[] = [];

  // NVIDIA_NIM_API_KEY is the primary key
  if (env.NVIDIA_NIM_API_KEY) {
    keys.push({ key: env.NVIDIA_NIM_API_KEY, dead: false, inflight: 0 });
  }

  // NVIDIA_NIM_API_KEY_2 .. NVIDIA_NIM_API_KEY_20
  for (let i = 2; i <= 20; i++) {
    const envKey = `NVIDIA_NIM_API_KEY_${i}` as keyof typeof env;
    const value = env[envKey] as string | undefined;
    if (value) {
      keys.push({ key: value, dead: false, inflight: 0 });
    }
  }

  return keys;
}

const keyPool: KeyState[] = loadKeys();

// =============================================================================
// Dead-Key Detection
// =============================================================================

function isDeadKeyError(status: number, msg: string): boolean {
  if (status === 401 || status === 403) return true;
  if (/invalid\s*api\s*key/i.test(msg)) return true;
  if (/api\s*key.*(expired|revoked|disabled)/i.test(msg)) return true;
  if (/unauthorized/i.test(msg)) return true;
  return false;
}

// =============================================================================
// Model-Degraded Detection
// =============================================================================

function isModelDegraded(status: number, msg: string): boolean {
  if (status === 400 && /degraded/i.test(msg)) return true;
  if (status === 404 && /not\s*found/i.test(msg)) return true;
  if (status === 410) return true;
  if (status === 500 && /inference.connection/i.test(msg)) return true;
  return false;
}

// =============================================================================
// Key Selection (least-busy-first, skip dead)
// =============================================================================

function selectKey(): KeyState | null {
  const alive = keyPool.filter((k) => !k.dead);
  if (alive.length === 0) return null;
  // Sort by inflight count ascending (least busy first)
  alive.sort((a, b) => a.inflight - b.inflight);
  return alive[0] ?? null;
}

// =============================================================================
// Backoff Helpers
// =============================================================================

function generalBackoff(attempt: number): number {
  // min(1000 * 2^(attempt-1), 8000) ms
  return Math.min(1000 * Math.pow(2, attempt - 1), 8000);
}

function rateLimitBackoff(rateLimitWaits: number): number {
  // min(2000 * 2^rateLimitWaits, 60000) ms
  return Math.min(2000 * Math.pow(2, rateLimitWaits), 60000);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${keyState.key}`,
    },
    body: JSON.stringify(body),
  });

  return response;
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
    let response: Response;

    try {
      // Build a non-streaming profile for generate
      const nonStreamProfile: GenerationProfile = { ...opts.profile, stream: false };
      response = await doRequest(keyState, { ...opts, profile: nonStreamProfile });
    } catch (err) {
      keyState.inflight--;
      logger.warn({ err, attempt }, 'NIM request network error');
      if (attempt < MAX_ATTEMPTS) {
        await sleep(generalBackoff(attempt));
        continue;
      }
      throw new NIMError(`Network error after ${MAX_ATTEMPTS} attempts: ${String(err)}`);
    }

    keyState.inflight--;
    const bodyText = await response.text();

    // Dead key detection
    if (isDeadKeyError(response.status, bodyText)) {
      logger.warn({ status: response.status }, 'NIM key marked dead');
      keyState.dead = true;
      // Try next key immediately (don't count as retry)
      attempt--;
      continue;
    }

    // Model degraded detection
    if (isModelDegraded(response.status, bodyText)) {
      throw new ModelDegradedError(
        `Model degraded: ${response.status}`,
        response.status,
        bodyText,
      );
    }

    // 429 rate limit
    if (response.status === 429) {
      if (rateLimitWaits >= MAX_RATE_LIMIT_RETRIES) {
        throw new NIMError(`Rate limited after ${MAX_RATE_LIMIT_RETRIES} waits`, 429, bodyText);
      }
      const retryAfterHeader = response.headers.get('Retry-After');
      let waitMs: number;
      if (retryAfterHeader) {
        const retryAfterSec = parseInt(retryAfterHeader, 10);
        waitMs = Number.isNaN(retryAfterSec)
          ? rateLimitBackoff(rateLimitWaits)
          : retryAfterSec * 1000;
      } else {
        waitMs = rateLimitBackoff(rateLimitWaits);
      }
      logger.warn({ waitMs, rateLimitWaits }, 'NIM 429 rate limited, backing off');
      await sleep(waitMs);
      rateLimitWaits++;
      attempt--; // Don't count 429 as a regular attempt
      continue;
    }

    // Other errors
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

    // Success
    const data = JSON.parse(bodyText) as NIMResponse;
    const content = data.choices?.[0]?.message?.content ?? '';
    logger.debug({ model: opts.model ?? modelForTier(opts.profile.modelTier), usage: data.usage }, 'NIM generate success');
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

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const keyState = selectKey();
    if (!keyState) {
      throw new AllKeysExhaustedError();
    }

    keyState.inflight++;
    let response: Response;

    try {
      // Build a streaming profile
      const streamProfile: GenerationProfile = { ...opts.profile, stream: true };
      response = await doRequest(keyState, { ...opts, profile: streamProfile });
    } catch (err) {
      keyState.inflight--;
      logger.warn({ err, attempt }, 'NIM stream request network error');
      if (attempt < MAX_ATTEMPTS) {
        await sleep(generalBackoff(attempt));
        continue;
      }
      throw new NIMError(`Network error after ${MAX_ATTEMPTS} attempts: ${String(err)}`);
    }

    // Check for errors before streaming
    if (isDeadKeyError(response.status, '')) {
      keyState.inflight--;
      keyState.dead = true;
      attempt--;
      continue;
    }

    if (response.status === 429) {
      keyState.inflight--;
      if (rateLimitWaits >= MAX_RATE_LIMIT_RETRIES) {
        throw new NIMError(`Rate limited after ${MAX_RATE_LIMIT_RETRIES} waits`, 429);
      }
      const retryAfterHeader = response.headers.get('Retry-After');
      let waitMs: number;
      if (retryAfterHeader) {
        const retryAfterSec = parseInt(retryAfterHeader, 10);
        waitMs = Number.isNaN(retryAfterSec)
          ? rateLimitBackoff(rateLimitWaits)
          : retryAfterSec * 1000;
      } else {
        waitMs = rateLimitBackoff(rateLimitWaits);
      }
      logger.warn({ waitMs, rateLimitWaits }, 'NIM stream 429 rate limited');
      await sleep(waitMs);
      rateLimitWaits++;
      attempt--;
      continue;
    }

    if (!response.ok) {
      keyState.inflight--;
      const bodyText = await response.text();

      if (isDeadKeyError(response.status, bodyText)) {
        keyState.dead = true;
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

      logger.warn({ status: response.status, body: bodyText.slice(0, 500) }, 'NIM stream API error');
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

    // Stream SSE response
    try {
      if (!response.body) {
        keyState.inflight--;
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

          // Process complete SSE lines
          const lines = buffer.split('\n');
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith(':')) continue;
            if (trimmed === 'data: [DONE]') continue;

            if (trimmed.startsWith('data: ')) {
              const jsonStr = trimmed.slice(6);
              try {
                const chunk = JSON.parse(jsonStr) as NIMResponse;
                const delta = chunk.choices?.[0]?.delta?.content;
                if (delta) {
                  yield delta;
                }
              } catch {
                // Skip malformed JSON chunks
                logger.debug({ jsonStr: jsonStr.slice(0, 200) }, 'Skipping malformed SSE chunk');
              }
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data: ') && trimmed !== 'data: [DONE]') {
            try {
              const chunk = JSON.parse(trimmed.slice(6)) as NIMResponse;
              const delta = chunk.choices?.[0]?.delta?.content;
              if (delta) {
                yield delta;
              }
            } catch {
              // Ignore
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

      keyState.inflight--;
      return; // Streaming completed successfully
    } catch (err) {
      keyState.inflight--;
      if (err instanceof NIMError || err instanceof ModelDegradedError || err instanceof AllKeysExhaustedError) {
        throw err;
      }
      logger.warn({ err, attempt }, 'NIM stream read error');
      if (attempt < MAX_ATTEMPTS) {
        await sleep(generalBackoff(attempt));
        continue;
      }
      throw new NIMError(`Stream read error after ${MAX_ATTEMPTS} attempts: ${String(err)}`);
    }
  }

  throw new NIMError('Exhausted all retry attempts for streaming');
}
