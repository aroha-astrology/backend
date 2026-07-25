// =============================================================================
// Transit pre-alert push copy (LLM)
// =============================================================================
// One short, sharp notification per (transit event x natal Moon sign x
// language), generated two days before the event and pushed at 19:00 IST.
//
// This copy goes to every device with no human in the loop and cannot be
// recalled once FCM has it. Everything below is built around that fact:
// generateTransitCopy() is the creative half, validateTransitCopy() is the
// half that assumes the creative half will eventually produce something
// unusable and refuses to let it through.
// =============================================================================

import { generate } from './gemini-client.js';
import { MODEL, TRANSIT_ALERT_PROFILE } from '../../config/llm.js';
import { cleanJsonString } from './horoscope.js';
import { HOUSE_SIGNIFICATIONS } from './house-insight.js';
import { SIGNS } from '../astro-tools/transit.js';
import type { TransitEventType } from '../astro-tools/transit-events.js';
import {
  POLICY_SYSTEM_DIRECTIVE,
  classifyAssistantOutput,
  classifyUserMessage,
} from '../content-policy.js';
import { logger } from '../logger.js';

export type LangCode = 'en' | 'hi' | 'bn' | 'mr' | 'te' | 'ta' | 'gu';

export interface TransitCopy {
  title: string;
  body: string;
}

export interface TransitCopyContext {
  planet: string;
  eventType: TransitEventType;
  /** Sign the event happens in — entered sign for ingress, standing sign for a station. */
  sign: string;
  /** IST date of the event, YYYY-MM-DD. */
  forDate: string;
  /** The user's natal Moon sign. Null for users with no chart yet. */
  moonSign: string | null;
  lang: LangCode;
}

/** Hard ceiling on the notification body. */
export const MAX_BODY_CHARS = 170;

const LANG_NAMES: Record<LangCode, string> = {
  en: 'English',
  hi: 'Hindi',
  bn: 'Bengali',
  mr: 'Marathi',
  te: 'Telugu',
  ta: 'Tamil',
  gu: 'Gujarati',
};

/**
 * Unicode block each language must actually be written in.
 *
 * This is the check that catches the failure this codebase has hit repeatedly:
 * the model silently answering in English (or returning nothing usable) when
 * asked for an Indic language. A "Bengali" notification written in Latin script
 * is a bug, not a stylistic choice, and without this it ships silently.
 */
const SCRIPT_RANGES: Record<LangCode, RegExp> = {
  en: /[A-Za-z]/,
  hi: /[ऀ-ॿ]/,
  mr: /[ऀ-ॿ]/,
  bn: /[ঀ-৿]/,
  te: /[ఀ-౿]/,
  ta: /[஀-௿]/,
  gu: /[઀-૿]/,
};

const URL_PATTERN = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|in|io|co)\b)/i;
/** Leftover template scaffolding: {planet}, {{sign}}, [NAME], etc. */
const PLACEHOLDER_PATTERN = /\{\{?[^}]*\}?\}|\[[A-Z_]{3,}\]/;

// ---------------------------------------------------------------------------
// House derivation
// ---------------------------------------------------------------------------

/**
 * Which house the transit falls in, counted from the natal Moon (chandra
 * lagna) — the standard frame for gochar (transit) reading in Vedic astrology,
 * and the same arithmetic used by detectDoubleTransit in transit.ts.
 *
 * Returns null when either sign is unknown, which is the signal to fall back
 * to generic, house-free copy rather than to guess a house.
 */
export function houseFromMoonSign(transitSign: string, moonSign: string | null): number | null {
  if (!moonSign) return null;
  const transitIndex = SIGNS.indexOf(transitSign);
  const moonIndex = SIGNS.indexOf(moonSign);
  if (transitIndex < 0 || moonIndex < 0) return null;
  return ((transitIndex - moonIndex + 12) % 12) + 1;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const EVENT_PHRASING: Record<TransitEventType, string> = {
  ingress: 'moves into',
  retrograde: 'turns retrograde in',
  direct: 'turns direct in',
};

function buildPrompt(ctx: TransitCopyContext): string {
  const house = houseFromMoonSign(ctx.sign, ctx.moonSign);
  const houseLine =
    house !== null
      ? `For this reader the transit lands in their ${house}th house from the Moon, which governs ${HOUSE_SIGNIFICATIONS[house]}. Write about THAT area of life, concretely. Do not use the words "house" or "${house}th" — name the life area instead.`
      : `This reader's birth chart is not available, so write about the transit's general meaning. Do not invent details about their life.`;

  return `You are writing a mobile push notification for a Vedic astrology app.

THE EVENT: ${ctx.planet} ${EVENT_PHRASING[ctx.eventType]} ${ctx.sign} on ${ctx.forDate}. The reader is being told two days in advance.

${houseLine}

VOICE — this is the whole point, get it right:
You are the reader's most perceptive friend: the one who says the true thing everyone else is too polite to say, and who is funny about it. Warm, never cruel. Specific, never mystical filler. One vivid image, then one piece of advice concrete enough to act on tomorrow.

Write like a person texting, not like a horoscope column. Banned: "the cosmos", "the universe wants", "energies", "vibrations", "embrace the journey", "trust the process". If the line could appear in any horoscope for any person, it has failed.

HARD RULES:
- Body: MAXIMUM ${MAX_BODY_CHARS} characters. Count them.
- The hook must land in the first 40 characters — phones truncate the rest until tapped.
- Title: maximum 45 characters. One emoji at the start is good.
- Write in ${LANG_NAMES[ctx.lang]}, using ${LANG_NAMES[ctx.lang]} script. Every single word.
- Name a real consequence or a real action. No horoscope hedging.
- Never predict death, illness, lifespan, or medical outcomes. Never promise money, and never guarantee an outcome.
- Difficult transits get honesty plus agency ("slow down, this is not the week to sign"), never fear or doom. The reader should feel prepared, not frightened.
- No links, no URLs, no placeholder text, no quotation marks around the body.

Return ONLY this JSON object:
{"title": "...", "body": "..."}`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Gate every generated notification before it can reach a device.
 *
 * There is no human review step for this feature, so this function is the only
 * thing between a bad generation and every phone on the platform. It is
 * deliberately strict and deliberately dumb: each rule is mechanical and
 * independently testable, and anything that fails falls back to hand-written
 * copy rather than being repaired in place.
 */
export function validateTransitCopy(copy: TransitCopy, lang: LangCode): ValidationResult {
  const title = copy.title?.trim() ?? '';
  const body = copy.body?.trim() ?? '';

  if (!title) return { ok: false, reason: 'empty-title' };
  if (!body) return { ok: false, reason: 'empty-body' };
  if (body.length > MAX_BODY_CHARS) return { ok: false, reason: `body-too-long:${body.length}` };
  if (title.length > 80) return { ok: false, reason: `title-too-long:${title.length}` };

  if (URL_PATTERN.test(body) || URL_PATTERN.test(title))
    return { ok: false, reason: 'contains-url' };
  if (PLACEHOLDER_PATTERN.test(body) || PLACEHOLDER_PATTERN.test(title)) {
    return { ok: false, reason: 'unresolved-placeholder' };
  }

  const script = SCRIPT_RANGES[lang];
  if (!script.test(body)) return { ok: false, reason: `wrong-script:${lang}` };

  // Both app-wide policy filters, not just the output one.
  //
  // classifyAssistantOutput only matches assistant-voice declaratives ("you
  // will die", "your lifespan is"). classifyUserMessage carries the much wider
  // death/self-harm vocabulary, including the interrogative and transliterated
  // forms — "when will you die?", "kis umar mein", the Devanagari equivalents.
  // Normal chat only ever runs the narrow filter over model output because a
  // human is reading the reply in context and can push back. This copy goes to
  // every device unread and unrecallable, so it is held to both.
  const combined = `${title} ${body}`;
  const outputPolicy = classifyAssistantOutput(combined, lang);
  if (outputPolicy.blocked) return { ok: false, reason: `policy:${outputPolicy.topic}` };

  const topicPolicy = classifyUserMessage(combined, lang);
  if (topicPolicy.blocked) return { ok: false, reason: `policy:${topicPolicy.topic}` };

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function parseCopy(raw: string): TransitCopy | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as { title?: unknown; body?: unknown };
    if (typeof data.title !== 'string' || typeof data.body !== 'string') return null;
    return { title: data.title.trim(), body: data.body.trim() };
  } catch {
    return null;
  }
}

/**
 * Generate validated copy for one (event, moon sign, language).
 *
 * Returns null when generation or validation fails twice — the caller
 * substitutes the static fallback. Never throws: a Gemini outage must degrade
 * the notification, not abort the whole send.
 */
export async function generateTransitCopy(ctx: TransitCopyContext): Promise<TransitCopy | null> {
  const basePrompt = buildPrompt(ctx);

  for (let attempt = 1; attempt <= 2; attempt++) {
    // The retry restates the constraints the first attempt is most likely to
    // have broken — length and script — rather than simply rolling the dice
    // again at the same temperature.
    const prompt =
      attempt === 1
        ? basePrompt
        : `${basePrompt}\n\nYour previous attempt was rejected. Be stricter: the body MUST be under ${MAX_BODY_CHARS} characters and MUST be written entirely in ${LANG_NAMES[ctx.lang]} script.`;

    let raw: string;
    try {
      raw = await generate({
        profile: TRANSIT_ALERT_PROFILE,
        model: MODEL,
        messages: [
          { role: 'system', content: POLICY_SYSTEM_DIRECTIVE },
          { role: 'user', content: prompt },
        ],
      });
    } catch (err) {
      logger.warn(
        { err, attempt, planet: ctx.planet, lang: ctx.lang, moonSign: ctx.moonSign },
        'transit-alert: generation failed',
      );
      continue;
    }

    const parsed = parseCopy(raw);
    if (!parsed) {
      logger.warn(
        { attempt, lang: ctx.lang, raw: raw.slice(0, 200) },
        'transit-alert: unparseable',
      );
      continue;
    }

    const validation = validateTransitCopy(parsed, ctx.lang);
    if (validation.ok) return parsed;

    logger.warn(
      { attempt, lang: ctx.lang, moonSign: ctx.moonSign, reason: validation.reason },
      'transit-alert: copy rejected by validator',
    );
  }

  return null;
}
