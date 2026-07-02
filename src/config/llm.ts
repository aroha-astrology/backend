import { env } from './env.js';

export type ModelTier = 'routing' | 'structured' | 'conversational';

export interface GenerationProfile {
  name: string;
  modelTier: ModelTier;
  temperature: number;
  jsonMode: boolean;
  stream: boolean;
  maxTokens: number;
}

export const ROUTING_PROFILE: GenerationProfile = {
  name: 'routing',
  modelTier: 'routing',
  temperature: 0.0,
  jsonMode: true,
  stream: false,
  maxTokens: 256,
};

export const FORECAST_PROFILE: GenerationProfile = {
  name: 'forecast',
  modelTier: 'structured',
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
  modelTier: 'conversational',
  temperature: 0.7,
  jsonMode: false,
  stream: true,
  maxTokens: 480,
};

/** Cheap, fast, non-streaming — used to fold older chat turns into a running summary. */
export const CHAT_SUMMARY_PROFILE: GenerationProfile = {
  name: 'chat-summary',
  modelTier: 'routing',
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
  modelTier: 'structured',
  temperature: 0.6,
  jsonMode: true,
  stream: false,
  maxTokens: 400,
};

/**
 * Yearly horoscope — same call pattern as HOROSCOPE_PROFILE but returns a
 * structured JSON overview + a per-month breakdown (12 short entries), so it
 * needs a much larger token ceiling. Generated lazily (once per user per year,
 * cached), never in a per-request hot path.
 */
export const HOROSCOPE_YEARLY_PROFILE: GenerationProfile = {
  name: 'horoscope-yearly',
  modelTier: 'structured',
  temperature: 0.6,
  jsonMode: true,
  stream: false,
  maxTokens: 900,
};

export function modelForTier(tier: ModelTier): string {
  const map: Record<ModelTier, string> = {
    routing: env.MODEL_ROUTING,
    structured: env.MODEL_STRUCTURED,
    conversational: env.MODEL_CONVERSATIONAL,
  };
  return map[tier];
}
