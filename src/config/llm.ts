import { env } from './env.js';

/** Gemini is the sole LLM provider — every profile below uses this one model. */
export const MODEL = env.GEMINI_MODEL;

export interface GenerationProfile {
  name: string;
  temperature: number;
  jsonMode: boolean;
  stream: boolean;
  maxTokens: number;
}

export interface ChatMessage {
  role: string;
  content: string;
}

export interface LLMRequestOptions {
  profile: GenerationProfile;
  messages: ChatMessage[];
  /** Override the model for this request. */
  model?: string;
  /** JSON schema to enforce on the response. */
  responseSchema?: Record<string, unknown>;
  /** Caller cancellation (e.g. client disconnect on an SSE stream). */
  signal?: AbortSignal | undefined;
  /** Override default timeout for this call (e.g. a large background job). */
  timeoutMs?: number;
}

export const ROUTING_PROFILE: GenerationProfile = {
  name: 'routing',
  temperature: 0.0,
  jsonMode: true,
  stream: false,
  maxTokens: 256,
};

export const FORECAST_PROFILE: GenerationProfile = {
  name: 'forecast',
  temperature: 0.2,
  jsonMode: true,
  stream: false,
  maxTokens: 2048,
};

// Target reply is ~90 words by default, ~150 words max (see scholar.ts
// OUTPUT_STYLE) — 480 tokens is a generous ceiling over that, chosen to bound
// worst-case generation latency (and therefore timeout risk) rather than to
// fit the intended length exactly.
export const CHAT_PROFILE: GenerationProfile = {
  name: 'chat',
  temperature: 0.7,
  jsonMode: false,
  stream: true,
  maxTokens: 480,
};

/**
 * Details-mode chat — a long-form, structured reply (~500-900 words, see
 * scholar.ts OUTPUT_STYLE_DETAILS) instead of the default short one. 1600 is
 * a generous ceiling over that target, same "bound worst-case latency"
 * rationale as CHAT_PROFILE, not a tight fit to the intended length.
 */
export const CHAT_DETAILS_PROFILE: GenerationProfile = {
  name: 'chat-details',
  temperature: 0.7,
  jsonMode: false,
  stream: true,
  maxTokens: 1600,
};

/** Cheap, fast, non-streaming — used to fold older chat turns into a running summary. */
export const CHAT_SUMMARY_PROFILE: GenerationProfile = {
  name: 'chat-summary',
  temperature: 0.2,
  jsonMode: false,
  stream: false,
  maxTokens: 220,
};

/**
 * Personalized daily horoscope — called once per active user per day from the
 * CRON pipeline (never per-request), so a moderate temperature for narrative
 * variety is fine without repeated-cost or timeout concerns. Non-streaming:
 * runDailyHoroscopes awaits the full summary before writing the DB row.
 */
export const HOROSCOPE_PROFILE: GenerationProfile = {
  name: 'horoscope',
  temperature: 0.6,
  jsonMode: true,
  stream: false,
  maxTokens: 800,
};

/**
 * Yearly horoscope — same call pattern as HOROSCOPE_PROFILE but returns a
 * structured JSON overview + a per-month breakdown (12 short entries), so it
 * needs a much larger token ceiling. Generated lazily (once per user per year,
 * cached), never in a per-request hot path.
 */
export const HOROSCOPE_YEARLY_PROFILE: GenerationProfile = {
  name: 'horoscope-yearly',
  temperature: 0.6,
  jsonMode: true,
  stream: false,
  maxTokens: 900,
};

/**
 * Purchase-timing analysis ("Planning to Buy") — a single large structured
 * JSON verdict (booking + delivery date breakdowns, birth-chart insights,
 * remedies), generated once per request in a fire-and-forget background
 * task, never in a blocking request path — so a larger token ceiling than
 * any other profile is fine here.
 */
export const PURCHASE_PLAN_PROFILE: GenerationProfile = {
  name: 'purchase-plan',
  temperature: 0.3,
  jsonMode: true,
  stream: false,
  maxTokens: 4096,
};

/**
 * Per-house kundli insight ("what this house means for THIS chart") — one
 * LLM call per (user, house), generated lazily the first time a user unlocks
 * that house and cached forever after (the natal chart never changes), so a
 * moderate token ceiling is fine without recurring per-request cost.
 */
export const HOUSE_INSIGHT_PROFILE: GenerationProfile = {
  name: 'house-insight',
  temperature: 0.5,
  jsonMode: true,
  stream: false,
  maxTokens: 500,
};
