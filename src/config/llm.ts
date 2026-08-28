import { env } from './env.js';

/** Gemini is the sole LLM provider — every profile below uses this one model, including the
 * palm-reading vision call (confirmed live against gemini-3.1-flash-lite via the OpenAI-compat
 * endpoint on 2026-07-27 — it accepts image_url content parts natively, no separate
 * vision-tier model needed). */
export const MODEL = env.GEMINI_MODEL;

/**
 * The reasoning tier — still Gemini, just a larger model than the flash-lite
 * default. Every profile below used to resolve to the single cheapest model,
 * so a paid multi-section report got exactly the same reasoning capacity as a
 * one-line daily horoscope or a translation pass.
 *
 * Defaults to `GEMINI_MODEL`, i.e. NOTHING changes until `GEMINI_REASONING_MODEL`
 * is actually set in the environment. That is deliberate: the key pool's
 * per-model quotas differ, so the bigger model has to be confirmed against the
 * live keys before paid report traffic is pointed at it. Set the env var to
 * flip it; unset it to fall straight back.
 */
export const REASONING_MODEL = env.GEMINI_REASONING_MODEL || env.GEMINI_MODEL;

export interface GenerationProfile {
  name: string;
  temperature: number;
  jsonMode: boolean;
  stream: boolean;
  maxTokens: number;
  /**
   * Per-profile model override. Resolution order in `gemini-client.ts` is
   * `opts.model ?? profile.model ?? env.GEMINI_MODEL`, so a profile that
   * leaves this unset keeps the default model exactly as before.
   */
  model?: string;
}

/**
 * Multimodal content-part union — the OpenAI-compatible shape Gemini's
 * `/chat/completions` endpoint accepts for image input. Added for palm
 * reading (the first and, as of this change, only multimodal caller in this
 * codebase); every existing caller keeps passing a plain string and is
 * unaffected.
 */
export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ChatMessage {
  role: string;
  content: string | ChatContentPart[];
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
  /**
   * Attributes this call's `ai_usage` telemetry row (see gemini-client.ts's
   * `generate()`) to a user. Optional and not yet threaded through every
   * existing call site — new callers (e.g. the reports feature) can start
   * passing it; omitted calls just record `userId: null`.
   */
  userId?: string | null;
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

// Target reply is ~110 words, ~170 words max plus one short "Ask next:"
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

/** Cheap, fast, non-streaming — used to fold older chat turns into a running summary. */
export const CHAT_SUMMARY_PROFILE: GenerationProfile = {
  name: 'chat-summary',
  temperature: 0.2,
  jsonMode: false,
  stream: false,
  maxTokens: 220,
};

/** Cheap, fast, non-streaming, JSON-mode — used to extract durable personal facts from a single chat turn. */
export const FACT_EXTRACTION_PROFILE: GenerationProfile = {
  name: 'fact-extraction',
  temperature: 0.2,
  jsonMode: true,
  stream: false,
  maxTokens: 300,
};

/**
 * Personalized daily/tomorrow/weekly/monthly horoscope — generated once per
 * user per period and cached, never per-request, so a moderate temperature for
 * narrative variety is fine without repeated-cost or timeout concerns.
 * Non-streaming: the caller awaits the full summary before writing the DB row.
 *
 * 2026-08-28: raised 800 -> 4096. The 800 ceiling was sized when a horoscope
 * was ONE block (hook/description/advice). It is now SIX independent blocks
 * (health/career/marriage/finance/education/overall), each with its own
 * hook+description+advice, plus luckyColor/luckyNumber — 18 text fields, not 3.
 * Against the prompt's own word caps that is ~760 output tokens for `daily`,
 * ~1000 for `weekly` and ~1250 for `monthly` in ENGLISH, before the 2-4x
 * non-Latin-script inflation documented all over this file. Truncation here
 * does not degrade gracefully: it returns unparseable JSON, which
 * parseStructuredResponse rejects and the caller turns into a `failed` row, so
 * the user gets no reading at all. Matches HOROSCOPE_YEARLY_PROFILE and
 * HOROSCOPE_TRANSLATION_PROFILE, which already carry this exact schema.
 */
export const HOROSCOPE_PROFILE: GenerationProfile = {
  name: 'horoscope',
  temperature: 0.6,
  jsonMode: true,
  stream: false,
  maxTokens: 4096,
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
 * Weekly/monthly/yearly moon-sign forecast translation — same schema as
 * FORECAST_TRANSLATION_PROFILE above plus a variable-length `keyEvents[]`
 * (one full-sentence description per ingress/station sampled across the
 * period — a yearly forecast can carry a dozen-plus of these) and each of
 * the 6 `categories` now carrying its own hook/description/advice rather
 * than daily's bare description. That pushed a Hindi re-emission of a
 * yearly forecast past FORECAST_TRANSLATION_PROFILE's 4096-token ceiling
 * (confirmed via production logs: truncated mid-JSON, "Unterminated string
 * in JSON"), silently falling back to English content. Matches
 * REPORT_TRANSLATION_PROFILE/PALM_TRANSLATION_PROFILE's 8192 "large
 * schema" tier. Cached forever per (date, sign, period, language) after the
 * first successful call, so the larger ceiling is not a recurring cost.
 */
export const FORECAST_PERIODIC_TRANSLATION_PROFILE: GenerationProfile = {
  name: 'forecast-periodic-translation',
  temperature: 0.3,
  jsonMode: true,
  stream: false,
  maxTokens: 8192,
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
 * Kundli yoga/dosha name+description translation — a chart can have several
 * yogas (each with a multi-sentence description) plus up to 7 doshas (each
 * with a description, some with extra cancellation/indicator sentences), so
 * this gets the same generous non-Latin-script-inflation headroom as
 * HOUSE_INSIGHT_TRANSLATION_PROFILE rather than a tighter English-sized ceiling.
 */
export const KUNDLI_CONTENT_TRANSLATION_PROFILE: GenerationProfile = {
  name: 'kundli-content-translation',
  temperature: 0.5,
  jsonMode: true,
  stream: false,
  maxTokens: 2048,
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

/**
 * Transit pre-alert push copy — a title plus a body of at most 170 characters,
 * written per (transit event × natal Moon sign × language).
 *
 * Temperature is high by this codebase's standards on purpose: the whole point
 * of the format is copy sharp enough that people screenshot it, and 0.4 gives
 * the same seven bland sentences every month.
 *
 * 512 tokens is far more than 170 characters needs, and that is deliberate.
 * Non-Latin scripts inflate token counts several-fold, and a ceiling sized
 * from the English character count is precisely what produced the empty
 * Bengali chat replies (see CHAT_PROFILE's 700->2048 history). Truncation here
 * would be worse than elsewhere — the output is unrecallable once pushed — so
 * the ceiling is set where it can never be the binding constraint.
 */
export const TRANSIT_ALERT_PROFILE: GenerationProfile = {
  name: 'transit-alert',
  temperature: 0.9,
  jsonMode: true,
  stream: false,
  maxTokens: 512,
};

/**
 * Fact-based re-engagement nudge (title+body from one saved `user_facts`
 * row). Same non-Latin-script token-inflation reasoning as
 * TRANSIT_ALERT_PROFILE above — the output is a lock-screen notification
 * with no human review, so the ceiling is set well clear of the ~120
 * character body limit rather than sized to the English case.
 */
export const FACT_NUDGE_PROFILE: GenerationProfile = {
  name: 'fact-nudge',
  temperature: 0.8,
  jsonMode: true,
  stream: false,
  maxTokens: 512,
};

/**
 * Purchased report narrative (marriage, kundli milan, wealth, monthly
 * reports, etc.) — one or more structured JSON section arrays generated
 * lazily the first time a paid report is generated. Same "large schema" tier
 * as PURCHASE_PLAN/VASTU/GEMSTONE: a report can have several named sections
 * each with multiple paragraphs, and generation always runs in a background
 * fire-and-forget job, never in a blocking request path.
 *
 * Raised 4096 -> 8192 when baby_name and name_change began emitting a 25-name
 * list as one short paragraph per name. Those two are now the longest reports
 * in the catalogue by paragraph count, and 4096 left no headroom above the
 * English original — the failure mode is a truncated mid-JSON response that
 * fails parsing outright, so the ceiling is sized for the longest report
 * rather than the average one. Background job, never blocking.
 */
export const REPORT_PROFILE: GenerationProfile = {
  name: 'report',
  temperature: 0.5,
  jsonMode: true,
  stream: false,
  maxTokens: 8192,
  // The one profile behind every PAID report — the most reasoning-heavy
  // generation this app does, and the one where the flash-lite ceiling showed
  // most. Translation profiles deliberately stay on the default model: they
  // re-emit content that has already been reasoned about.
  model: REASONING_MODEL,
};

/**
 * Report translation — re-emits a full section array (heading + paragraphs
 * per section) in the target language. Same non-Latin-script token inflation
 * problem documented on HOUSE_INSIGHT_TRANSLATION_PROFILE/
 * FORECAST_TRANSLATION_PROFILE above: a ceiling sized for the *English*
 * original routinely truncates a Hindi/Bengali/Tamil re-emission of the same
 * content mid-JSON. Matches REPORT_PROFILE's own 8192 generation ceiling
 * rather than trying to size a smaller "translation only" budget, for the
 * same reason those other translation profiles don't undercut their English
 * counterpart either — and tracks it upward for the same 25-name-list reason
 * (a Devanagari/Bengali re-emission of that list is the single largest output
 * this profile has to survive). Cached forever per (report, language) after
 * the first successful call, so the larger ceiling is not a recurring cost.
 */
export const REPORT_TRANSLATION_PROFILE: GenerationProfile = {
  name: 'report-translation',
  temperature: 0.3,
  jsonMode: true,
  stream: false,
  maxTokens: 8192,
};

/**
 * Palm reading Stage A — vision observation. Low temperature is deliberate:
 * this call ONLY measures what's visible (lines/mounts/fingers/markings), and
 * never interprets, so reproducibility matters more than variety here — the
 * same palm photographed twice should yield the same measurements (this is
 * also what makes the frames-hash dedupe cache trustworthy). Multimodal: the
 * caller attaches up to 6 image parts to the message content array. Sized in
 * the "large schema" tier (matches REPORT/GEMSTONE/VASTU) because a single
 * hand's full measurement set (9 mounts + 5 major lines with polylines + minor
 * lines + 5 fingerprints + markings) is at least as large as those schemas,
 * and this profile is never on a blocking per-request path (fired in the
 * background after upload, polled).
 */
export const PALM_OBSERVE_PROFILE: GenerationProfile = {
  name: 'palm-observe',
  temperature: 0.1,
  jsonMode: true,
  stream: false,
  maxTokens: 4096,
};

/**
 * Palm reading Stage B/C — interpretation and both-hands synthesis. Text-only
 * (never receives an image — see palm-rules.ts's module header for why that
 * split matters for hallucination control). Generates the full long-form
 * report: major lines, mounts, fingers, love/career/health/spirituality,
 * age-wise timeline, destiny scores, and (when both hands were captured) the
 * blueprint-vs-lived synthesis. Larger than REPORT_PROFILE's 4096 because
 * this is a deliberately deep, "give as much detail as possible" report
 * (unlike a report section list, palm has ~13 chapters plus a meaning and a
 * prediction for every line and mount) — background job, never blocking.
 *
 * 16384, not 8192: the chapter list and the per-line/per-mount `lineNotes`
 * block both grew. A ceiling that truncates does not error — it returns
 * unparseable JSON, which fails the reading and refunds the user, and in a
 * non-Latin script it bites at roughly half the English word count (this
 * codebase has shipped exactly that bug before — see CHAT_PROFILE's history).
 */
export const PALM_INTERPRET_PROFILE: GenerationProfile = {
  name: 'palm-interpret',
  temperature: 0.5,
  jsonMode: true,
  stream: false,
  maxTokens: 16384,
};

/**
 * Palm reading translation — re-emits the full interpreted report (every
 * chapter, every line/mount card) in the target language. Same non-Latin-
 * script token inflation problem documented throughout this file (see
 * REPORT_TRANSLATION_PROFILE) — matches or exceeds PALM_INTERPRET_PROFILE's
 * own generation ceiling rather than undercutting it, for the same reason
 * every other translation profile here does. Cached forever per
 * (reading, language) after the first successful call.
 */
export const PALM_TRANSLATION_PROFILE: GenerationProfile = {
  name: 'palm-translation',
  temperature: 0.3,
  jsonMode: true,
  stream: false,
  maxTokens: 16384,
};
