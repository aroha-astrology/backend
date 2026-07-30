// =============================================================================
// Gemini LLM Client
// Sole LLM provider (no cross-provider fallback exists anymore), talking to
// Gemini's OpenAI-compatible endpoint. Round-robins across a pool of API keys
// (see lib/llm/gemini-key-pool.ts) so effective throughput scales with the
// pool instead of being capped by any one key's free-tier limits, and fails
// over to the next key instantly on a 429. Retries transient network errors
// and backs off when the ENTIRE pool is simultaneously rate limited, since
// there is no fallback tier left to absorb a merely transient failure.
// =============================================================================

import { env } from '../../config/env.js';
import { type LLMRequestOptions } from '../../config/llm.js';
import { logger } from '../logger.js';
import { alertThrottled } from '../notifications/alerts.js';
import { insertAiUsage } from '../../modules/admin/ai-usage.repo.js';
import { pickKey, markRateLimited, earliestAvailableAt, poolSize } from './gemini-key-pool.js';

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
// Budget for "the ENTIRE key pool was simultaneously rate limited" waits, NOT
// "one key hit a 429" — with a pool of more than one key, a lone 429 fails
// over instantly to the next untried, non-cooling key with no sleep (see
// pickKey()/markRateLimited() below) and never touches this counter at all.
// It's only consumed once every key in the pool has 429'd within the same
// attempt and there's nothing left to fail over to. With a pool of exactly
// one key this degrades to its original meaning: that key rate-limited N times.
const MAX_RATE_LIMIT_RETRIES = 6;
const GENERATE_TIMEOUT_MS = 60_000;
const STREAM_TIMEOUT_MS = 120_000;
// Hard ceiling on total time spent across ALL attempts + backoff sleeps for a
// single generate()/stream() call. Without this, MAX_RATE_LIMIT_RETRIES (6,
// and NOT counted against MAX_ATTEMPTS — see the `attempt--` below) stacking
// with per-attempt timeouts lets one request hold a process for many minutes
// under sustained 429s, filling it with zombie requests.
const MAX_TOTAL_ELAPSED_MS = 90_000;
// Per-key cooldown applied via markRateLimited() when a key 429s and the
// response carries no Retry-After header — separate from, and not to be
// confused with, rateLimitBackoff()'s pool-wide exponential schedule below.
// Same low end as that schedule's first step, capped so one stuck key can
// never sideline itself from the pool for an unbounded time.
const DEFAULT_KEY_COOLDOWN_MS = 10_000;
const MAX_KEY_COOLDOWN_MS = 60_000;

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
  apiKey: string,
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
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
}

/** Parses a Retry-After header (seconds) into ms, or NaN if absent/invalid. */
function retryAfterMsFromHeader(response: Response): number {
  const header = response.headers.get('Retry-After');
  const sec = header ? parseInt(header, 10) : NaN;
  return Number.isNaN(sec) ? NaN : sec * 1000;
}

// =============================================================================
// Buffered Generate (non-streaming)
// =============================================================================

export async function generate(opts: LLMRequestOptions): Promise<string> {
  let rateLimitWaits = 0;
  const startedAt = Date.now();
  const deadlineAt = Date.now() + MAX_TOTAL_ELAPSED_MS;
  // Mirrors doRequest()'s own model resolution — duplicated rather than
  // returned from doRequest() to avoid changing its signature for every
  // caller, just for this one telemetry field.
  const model = opts.model ?? env.GEMINI_MODEL;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (Date.now() >= deadlineAt) {
      throw new GeminiError('Exceeded total elapsed-time budget for Gemini request');
    }
    const attemptTimeout = Math.min(opts.timeoutMs ?? GENERATE_TIMEOUT_MS, deadlineAt - Date.now());
    const abort = makeAbort(opts.signal, attemptTimeout);

    // Inner key-failover loop, bounded to poolSize() iterations: a 429 on one
    // key fails over to the next untried, non-cooling key immediately (no
    // sleep — that's the point of having a pool), while a genuine network
    // error or a non-429 HTTP response is final for this attempt, exactly as
    // before. With a pool of size 1 this loop runs exactly once, and pickKey()
    // either returns the sole key (not cooling) or null (cooling) — falling
    // straight through to the unchanged sleep/backoff logic below.
    const triedThisAttempt = new Set<number>();
    let response: Response | undefined;
    let bodyText: string | undefined;
    let networkErr: unknown;
    let poolExhausted = false;
    const keyIterations = Math.max(1, poolSize());

    for (let keyIter = 0; keyIter < keyIterations; keyIter++) {
      const picked = await pickKey(triedThisAttempt);
      if (!picked) {
        // Every key is either already tried this attempt or cooling down.
        poolExhausted = true;
        break;
      }

      try {
        response = await doRequest(opts, false, abort.signal, picked.key);
        bodyText = await response.text();
      } catch (err) {
        // Network/timeout error — not a per-key problem, must not trigger key
        // rotation or consume the failover budget. Unchanged fall-through to
        // the network-error handling below.
        networkErr = err;
        response = undefined;
        bodyText = undefined;
        break;
      }

      if (response.status === 429) {
        const retryAfterMs = retryAfterMsFromHeader(response);
        const cooldownMs = Number.isNaN(retryAfterMs)
          ? DEFAULT_KEY_COOLDOWN_MS
          : Math.min(retryAfterMs, MAX_KEY_COOLDOWN_MS);
        await markRateLimited(picked.index, cooldownMs);
        triedThisAttempt.add(picked.index);
        logger.warn(
          { keyIndex: picked.index, cooldownMs },
          'Gemini key 429 rate limited, cooling down and failing over',
        );
        if (triedThisAttempt.size < poolSize()) {
          continue; // try the next key immediately, no sleep
        }
        poolExhausted = true;
        break;
      }

      break; // non-429 (success or a real HTTP error) — final for this attempt
    }

    abort.clear();

    if (networkErr !== undefined) {
      logger.warn({ err: networkErr, attempt }, 'Gemini request network error/timeout');
      if (attempt < MAX_ATTEMPTS) {
        await sleep(Math.min(generalBackoff(attempt), Math.max(0, deadlineAt - Date.now())));
        continue;
      }
      void alertThrottled(
        'gemini:network',
        'Gemini unreachable',
        `${opts.profile.name}: gave up after ${MAX_ATTEMPTS} attempts — ${String(networkErr)}`,
      );
      throw new GeminiError(`Network error after ${MAX_ATTEMPTS} attempts: ${String(networkErr)}`);
    }

    if (poolExhausted) {
      if (rateLimitWaits >= MAX_RATE_LIMIT_RETRIES) {
        void alertThrottled(
          'gemini:quota',
          'Gemini key pool exhausted',
          `${opts.profile.name}: entire key pool (${poolSize()} key${poolSize() === 1 ? '' : 's'}) ` +
            `simultaneously rate limited after ${MAX_RATE_LIMIT_RETRIES} backoff waits. ` +
            `Users are seeing failed AI responses.`,
        );
        throw new GeminiError(
          `Rate limited after ${MAX_RATE_LIMIT_RETRIES} pool-exhaustion waits`,
          429,
          bodyText,
        );
      }
      let scheduledWaitMs: number;
      if (response) {
        const retryAfterMs = retryAfterMsFromHeader(response);
        scheduledWaitMs = Number.isNaN(retryAfterMs)
          ? rateLimitBackoff(rateLimitWaits)
          : retryAfterMs;
      } else {
        scheduledWaitMs = rateLimitBackoff(rateLimitWaits);
      }
      const earliestAt = await earliestAvailableAt();
      const waitMs = Math.min(scheduledWaitMs, Math.max(0, earliestAt - Date.now()));
      logger.warn({ waitMs, rateLimitWaits }, 'Gemini pool exhausted (all keys 429), backing off');
      await sleep(Math.min(waitMs, Math.max(0, deadlineAt - Date.now())));
      rateLimitWaits++;
      attempt--;
      continue;
    }

    // Neither the network-error nor the pool-exhausted branch was taken, so
    // the key-failover loop above must have broken out on a defined response
    // (success or a real, non-429 HTTP error) — but keep TypeScript (and a
    // future refactor) honest with an explicit check rather than a cast.
    if (!response || bodyText === undefined) {
      throw new GeminiError('Internal error: no Gemini response after key-failover loop');
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
    if (data.usage) {
      // Fire-and-forget — telemetry must never throw or add latency to the
      // caller's response, so a DB failure here is logged and swallowed,
      // never propagated.
      void insertAiUsage({
        userId: opts.userId ?? null,
        agent: opts.profile.name,
        model,
        tokensIn: data.usage.prompt_tokens,
        tokensOut: data.usage.completion_tokens,
        durationMs: Date.now() - startedAt,
      }).catch((err: unknown) => logger.warn({ err }, 'ai_usage insert failed'));
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
      // Inner key-failover loop — same shape and rationale as generate()'s;
      // see the comment there. With a pool of size 1 this runs exactly once
      // and falls straight through to the unchanged sleep/backoff path below.
      const triedThisAttempt = new Set<number>();
      let response: Response | undefined;
      let networkErr: unknown;
      let poolExhausted = false;
      let rateLimitBodyText: string | undefined;
      const keyIterations = Math.max(1, poolSize());

      for (let keyIter = 0; keyIter < keyIterations; keyIter++) {
        const picked = await pickKey(triedThisAttempt);
        if (!picked) {
          poolExhausted = true;
          break;
        }

        try {
          response = await doRequest(opts, true, abort.signal, picked.key);
        } catch (err) {
          networkErr = err;
          response = undefined;
          break;
        }

        if (response.status === 429) {
          rateLimitBodyText = await response.text();
          const retryAfterMs = retryAfterMsFromHeader(response);
          const cooldownMs = Number.isNaN(retryAfterMs)
            ? DEFAULT_KEY_COOLDOWN_MS
            : Math.min(retryAfterMs, MAX_KEY_COOLDOWN_MS);
          await markRateLimited(picked.index, cooldownMs);
          triedThisAttempt.add(picked.index);
          logger.warn(
            { keyIndex: picked.index, cooldownMs },
            'Gemini stream key 429 rate limited, cooling down and failing over',
          );
          if (triedThisAttempt.size < poolSize()) {
            continue; // try the next key immediately, no sleep
          }
          poolExhausted = true;
          break;
        }

        break; // non-429 (success or a real HTTP error) — final for this attempt
      }

      if (networkErr !== undefined) {
        logger.warn({ err: networkErr, attempt }, 'Gemini stream request network error/timeout');
        if (attempt < MAX_ATTEMPTS) {
          await sleep(Math.min(generalBackoff(attempt), Math.max(0, deadlineAt - Date.now())));
          continue;
        }
        void alertThrottled(
          'gemini:network',
          'Gemini unreachable',
          `${opts.profile.name} (stream): gave up after ${MAX_ATTEMPTS} attempts — ${String(networkErr)}`,
        );
        throw new GeminiError(
          `Network error after ${MAX_ATTEMPTS} attempts: ${String(networkErr)}`,
        );
      }

      if (poolExhausted) {
        if (rateLimitWaits >= MAX_RATE_LIMIT_RETRIES) {
          void alertThrottled(
            'gemini:quota',
            'Gemini key pool exhausted',
            `${opts.profile.name} (stream): entire key pool (${poolSize()} key${poolSize() === 1 ? '' : 's'}) ` +
              `simultaneously rate limited after ${MAX_RATE_LIMIT_RETRIES} backoff waits. ` +
              `Users are seeing failed AI responses.`,
          );
          throw new GeminiError(
            `Rate limited after ${MAX_RATE_LIMIT_RETRIES} pool-exhaustion waits`,
            429,
            rateLimitBodyText,
          );
        }
        let scheduledWaitMs: number;
        if (response) {
          const retryAfterMs = retryAfterMsFromHeader(response);
          scheduledWaitMs = Number.isNaN(retryAfterMs)
            ? rateLimitBackoff(rateLimitWaits)
            : retryAfterMs;
        } else {
          scheduledWaitMs = rateLimitBackoff(rateLimitWaits);
        }
        const earliestAt = await earliestAvailableAt();
        const waitMs = Math.min(scheduledWaitMs, Math.max(0, earliestAt - Date.now()));
        logger.warn({ waitMs, rateLimitWaits }, 'Gemini stream pool exhausted (all keys 429)');
        await sleep(Math.min(waitMs, Math.max(0, deadlineAt - Date.now())));
        rateLimitWaits++;
        attempt--;
        continue;
      }

      if (!response) {
        throw new GeminiError('Internal error: no Gemini response after key-failover loop');
      }

      if (!response.ok) {
        const bodyText = await response.text();

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
