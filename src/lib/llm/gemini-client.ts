// =============================================================================
// Gemini LLM Client
// Sole LLM provider (single key, no cross-provider fallback exists anymore),
// talking to Gemini's OpenAI-compatible endpoint. Retries transient network
// errors and backs off on 429s, since there is no fallback tier left to
// absorb a merely transient failure.
// =============================================================================

import { env } from '../../config/env.js';
import { type LLMRequestOptions } from '../../config/llm.js';
import { logger } from '../logger.js';
import { alertThrottled } from '../notifications/alerts.js';

export class GeminiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = 'GeminiError';
  }
}

const MAX_ATTEMPTS = 4;
const MAX_RATE_LIMIT_RETRIES = 6;
const GENERATE_TIMEOUT_MS = 60_000;
const STREAM_TIMEOUT_MS = 120_000;
// Hard ceiling on total time spent across ALL attempts + backoff sleeps for a
// single generate()/stream() call. Without this, MAX_RATE_LIMIT_RETRIES (6,
// and NOT counted against MAX_ATTEMPTS — see the `attempt--` below) stacking
// with per-attempt timeouts lets one request hold a process for many minutes
// under sustained 429s, filling it with zombie requests.
const MAX_TOTAL_ELAPSED_MS = 90_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generalBackoff(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt - 1), 8000);
}

function rateLimitBackoff(rateLimitWaits: number): number {
  return Math.min(2000 * Math.pow(2, rateLimitWaits), 60_000);
}

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

interface GeminiChoice {
  message?: { content: string };
  delta?: { content?: string };
  finish_reason?: string | null;
}

interface GeminiResponse {
  choices: GeminiChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

function doRequest(
  opts: LLMRequestOptions,
  stream: boolean,
  signal: AbortSignal,
): Promise<Response> {
  const model = opts.model ?? env.GEMINI_MODEL;
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.profile.temperature,
    max_tokens: opts.profile.maxTokens,
    stream,
  };

  if (opts.profile.jsonMode) {
    if (opts.responseSchema) {
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'structured_output',
          schema: opts.responseSchema,
          strict: true,
        },
      };
    } else {
      body.response_format = { type: 'json_object' };
    }
  }

  return fetch(`${env.GEMINI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.GEMINI_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal,
  });
}

// =============================================================================
// Buffered Generate (non-streaming)
// =============================================================================

export async function generate(opts: LLMRequestOptions): Promise<string> {
  let rateLimitWaits = 0;
  const deadlineAt = Date.now() + MAX_TOTAL_ELAPSED_MS;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (Date.now() >= deadlineAt) {
      throw new GeminiError('Exceeded total elapsed-time budget for Gemini request');
    }
    const attemptTimeout = Math.min(opts.timeoutMs ?? GENERATE_TIMEOUT_MS, deadlineAt - Date.now());
    const abort = makeAbort(opts.signal, attemptTimeout);
    let response: Response;
    let bodyText: string;

    try {
      response = await doRequest(opts, false, abort.signal);
      bodyText = await response.text();
    } catch (err) {
      logger.warn({ err, attempt }, 'Gemini request network error/timeout');
      abort.clear();
      if (attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(generalBackoff(attempt), Math.max(0, deadlineAt - Date.now())));
        continue;
      }
      void alertThrottled(
        'gemini:network',
        'Gemini unreachable',
        `${opts.profile.name}: gave up after ${MAX_ATTEMPTS} attempts — ${String(err)}`,
      );
      throw new GeminiError(`Network error after ${MAX_ATTEMPTS} attempts: ${String(err)}`);
    }
    abort.clear();

    if (response.status === 429) {
      if (rateLimitWaits >= MAX_RATE_LIMIT_RETRIES) {
        void alertThrottled(
          'gemini:quota',
          'Gemini quota exhausted',
          `${opts.profile.name}: still 429 after ${MAX_RATE_LIMIT_RETRIES} backoff waits. ` +
            `Users are seeing failed AI responses.`,
        );
        throw new GeminiError(`Rate limited after ${MAX_RATE_LIMIT_RETRIES} waits`, 429, bodyText);
      }
      const retryAfterHeader = response.headers.get('Retry-After');
      const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
      const waitMs = Number.isNaN(retryAfterSec)
        ? rateLimitBackoff(rateLimitWaits)
        : retryAfterSec * 1000;
      logger.warn({ waitMs, rateLimitWaits }, 'Gemini 429 rate limited, backing off');
      await sleep(Math.min(waitMs, Math.max(0, deadlineAt - Date.now())));
      rateLimitWaits++;
      attempt--;
      continue;
    }

    if (!response.ok) {
      logger.warn({ status: response.status, body: bodyText.slice(0, 500) }, 'Gemini API error');
      void alertThrottled(
        `gemini:http-${response.status}`,
        `Gemini API error ${response.status}`,
        `${opts.profile.name}: ${bodyText.slice(0, 300)}`,
      );
      if (attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(generalBackoff(attempt), Math.max(0, deadlineAt - Date.now())));
        continue;
      }
      throw new GeminiError(
        `Gemini API error ${response.status}: ${bodyText.slice(0, 500)}`,
        response.status,
        bodyText,
      );
    }

    let data: GeminiResponse;
    try {
      data = JSON.parse(bodyText) as GeminiResponse;
    } catch (parseErr) {
      logger.warn({ sample: bodyText.slice(0, 500) }, 'Gemini success body not valid JSON');
      throw new GeminiError(
        `Gemini returned non-JSON success body: ${String(parseErr)}`,
        response.status,
      );
    }
    const content = data.choices?.[0]?.message?.content ?? '';
    if (data.choices?.[0]?.finish_reason === 'length') {
      logger.warn(
        {
          profile: opts.profile.name,
          maxTokens: opts.profile.maxTokens,
          contentLength: content.length,
        },
        'Gemini generate() hit max_tokens — reply was truncated' +
          (content ? ' mid-generation' : ' to empty'),
      );
    }
    return content;
  }

  throw new GeminiError('Exhausted all retry attempts');
}

// =============================================================================
// Streaming Generate (SSE async generator)
// =============================================================================

export async function* stream(opts: LLMRequestOptions): AsyncGenerator<string, void, unknown> {
  let rateLimitWaits = 0;
  // Once we have emitted tokens to the consumer we must NOT silently retry and
  // replay a fresh completion — that produces duplicated/garbled output.
  let yieldedAny = false;
  const deadlineAt = Date.now() + MAX_TOTAL_ELAPSED_MS;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (Date.now() >= deadlineAt) {
      throw new GeminiError('Exceeded total elapsed-time budget for Gemini stream request');
    }
    const attemptTimeout = Math.min(STREAM_TIMEOUT_MS, deadlineAt - Date.now());
    const abort = makeAbort(opts.signal, attemptTimeout);
    try {
      let response: Response;
      try {
        response = await doRequest(opts, true, abort.signal);
      } catch (err) {
        logger.warn({ err, attempt }, 'Gemini stream request network error/timeout');
        if (attempt < MAX_ATTEMPTS) {
          await sleep(Math.min(generalBackoff(attempt), Math.max(0, deadlineAt - Date.now())));
          continue;
        }
        void alertThrottled(
          'gemini:network',
          'Gemini unreachable',
          `${opts.profile.name} (stream): gave up after ${MAX_ATTEMPTS} attempts — ${String(err)}`,
        );
        throw new GeminiError(`Network error after ${MAX_ATTEMPTS} attempts: ${String(err)}`);
      }

      if (!response.ok) {
        const bodyText = await response.text();

        if (response.status === 429) {
          if (rateLimitWaits >= MAX_RATE_LIMIT_RETRIES) {
            void alertThrottled(
              'gemini:quota',
              'Gemini quota exhausted',
              `${opts.profile.name} (stream): still 429 after ${MAX_RATE_LIMIT_RETRIES} ` +
                `backoff waits. Users are seeing failed AI responses.`,
            );
            throw new GeminiError(
              `Rate limited after ${MAX_RATE_LIMIT_RETRIES} waits`,
              429,
              bodyText,
            );
          }
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
          const waitMs = Number.isNaN(retryAfterSec)
            ? rateLimitBackoff(rateLimitWaits)
            : retryAfterSec * 1000;
          logger.warn({ waitMs, rateLimitWaits }, 'Gemini stream 429 rate limited');
          await sleep(Math.min(waitMs, Math.max(0, deadlineAt - Date.now())));
          rateLimitWaits++;
          attempt--;
          continue;
        }

        logger.warn(
          { status: response.status, body: bodyText.slice(0, 500) },
          'Gemini stream API error',
        );
        void alertThrottled(
          `gemini:http-${response.status}`,
          `Gemini API error ${response.status}`,
          `${opts.profile.name} (stream): ${bodyText.slice(0, 300)}`,
        );
        if (attempt < MAX_ATTEMPTS) {
          await sleep(Math.min(generalBackoff(attempt), Math.max(0, deadlineAt - Date.now())));
          continue;
        }
        throw new GeminiError(
          `Gemini API error ${response.status}: ${bodyText.slice(0, 500)}`,
          response.status,
          bodyText,
        );
      }

      if (!response.body) {
        throw new GeminiError('Response body is null for streaming request');
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
                const chunk = JSON.parse(trimmed.slice(6)) as GeminiResponse;
                const delta = chunk.choices?.[0]?.delta?.content;
                if (delta) {
                  yieldedAny = true;
                  yield delta;
                }
                if (chunk.choices?.[0]?.finish_reason === 'length') {
                  logger.warn(
                    { profile: opts.profile.name, maxTokens: opts.profile.maxTokens },
                    'Gemini stream hit max_tokens — reply was truncated mid-generation',
                  );
                }
              } catch {
                logger.debug({ sample: trimmed.slice(0, 200) }, 'Skipping malformed SSE chunk');
              }
            }
          }
        }

        if (buffer.trim().startsWith('data: ') && buffer.trim() !== 'data: [DONE]') {
          try {
            const chunk = JSON.parse(buffer.trim().slice(6)) as GeminiResponse;
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              yieldedAny = true;
              yield delta;
            }
            if (chunk.choices?.[0]?.finish_reason === 'length') {
              logger.warn(
                { profile: opts.profile.name, maxTokens: opts.profile.maxTokens },
                'Gemini stream hit max_tokens — reply was truncated mid-generation',
              );
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
      if (err instanceof GeminiError) {
        throw err;
      }
      // A read error AFTER tokens were emitted cannot be retried safely.
      if (yieldedAny) {
        throw new GeminiError(`Stream interrupted after partial output: ${String(err)}`);
      }
      logger.warn({ err, attempt }, 'Gemini stream read error');
      if (attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(generalBackoff(attempt), Math.max(0, deadlineAt - Date.now())));
        continue;
      }
      throw new GeminiError(`Stream read error after ${MAX_ATTEMPTS} attempts: ${String(err)}`);
    } finally {
      abort.clear();
    }
  }

  throw new GeminiError('Exhausted all retry attempts for streaming');
}
