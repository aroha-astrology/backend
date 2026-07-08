// =============================================================================
// Groq LLM Client
// Multi-key pool with 40 req/min sliding-window rate limiter per key,
// dead-key cooldown, least-busy-first selection, and exponential backoff.
// Mirrors the nim-client architecture.
// =============================================================================

import { env } from '../../config/env.js';
import { type LLMRequestOptions } from '../../config/llm.js';
import { logger } from '../logger.js';

// =============================================================================
// Error Classes
// =============================================================================

export class GroqError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'GroqError';
  }
}

export class AllGroqKeysExhaustedError extends GroqError {
  constructor(message = 'All Groq API keys are exhausted, rate-limited, or dead') {
    super(message);
    this.name = 'AllGroqKeysExhaustedError';
  }
}

// =============================================================================
// Key Pool & Rate Limiting
// =============================================================================

interface GroqKeyState {
  key: string;
  /** Epoch ms until which this key is considered dead; 0 = alive. */
  deadUntil: number;
  /** Timestamps (epoch ms) of requests made in the last 60 seconds. */
  requestWindow: number[];
}

const DEAD_KEY_COOLDOWN_MS = 5 * 60_000;
const WINDOW_MS = 60_000;

function loadGroqKeys(): GroqKeyState[] {
  const keys: GroqKeyState[] = [];

  if (env.GROQ_API_KEY) {
    keys.push({ key: env.GROQ_API_KEY, deadUntil: 0, requestWindow: [] });
  }

  for (let i = 2; i <= 20; i++) {
    const envKey = `GROQ_API_KEY_${i}` as keyof typeof env;
    const value = env[envKey] as string | undefined;
    if (value) {
      keys.push({ key: value, deadUntil: 0, requestWindow: [] });
    }
  }

  return keys;
}

const keyPool: GroqKeyState[] = loadGroqKeys();

function markDead(keyState: GroqKeyState): void {
  keyState.deadUntil = Date.now() + DEAD_KEY_COOLDOWN_MS;
}

function cleanWindow(keyState: GroqKeyState, now: number): void {
  const cutoff = now - WINDOW_MS;
  keyState.requestWindow = keyState.requestWindow.filter((t) => t > cutoff);
}

function isRateLimited(keyState: GroqKeyState, now: number): boolean {
  cleanWindow(keyState, now);
  return keyState.requestWindow.length >= env.GROQ_RPM_LIMIT;
}

function recordRequest(keyState: GroqKeyState, now: number): void {
  keyState.requestWindow.push(now);
}

// =============================================================================
// Dead-Key Detection
// =============================================================================

function isDeadKeyError(status: number, msg: string): boolean {
  if (status === 401 || status === 403) return true;
  if (/invalid\s*api\s*key/i.test(msg)) return true;
  if (/api\s*key.*(expired|revoked|disabled)/i.test(msg)) return true;
  return false;
}

// =============================================================================
// Key Selection
// =============================================================================

function selectKey(): GroqKeyState | null {
  const now = Date.now();
  const candidates = keyPool.filter((k) => k.deadUntil <= now && !isRateLimited(k, now));
  if (candidates.length === 0) return null;
  // Least-busy first
  candidates.sort((a, b) => a.requestWindow.length - b.requestWindow.length);
  return candidates[0] ?? null;
}

// =============================================================================
// Helpers
// =============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const GENERATE_TIMEOUT_MS = 60_000;
const STREAM_TIMEOUT_MS = 120_000;

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

function resolveModel(opts: LLMRequestOptions): string {
  if (opts.model) return opts.model;
  if (opts.profile.modelTier === 'structured') return env.GROQ_MODEL_STRUCTURED;
  if (opts.profile.modelTier === 'conversational') return env.GROQ_MODEL_CONVERSATIONAL;
  return env.GROQ_MODEL_ROUTING;
}

// =============================================================================
// Core Request
// =============================================================================

async function doRequest(
  keyState: GroqKeyState,
  opts: LLMRequestOptions,
  signal: AbortSignal,
): Promise<Response> {
  const model = resolveModel(opts);
  const baseUrl = env.GROQ_BASE_URL;

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

export async function generate(opts: LLMRequestOptions): Promise<string> {
  if (keyPool.length === 0) {
    throw new AllGroqKeysExhaustedError('No Groq API keys configured');
  }

  const MAX_ATTEMPTS = keyPool.length * 2;
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    const keyState = selectKey();
    if (!keyState) {
      throw new AllGroqKeysExhaustedError(
        `All ${keyPool.length} Groq keys have hit the ${env.GROQ_RPM_LIMIT} req/min limit`,
      );
    }

    const now = Date.now();
    recordRequest(keyState, now);
    attempts++;

    const abort = makeAbort(opts.signal, opts.timeoutMs ?? GENERATE_TIMEOUT_MS);
    let response: Response;
    let bodyText: string;

    try {
      const nonStreamProfile = { ...opts.profile, stream: false };
      response = await doRequest(keyState, { ...opts, profile: nonStreamProfile }, abort.signal);
      bodyText = await response.text();
    } catch (err) {
      logger.warn({ err, attempt: attempts }, 'Groq request network error/timeout');
      if (attempts < MAX_ATTEMPTS) {
        continue;
      }
      throw new GroqError(`Network error after ${MAX_ATTEMPTS} attempts: ${String(err)}`);
    } finally {
      abort.clear();
    }

    if (isDeadKeyError(response.status, bodyText)) {
      logger.warn({ status: response.status }, 'Groq key marked dead (cooldown)');
      markDead(keyState);
      continue;
    }

    if (response.status === 429) {
      logger.warn('Groq 429 rate limited, maxing out window for this key');
      // Max out the window so it won't be selected again for a minute
      while (keyState.requestWindow.length < env.GROQ_RPM_LIMIT) {
        keyState.requestWindow.push(Date.now());
      }
      continue;
    }

    if (!response.ok) {
      logger.warn({ status: response.status, body: bodyText.slice(0, 500) }, 'Groq API error');
      if (attempts < MAX_ATTEMPTS) {
        continue;
      }
      throw new GroqError(
        `Groq API error ${response.status}: ${bodyText.slice(0, 500)}`,
        response.status,
        bodyText,
      );
    }

    let data: any;
    try {
      data = JSON.parse(bodyText);
    } catch (parseErr) {
      logger.warn({ sample: bodyText.slice(0, 500) }, 'Groq success body not valid JSON');
      throw new GroqError(
        `Groq returned non-JSON success body: ${String(parseErr)}`,
        response.status,
      );
    }

    const content = data.choices?.[0]?.message?.content ?? '';
    return content;
  }

  throw new AllGroqKeysExhaustedError(`Exhausted all ${MAX_ATTEMPTS} attempts on Groq`);
}

// =============================================================================
// Streaming Generate (SSE async generator)
// =============================================================================

export async function* stream(opts: LLMRequestOptions): AsyncGenerator<string, void, unknown> {
  if (keyPool.length === 0) {
    throw new AllGroqKeysExhaustedError('No Groq API keys configured');
  }

  const MAX_ATTEMPTS = keyPool.length * 2;
  let attempts = 0;
  let yieldedAny = false;

  while (attempts < MAX_ATTEMPTS) {
    const keyState = selectKey();
    if (!keyState) {
      throw new AllGroqKeysExhaustedError(`All ${keyPool.length} Groq keys hit the limit`);
    }

    const now = Date.now();
    recordRequest(keyState, now);
    attempts++;

    const abort = makeAbort(opts.signal, STREAM_TIMEOUT_MS);
    try {
      const streamProfile = { ...opts.profile, stream: true };
      let response: Response;
      try {
        response = await doRequest(keyState, { ...opts, profile: streamProfile }, abort.signal);
      } catch (err) {
        logger.warn({ err, attempt: attempts }, 'Groq stream request network error/timeout');
        if (yieldedAny) throw err;
        continue;
      }

      if (!response.ok) {
        const bodyText = await response.text();
        if (isDeadKeyError(response.status, bodyText)) {
          logger.warn({ status: response.status }, 'Groq key marked dead (cooldown)');
          markDead(keyState);
          if (yieldedAny)
            throw new GroqError('Groq key died mid-stream', response.status, bodyText);
          continue;
        }

        if (response.status === 429) {
          logger.warn('Groq 429 stream rate limited');
          while (keyState.requestWindow.length < env.GROQ_RPM_LIMIT) {
            keyState.requestWindow.push(Date.now());
          }
          if (yieldedAny) throw new GroqError('Groq 429 mid-stream', 429, bodyText);
          continue;
        }

        throw new GroqError(
          `Groq API error ${response.status}: ${bodyText.slice(0, 500)}`,
          response.status,
          bodyText,
        );
      }

      const reader = response.body?.getReader();
      if (!reader) throw new GroqError('No response body from Groq');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') return;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              yieldedAny = true;
              yield content;
            }
          } catch (e) {
            // ignore malformed chunks
          }
        }
      }
      return;
    } finally {
      abort.clear();
    }
  }

  throw new AllGroqKeysExhaustedError(`Exhausted all ${MAX_ATTEMPTS} stream attempts on Groq`);
}
