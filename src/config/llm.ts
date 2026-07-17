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

// Target reply is ~90 words, ~150 words max plus one short "Ask next:"
// follow-up line (see scholar.ts OUTPUT_STYLE) — but Gemini doesn't reliably
// hit that on open-ended questions (observed: multi-section 400+ word
// replies in Direct mode despite the prompt asking for 2-4 sentences).
// scholar.ts's streamDirectModeParagraph() streams the reply and cleans +
// trims it unit-by-unit as it arrives (flattening any markdown structure into
// prose, stopping generation at a sentence boundary once the word budget is
// crossed), so this ceiling only needs to comfortably fit the model's *raw*,
// possibly disobedient output before that cleanup — not the already-short
// target — and mainly bounds worst-case latency/cost if the budget-based
// early stop is somehow never reached.
//
// 700 was sized for English. Non-Latin scripts need substantially more raw
// tokens per word than English/Latin script (see the same non-Latin-script
// token inflation already called out on HOROSCOPE_TRANSLATION_PROFILE and
// HOUSE_INSIGHT_TRANSLATION_PROFILE below) — a Bengali reply hitting this
// ceiling before streamDirectModeParagraph ever reaches a sentence boundary
// comes back with no flushable content at all, i.e. a genuinely empty reply
// with no error surfaced (reported 2026-07-17: Bengali questions got no
// answer while the same question in Hindi/English worked fine). Raised to
// give non-Latin replies the same headroom Latin-script ones already had.
export const CHAT_PROFILE: GenerationProfile = {
  name: 'chat',
  temperature: 0.7,
  jsonMode: false,
  stream: true,
  maxTokens: 2048,
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
 *
 * 2026-07-11: raised 2500->4096 (matching PURCHASE_PLAN_PROFILE, the other
 * "large schema" tier) after finding 2500 still truncated the months array
 * in 3 of 4 production users (2/3/4 months instead of 12) even after the
 * parser stopped hard-rejecting incomplete responses -- the schema here (6
 * category blocks + a 12-entry month array with 5 sub-hooks each) is at
 * least as large as purchase-plan's single verdict.
 */
export const HOROSCOPE_YEARLY_PROFILE: GenerationProfile = {
  name: 'horoscope-yearly',
  temperature: 0.6,
  jsonMode: true,
  stream: false,
  maxTokens: 4096,
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
 * Vastu remedies analysis — one large structured JSON verdict (per-room
 * assessment, element balance, remedies, priority actions) generated once per
 * request in a fire-and-forget background task, never in a blocking path. Same
 * "large schema" tier as PURCHASE_PLAN_PROFILE.
 */
export const VASTU_PROFILE: GenerationProfile = {
  name: 'vastu',
  temperature: 0.4,
  jsonMode: true,
  stream: false,
  maxTokens: 4096,
};

/**
 * Moon/sun-sign forecast translation — re-emits the full forecast object
 * (hook/description/advice + a 6-entry `keyTransits` array + a 6-category
 * `categories` block, each with its own hook/description/advice) in the
 * target language. Devanagari and other non-Latin scripts routinely need
 * more tokens than the English original for the same content, and this
 * schema is already comparable in size to the yearly-horoscope one — 800
 * (HOROSCOPE_PROFILE's ceiling) truncated every translation attempt
 * mid-JSON (confirmed via production logs: "Unterminated string in JSON"
 * around the categories block). Same "large schema" tier as
 * HOROSCOPE_YEARLY_PROFILE/PURCHASE_PLAN_PROFILE. Cached forever per
 * (date, sign, period, language) after the first successful call, so the
 * larger ceiling is not a recurring per-request cost.
 */
export const FORECAST_TRANSLATION_PROFILE: GenerationProfile = {
  name: 'forecast-translation',
  temperature: 0.3,
  jsonMode: true,
  stream: false,
  maxTokens: 4096,
};

/**
 * Horoscope translation (daily/weekly/monthly/yearly) — re-emits the summary
 * + 6-category `structured` block + (yearly only) the 12-entry
 * `monthlyBreakdown` in the target language. Same non-Latin-script token
 * inflation problem documented on FORECAST_TRANSLATION_PROFILE above, except
 * this call used to reuse HOROSCOPE_PROFILE's 800-token generation ceiling —
 * far too small once translated (yearly's own *English* generation already
 * needs HOROSCOPE_YEARLY_PROFILE's 4096 for this exact schema+breakdown
 * combination, so 800 for a non-English re-emission of the same content was
 * guaranteed to truncate mid-JSON). This is the ceiling that was silently
 * missed when FORECAST_TRANSLATION_PROFILE was split out for the moon/sun
 * forecast path — translate-on-read here fails the same way and falls back
 * to English, which is why users on non-Latin-script languages (Hindi,
 * Bengali, Tamil, etc.) saw horoscope detail categories stuck in English.
 * Cached forever per (period, periodKey, language) after the first
 * successful call, so the larger ceiling is not a recurring per-request cost.
 */
export const HOROSCOPE_TRANSLATION_PROFILE: GenerationProfile = {
  name: 'horoscope-translation',
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

/**
 * House-insight translation — separate, larger ceiling than
 * HOUSE_INSIGHT_PROFILE's 500 (which is sized for *English* generation).
 * The translated text+strengths+weaknesses payload is smaller than
 * horoscope's, but still subject to the same non-Latin-script token
 * inflation (see HOROSCOPE_TRANSLATION_PROFILE) — 500 tokens leaves very
 * little headroom once JSON structure overhead is counted, so this gets its
 * own generous ceiling rather than risking the same truncate-then-fall-back-
 * to-English failure mode.
 */
export const HOUSE_INSIGHT_TRANSLATION_PROFILE: GenerationProfile = {
  name: 'house-insight-translation',
  temperature: 0.5,
  jsonMode: true,
  stream: false,
  maxTokens: 1200,
};

/**
 * Personalized gemstone report — one structured JSON verdict (a short intro +
 * a per-planet personal note for all 9 planets), generated lazily the first
 * time the unlocked report is viewed and cached forever after (natal chart
 * never changes). The 9-entry `perGem` array pushes this into the "large
 * schema" tier alongside PURCHASE_PLAN/VASTU, so it gets the same 4096 ceiling.
 */
export const GEMSTONE_PROFILE: GenerationProfile = {
  name: 'gemstone',
  temperature: 0.4,
  jsonMode: true,
  stream: false,
  maxTokens: 4096,
};
