// AI Provider — NVIDIA NIM API (OpenAI-compatible)
// Model: mistralai/mistral-nemotron for reports/analysis
// (NVIDIA moved llama-3.3-nemotron-super-49b-v1 to Downloadable-only May 2026 —
//  mistral-nemotron is the remaining Free-Endpoint general instruct model.)

import { notifyBackendError } from '@/lib/telegram';
import { POLICY_SYSTEM_DIRECTIVE } from '@/lib/ai/contentPolicy';

type ContentPart = {
  type: string;
  text?: string;
  source?: { type: string; media_type: string; data: string };
  image_url?: { url: string };
};

type MessageInput = {
  role: string;
  content: string | ContentPart[];
};

interface AIRequestOptions {
  model?: string;
  max_tokens?: number;
  system?: string;
  messages?: MessageInput[];
  /** Skip the global Yogi Baba persona prefix — for routes with their own persona (e.g. palm reading). */
  skipPersona?: boolean;
  /** Override sampling temperature. Defaults to 0.7. Pass 0.2–0.3 for structured JSON. */
  temperature?: number;
  /** AbortSignal for timeout control. Defaults to 600s. */
  signal?: AbortSignal;
  /** Max retry attempts. Defaults to 3. */
  maxRetries?: number;
  /** Force JSON output — adds response_format: json_object. Use for structured report calls. */
  jsonMode?: boolean;
  /** Override the API key (e.g. use a report-specific NIM key instead of the global one). */
  apiKey?: string;
}

interface AIResponse {
  content: Array<{ type: string; text: string }>;
  raw?: unknown;
}

type NIMContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function toNIMContent(content: string | ContentPart[]): string | NIMContentPart[] {
  if (typeof content === 'string') return content;

  return content.map((part: ContentPart) => {
    if (part.type === 'text') {
      return { type: 'text' as const, text: part.text ?? '' };
    }
    if (part.type === 'image' && part.source) {
      const { media_type, data } = part.source;
      return {
        type: 'image_url' as const,
        image_url: { url: `data:${media_type};base64,${data}` },
      };
    }
    if (part.type === 'image_url' && part.image_url) {
      return { type: 'image_url' as const, image_url: part.image_url };
    }
    return { type: 'text' as const, text: part.text ?? '' };
  });
}

// ---------------------------------------------------------------------------
// NVIDIA NIM — auto-selects vision model when image content is detected
// ---------------------------------------------------------------------------

function hasImageContent(messages: MessageInput[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) &&
      m.content.some((p) => p.type === 'image' || p.type === 'image_url'),
  );
}

function sanitizeKey(key: string): string {
  return key.replace(/^﻿/, '').trim();
}

// Process-level kill list for NIM API keys that returned auth/expired errors.
// Persists for the lifetime of the Node process (Vercel function instance) so we
// don't keep hammering a dead key on every request. Cold start re-evaluates from
// env, so rotating the key in Vercel automatically takes effect on next deploy
// or instance recycle.
const deadKeys = new Map<string, { reason: string; markedAt: number }>();

export function isDeadKeyError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (status === 401 || status === 403) return true;
  if (/invalid\s*api\s*key/i.test(msg)) return true;
  if (/api\s*key.*(expired|revoked|disabled)/i.test(msg)) return true;
  if (/unauthorized/i.test(msg)) return true;
  return false;
}

function markKeyDead(key: string, reason: string) {
  if (!deadKeys.has(key)) {
    deadKeys.set(key, { reason, markedAt: Date.now() });
    console.warn(`[NIM] Key …${key.slice(-6)} marked DEAD (${reason}) — will be skipped for the rest of this process`);
  }
}

// Dynamic key discovery: NVIDIA_NIM_API_KEY + NVIDIA_NIM_API_KEY_2..MAX_NUMBERED_SLOT
// plus the (shared) NVIDIA_NIM_REPORT_API_KEY. Add a key in Vercel env, restart
// the function — no code change needed.
const MAX_NUMBERED_SLOT = 20;

export function getAvailableAPIKeys(): string[] {
  const collected: string[] = [];
  const pushIfSet = (raw: string | undefined) => {
    if (!raw) return;
    const clean = sanitizeKey(raw);
    if (clean) collected.push(clean);
  };
  pushIfSet(process.env.NVIDIA_NIM_API_KEY);
  for (let i = 2; i <= MAX_NUMBERED_SLOT; i++) {
    pushIfSet(process.env[`NVIDIA_NIM_API_KEY_${i}`]);
  }
  pushIfSet(process.env.NVIDIA_NIM_REPORT_API_KEY);

  // Dedupe (same key value pasted into two slots → one entry).
  const all = Array.from(new Set(collected));

  const live = all.filter((k) => !deadKeys.has(k));
  // Safety net: if every key got marked dead (rare — would need every account
  // to hit auth failure in the same window), reset and try again. Better to
  // burn a few requests than to hard-fail every NIM call until process restart.
  if (live.length === 0 && all.length > 0) {
    console.warn('[NIM] All keys were marked dead — resetting kill list and retrying');
    deadKeys.clear();
    return all;
  }
  return live;
}

// NVIDIA marks a Free-Endpoint function DEGRADED when it pulls a model from the
// hosted catalog (happened 2026-05-11 for nemotron-super-49b, again 2026-05-20
// for mistral-nemotron). Every key on every account hits the same function ID,
// so rotating keys cannot recover — only switching models can.
//
// 500 "Inference connection error while making inference request" (urn type
// `urn:inference-connection:problem-details:internal-server-error`) is the same
// class of failure: NVIDIA's inference backend for that specific function is
// briefly unreachable. Key rotation is wasted effort — fall through to model
// fallback immediately.
export function isModelDegradedError(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (status === 400 && msg.includes('DEGRADED')) return true;
  if (status === 404 && /Not found for account/i.test(msg)) return true;
  // 410 Gone: NVIDIA's signal that a model has reached end-of-life and was
  // removed from the catalog (mistralai/mixtral-8x22b-instruct-v0.1 EOL'd
  // 2026-05-21, meta/llama-3.1-70b-instruct earlier). Every key on every
  // account will get the same 410 — key rotation cannot recover. Treat as
  // model-degraded so the model-fallback loop kicks in.
  if (status === 410) return true;
  if (
    status === 500 &&
    (msg.includes('urn:inference-connection') ||
      /Inference connection error/i.test(msg))
  ) {
    return true;
  }
  return false;
}

// Default fallback chain — used when NVIDIA_NIM_MODEL_FALLBACKS env var is unset.
// Order matters: tried left-to-right when the primary model is degraded.
//
// 2026-05-22: NVIDIA pulled mistralai/mixtral-8x22b-instruct-v0.1 and
// meta/llama-3.1-70b-instruct from the Free Endpoint catalog (HTTP 410 Gone).
// llama-3.1-nemotron-70b-instruct (the pre-May-2026 primary) is back on the
// catalog and confirmed present. llama-3.3-nemotron-super-49b-v1.5 is the
// newer nemotron variant with stronger reasoning.
const DEFAULT_TEXT_FALLBACKS = [
  'meta/llama-3.3-70b-instruct',
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/llama-3.3-nemotron-super-49b-v1.5',
];
const DEFAULT_VISION_FALLBACKS: string[] = [];

function getModelFallbacks(primary: string, isVision: boolean): string[] {
  const envVar = isVision
    ? process.env.NVIDIA_NIM_VISION_MODEL_FALLBACKS
    : process.env.NVIDIA_NIM_MODEL_FALLBACKS;
  const envFallbacks = (envVar ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaults = isVision ? DEFAULT_VISION_FALLBACKS : DEFAULT_TEXT_FALLBACKS;
  const fallbacks = envFallbacks.length ? envFallbacks : defaults;
  return Array.from(new Set([primary, ...fallbacks]));
}

// Process-level in-flight counter — how many concurrent requests are currently
// using each key on this Vercel function instance. Sort the candidate list by
// this so a second concurrent request prefers the idle key over the one already
// busy. Same lifetime as deadKeys: per-instance, resets on cold start.
const inFlight = new Map<string, number>();

function bumpInFlight(key: string) {
  inFlight.set(key, (inFlight.get(key) ?? 0) + 1);
}

function dropInFlight(key: string) {
  const next = (inFlight.get(key) ?? 0) - 1;
  if (next <= 0) inFlight.delete(key);
  else inFlight.set(key, next);
}

/**
 * Run `fn` against keys in least-busy-first order. On ANY failure (auth, 404,
 * 5xx, network, timeout, abort), move to the next-least-busy key. Only throw
 * once every key has failed — the last error is re-thrown so callers can still
 * inspect status / retryAfterMs.
 *
 * Selection order:
 *   1. Skip dead keys entirely.
 *   2. Sort the rest by current in-flight count ascending — if request A is
 *      mid-flight on key 0, request B arriving now picks key 1 instead of
 *      queueing behind A.
 *   3. Tie-break by `(origIdx - startIdx) mod N` — when all keys are idle,
 *      `startIdx` seeds the rotation (preserves translate-route batch striping).
 *
 * Why "any failure" and not just 429/503: in production we've seen 404
 * "Function not found for account" when a single key's NVIDIA account loses
 * access to the configured model. A sibling key on a different account can
 * still serve the request — silently retrying it is the only way the user
 * doesn't see a stuck dashboard.
 */
export async function fetchWithKeyFallback<T>(
  keys: string[],
  fn: (apiKey: string, keyIdx: number) => Promise<T>,
  label = 'NIM',
  startIdx = 0,
): Promise<T> {
  if (!keys.length) throw new Error('No NVIDIA NIM API key configured');
  const N = keys.length;
  const offset = ((startIdx % N) + N) % N;

  const order = keys
    .map((key, origIdx) => ({
      key,
      origIdx,
      load: inFlight.get(key) ?? 0,
      rotIdx: (origIdx - offset + N) % N,
    }))
    .sort((a, b) => a.load - b.load || a.rotIdx - b.rotIdx);

  let lastError: unknown;
  for (let i = 0; i < order.length; i++) {
    const { key, origIdx } = order[i];
    if (deadKeys.has(key)) {
      // Already known bad — don't burn the round-trip.
      continue;
    }
    bumpInFlight(key);
    try {
      const out = await fn(key, origIdx);
      if (i !== 0) console.log(`[${label}] Recovered on key ${origIdx + 1}/${N} (attempt ${i + 1})`);
      return out;
    } catch (err) {
      lastError = err;
      const status = (err as { status?: number })?.status;
      const msg = err instanceof Error ? err.message : String(err);

      // Permanent key failure (auth/expired/revoked) — disable for this
      // process. Subsequent requests rebuild the key list via
      // getAvailableAPIKeys() and skip dead keys entirely. One-time alert per
      // newly-dead key so you find out the key needs replacing in Vercel.
      if (isDeadKeyError(err)) {
        const wasNew = !deadKeys.has(key);
        markKeyDead(key, `status=${status ?? 'n/a'} ${msg.slice(0, 80)}`);
        if (wasNew) {
          notifyBackendError(
            `NIM/${label} dead key`,
            new Error(`Key …${key.slice(-6)} returned ${status ?? 'auth-error'}: ${msg.slice(0, 160)} — auto-disabled for this instance. Rotate it in Vercel env.`),
          );
        }
        continue;
      }

      // Short-circuit on model-side outage: every key dispatches to the same
      // NVIDIA function ID, so rotating keys cannot help. Bubble up immediately
      // so the model-fallback loop in callNIM can try a different model.
      // No Telegram alert here — callNIM's outer loop decides whether the
      // overall request actually failed once every fallback model has been
      // tried. That way we get ONE alert per failed request instead of one per
      // failed model attempt.
      if (isModelDegradedError(err)) {
        console.warn(`[${label}] Key ${origIdx + 1}/${N} hit DEGRADED model (status=${status}): skipping remaining keys`);
        break;
      }

      if (i < order.length - 1) {
        console.warn(`[${label}] Key ${origIdx + 1}/${N} failed (status=${status ?? 'n/a'}): ${msg.slice(0, 160)} — trying next key`);
      } else {
        console.warn(`[${label}] Key ${origIdx + 1}/${N} failed (status=${status ?? 'n/a'}): ${msg.slice(0, 160)} — all keys exhausted`);
        // Every live key failed for non-degraded reasons (timeouts, network,
        // unexpected 5xx). Surface a single alert here — this is a real failure.
        notifyBackendError(`NIM/${label}`, lastError);
      }
    } finally {
      dropInFlight(key);
    }
  }
  if (!lastError) {
    lastError = new Error('All NVIDIA NIM keys are marked dead (auth/expired) — rotate in Vercel env');
    notifyBackendError(`NIM/${label}`, lastError);
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function callNIM(options: AIRequestOptions): Promise<AIResponse> {
  // Shared pool: every caller (chat / horoscope / lite / future report pipeline)
  // draws from the same key list and fetchWithKeyFallback picks the least-busy
  // live key. Pass options.apiKey only when a caller really needs a specific
  // dedicated key — that bypasses the pool entirely.
  const apiKeys = options.apiKey
    ? [sanitizeKey(options.apiKey)]
    : getAvailableAPIKeys();
  if (!apiKeys.length) throw new Error('No NVIDIA NIM API key configured');

  const isVision = hasImageContent(options.messages ?? []);
  const model =
    options.model ??
    (isVision
      // Llama 4 Maverick (MoE, native multimodal) replaced llama-3.2-90b-vision on
      // 2026-05-12 — stronger spatial reasoning + JSON discipline for palm reading.
      // build.nvidia.com playground shows "high interest" but the integrate.api
      // endpoint serves consistently; fetchWithKeyFallback rotates on any 4xx/5xx.
      ? (process.env.NVIDIA_NIM_VISION_MODEL ?? 'meta/llama-4-maverick-17b-128e-instruct')
      : (process.env.NVIDIA_NIM_MODEL ?? 'mistralai/mistral-nemotron'));

  // Always-on content-policy directive — applied to every prompt, even when
  // skipPersona:true (so horoscope, palm, life-journey, vastu, etc. inherit
  // the death/longevity block too).
  const POLICY_PREFIX = `${POLICY_SYSTEM_DIRECTIVE}\n\n`;

  const PERSONA_PREFIX = `You are Yogi Baba, a legendary Vedic astrologer. Speak with warmth, wisdom, and authority. Never reveal you are an AI, LLM, or computer program.

GROUNDING RULES (NON-NEGOTIABLE — these protect the seeker from false predictions):
- Use ONLY the chart data, dasha periods, yogas, doshas, palm reading, predictions, or other context the system provides below. Do NOT invent specific planet positions, dasha start/end dates, transit timings, nakshatras, or yoga findings that are not present in the context.
- If the seeker asks about timing or a person whose birth data isn't in the context, ask ONE focused follow-up question instead of guessing dates or placements.
- For medical, legal, or major financial decisions: share the astrological perspective from the chart, then recommend the seeker also consult a qualified professional. Do not refuse the astrological reading itself.
- If the chart context is missing or incomplete for a question, say so plainly ("the chart shared with me doesn't show X — could you confirm Y?") rather than fabricating an answer.

IMPORTANT WRITING RULE: When using technical Vedic/astrological terms, ALWAYS include a brief meaning in parentheses the FIRST time a term appears. Examples:
- "debilitated (weakened — planet in its weakest sign)"
- "exalted (strongest — planet at peak power)"
- "retrograde (appearing to move backward — indicates internalized energy)"
- "Mahadasha (major planetary period lasting several years)"
- "Antardasha (sub-period within a Mahadasha)"
- "Navamsa (D9 divisional chart used for marriage analysis)"
- "Kendra (angular houses — 1st, 4th, 7th, 10th — most powerful)"
- "Trikona (trine houses — 1st, 5th, 9th — most auspicious)"
- "Kendra-Trikona lords (the strength-giving angular and trine house rulers)"
- "Bhava (house in the birth chart)"
- "Graha (planet)"
- "Rashi (zodiac sign)"
This makes the text accessible to beginners while keeping Vedic authenticity.

`;

  const messages: Array<{ role: string; content: string | NIMContentPart[] }> = [];

  const personaPrefix = options.skipPersona ? '' : PERSONA_PREFIX;
  const prefix = POLICY_PREFIX + personaPrefix;
  if (options.system) {
    messages.push({ role: 'system', content: prefix + options.system });
  } else {
    messages.push({ role: 'system', content: prefix });
  }

  const inputs: MessageInput[] = options.messages ?? [{ role: 'user', content: 'Proceed.' }];
  for (const m of inputs) {
    messages.push({ role: m.role, content: toNIMContent(m.content) });
  }

  // Model-fallback loop: when NVIDIA marks the primary function DEGRADED (or
  // 404 "Not found for account"), key rotation cannot recover — every key hits
  // the same function ID. Configure NVIDIA_NIM_MODEL_FALLBACKS (or
  // NVIDIA_NIM_VISION_MODEL_FALLBACKS for image input) with comma-separated
  // model IDs to walk through on that specific failure class.
  const models = getModelFallbacks(model, isVision);
  let lastModelErr: unknown;
  for (let mi = 0; mi < models.length; mi++) {
    const activeModel = models[mi];
    const label = mi === 0 ? 'AI' : `AI-fb${mi}`;
    try {
      return await fetchWithKeyFallback(apiKeys, async (apiKey) => {
        const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: activeModel,
            messages,
            max_tokens: options.max_tokens ?? 2048,
            temperature: options.temperature ?? 0.7,
            stream: false,
            ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          }),
          // 270s: gives a 30s buffer before Vercel's maxDuration=300 kills the function.
          // Routes that need a shorter window (dreams: 25s, translate: 20s, monthly: 90s)
          // already pass their own signal — this default only fires when they don't.
          signal: options.signal ?? AbortSignal.timeout(270_000),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => res.statusText);
          const err = new Error(`NVIDIA NIM error ${res.status}: ${errText}`) as Error & {
            status?: number;
            retryAfterMs?: number;
          };
          err.status = res.status;
          if (res.status === 429) {
            const ra = res.headers.get('retry-after');
            let ms: number | undefined;
            if (ra) {
              const asInt = Number(ra);
              if (Number.isFinite(asInt) && asInt > 0) {
                ms = asInt * 1000;
              } else {
                const ts = Date.parse(ra);
                if (!Number.isNaN(ts)) ms = Math.max(0, ts - Date.now());
              }
            }
            err.retryAfterMs = ms;
          }
          throw err;
        }

        const data = (await res.json()) as { choices?: Array<{ message: { content: string } }> };
        const text = data.choices?.[0]?.message?.content ?? '';
        return { content: [{ type: 'text', text }], raw: data };
      }, label);
    } catch (err) {
      lastModelErr = err;
      if (mi < models.length - 1 && isModelDegradedError(err)) {
        console.warn(`[AI] Model "${activeModel}" degraded — falling back to "${models[mi + 1]}"`);
        continue;
      }
      // Final failure for this request — either the last model in the chain
      // degraded, or a non-degraded error escaped fetchWithKeyFallback's per-key
      // alert. Surface ONE alert with how many models were tried so you can
      // tell at a glance whether this was a full NVIDIA outage or a one-off.
      if (isModelDegradedError(err) && models.length > 1) {
        notifyBackendError(
          'NIM/AI degraded',
          new Error(`All ${models.length} models in fallback chain degraded — last error: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`),
        );
      }
      throw err;
    }
  }
  throw lastModelErr instanceof Error ? lastModelErr : new Error(String(lastModelErr));
}

// ---------------------------------------------------------------------------
// Retry wrapper — exponential backoff, 429-aware (Retry-After honoured,
// 429 doesn't burn the retry budget unless we exhaust an extended quota).
// ---------------------------------------------------------------------------

const MAX_429_WAITS = 5;
const MAX_RETRY_AFTER_MS = 60_000;

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: Error | null = null;
  let attempt = 0;
  let rateLimitWaits = 0;
  while (attempt < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      lastError = e;
      const status = (e as { status?: number }).status;

      if (status === 429 && rateLimitWaits < MAX_429_WAITS) {
        // Throttled — wait the server-suggested delay (capped) and retry without
        // counting against maxRetries. Bound the total 429 patience too.
        const retryAfterMs = (e as { retryAfterMs?: number }).retryAfterMs;
        const fallback = Math.min(2000 * Math.pow(2, rateLimitWaits), MAX_RETRY_AFTER_MS);
        const wait = Math.min(retryAfterMs ?? fallback, MAX_RETRY_AFTER_MS);
        console.warn(`[AI] 429 rate-limited, waiting ${wait}ms (retry-after=${retryAfterMs ?? 'n/a'})`);
        rateLimitWaits += 1;
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      attempt += 1;
      console.warn(`[AI] Attempt ${attempt}/${maxRetries} failed: ${e.message}`);
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 8000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Public entry point — NVIDIA NIM with retry
// ---------------------------------------------------------------------------

export async function createAIMessage(options: AIRequestOptions): Promise<AIResponse> {
  return withRetry(() => callNIM(options), options.maxRetries ?? 3);
}
