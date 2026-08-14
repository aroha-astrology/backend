// =============================================================================
// Fact-based re-engagement nudge — recipient's fact -> validated push copy
// =============================================================================
// Twice a month (1st and 3rd Sunday, 11:30 IST), a user who has at least one
// saved `user_facts` row gets reminded of either a dated window we already
// told them about, or an unanswered follow-up question — never a fresh claim.
//
// Everything here is pure/no-DB so it can be unit tested directly, mirroring
// the split lib/llm/transit-alert.ts already uses: this module picks *which*
// fact to surface and drafts+validates the copy; fact-nudge.service.ts (in
// modules/cron) owns the DB reads, the LLM call, and the send.
// =============================================================================

import { generate } from './gemini-client.js';
import { MODEL, FACT_NUDGE_PROFILE } from '../../config/llm.js';
import { cleanJsonString } from './horoscope.js';
import { APP_TZ, PLANET_WEIGHT } from '../astro-tools/transit-events.js';
import { houseFromMoonSign } from './transit-alert.js';
import { HOUSE_SIGNIFICATIONS } from './house-insight.js';
import {
  POLICY_SYSTEM_DIRECTIVE,
  classifyAssistantOutput,
  classifyUserMessage,
} from '../content-policy.js';
import { logger } from '../logger.js';
import type { LangCode } from '../../modules/cron/broadcast-copy.js';

export type { LangCode };

// ---------------------------------------------------------------------------
// Schedule gate
// ---------------------------------------------------------------------------

/**
 * True only on the 1st or 3rd Sunday of the month, evaluated in IST.
 *
 * Deliberately NOT expressed as a cron day-of-month range: Vixie cron ORs
 * day-of-month against day-of-week, so `0 6 1-7 * 0` fires on every day 1-7
 * AND every Sunday, not their intersection. The cron entry fires every
 * Sunday; this function decides which Sundays count.
 */
export function isNudgeSunday(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TZ,
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  if (weekday !== 'Sun') return false;
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  const nthSunday = Math.ceil(day / 7);
  return nthSunday === 1 || nthSunday === 3;
}

// ---------------------------------------------------------------------------
// Suppression denylist
// ---------------------------------------------------------------------------

/**
 * Deterministic keyword gate applied to fact text BEFORE it reaches the LLM,
 * and again to the LLM's own output as a second check. Push copy renders on
 * a lock screen visible to anyone holding the phone — a fact naming a family
 * member, a health/legal problem, or a conception preference must never
 * become a notification, no matter how the prompt is worded.
 */
const BLOCKED_PATTERNS: RegExp[] = [
  /\bconceiv\w*/i,
  /\bconception\w*/i,
  /\bpregnan\w*/i,
  /\bgender\b/i,
  /\bin-?law\b/i,
  /\bdivorc\w*/i,
  /\baffair\b/i,
  /\bunsupported\b/i,
  /\bstrained\b/i,
  /lack of affection/i,
  /\bunemploy\w*/i,
  /lost (his|her|their) (previous )?job/i,
  /\billness\b/i,
  /\bhealth\b/i,
  /\bdisease\b/i,
  /\bmedical\b/i,
  /\bdiagnos\w*/i,
  /\blegal\b/i,
  /\blawsuit\b/i,
  /\bcourt\b/i,
  /\bson\b/i,
  /\bdaughter\b/i,
  /\bhusband\b/i,
  /\bwife\b/i,
  /\bspouse\b/i,
  /\bchild\b/i,
  /\bchildren\b/i,
];

export function isFactBlocked(text: string): boolean {
  return BLOCKED_PATTERNS.some((re) => re.test(text));
}

// ---------------------------------------------------------------------------
// Fact selection
// ---------------------------------------------------------------------------

export interface FactCandidate {
  fact: string;
  followUpQuestion: string | null;
}

export type NudgeTier = 'window' | 'followup';

export interface NudgePick {
  tier: NudgeTier;
  /** The fact text the copy must stay faithful to (the window fact for 'window', the source fact for 'followup'). */
  fact: string;
  /** Populated only for 'followup'. */
  followUpQuestion: string | null;
}

const WINDOW_PREFIX = /^PREVIOUSLY TOLD THEM:\s*/i;
/** How far ahead a dated window may sit and still be worth surfacing. */
export const WINDOW_HORIZON_DAYS = 45;

const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/** Every calendar date mentioned in `text` ("19 November 2026", "August 10, 2026"). */
function extractDates(text: string): Date[] {
  const months = MONTH_NAMES.join('|');
  const dates: Date[] = [];

  const dayFirst = new RegExp(`\\b(\\d{1,2})\\s+(${months})\\s+(\\d{4})\\b`, 'gi');
  for (const m of text.matchAll(dayFirst)) {
    const month = MONTH_NAMES.indexOf(m[2]!.toLowerCase());
    if (month >= 0) dates.push(new Date(Date.UTC(Number(m[3]), month, Number(m[1]))));
  }

  const monthFirst = new RegExp(`\\b(${months})\\s+(\\d{1,2}),?\\s+(\\d{4})\\b`, 'gi');
  for (const m of text.matchAll(monthFirst)) {
    const month = MONTH_NAMES.indexOf(m[1]!.toLowerCase());
    if (month >= 0) dates.push(new Date(Date.UTC(Number(m[3]), month, Number(m[2]))));
  }

  return dates;
}

/** The nearest date in `text` that falls within `[now, now + horizonDays]`, or null. */
function nearestUpcomingDate(text: string, now: Date, horizonDays: number): Date | null {
  const horizonMs = now.getTime() + horizonDays * 86_400_000;
  const upcoming = extractDates(text)
    .filter((d) => d.getTime() >= now.getTime() && d.getTime() <= horizonMs)
    .sort((a, b) => a.getTime() - b.getTime());
  return upcoming[0] ?? null;
}

/**
 * Choose the single fact a nudge should reference, or null if this user has
 * nothing worth saying this cycle. A recurring job that must always produce
 * output will invent noise — silence is a valid, expected outcome here.
 *
 * `facts` is assumed ordered oldest-first (as `getUserFacts` returns it);
 * both tiers scan newest-first so a more recent fact wins over a stale one
 * covering the same topic.
 */
export function pickNudgeFact(facts: FactCandidate[], now: Date): NudgePick | null {
  for (let i = facts.length - 1; i >= 0; i--) {
    const f = facts[i]!;
    if (!WINDOW_PREFIX.test(f.fact)) continue;
    if (isFactBlocked(f.fact)) continue;
    if (nearestUpcomingDate(f.fact, now, WINDOW_HORIZON_DAYS)) {
      return { tier: 'window', fact: f.fact, followUpQuestion: null };
    }
  }

  for (let i = facts.length - 1; i >= 0; i--) {
    const f = facts[i]!;
    if (!f.followUpQuestion) continue;
    if (isFactBlocked(f.fact) || isFactBlocked(f.followUpQuestion)) continue;
    return { tier: 'followup', fact: f.fact, followUpQuestion: f.followUpQuestion };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Transit tie-in
// ---------------------------------------------------------------------------
// The push must open on something real, not marketing flavor text — a
// specific planet currently sitting in a house of this reader's own chart.
// Nudges are grounded to a real transit or not sent at all; see
// matchTransitForPick.

export interface TransitContext {
  planet: string;
  /** 1-12, counted from the reader's natal Moon (chandra lagna). */
  house: number;
  /** HOUSE_SIGNIFICATIONS[house] — the plain-language theme of that house. */
  theme: string;
}

/** Which natal houses a fact/follow-up topic plausibly belongs to, by keyword. Order doesn't matter — matchTransitForPick checks every match. */
const FACT_HOUSE_KEYWORDS: readonly [house: number, pattern: RegExp][] = [
  [
    10,
    /\bcareer\b|\bjob\b|\bwork\b|\bprofession\w*|\brole\b|\bindustry\b|\bpromotion\b|\bstartup\b|\bbusiness\b|\bshowroom\b/i,
  ],
  [
    7,
    /\bpartner\w*|\brelationship\b|\bmarri(ed|age)\w*|\btogether\b|\bromantic\w*|\bintroduction\w*/i,
  ],
  [2, /\bincome\b|\bmoney\b|\bfinanc\w*|\bdebt\b|\bsalary\b|\bwealth\b/i],
  [11, /\bgains?\b|\bnetwork\w*/i],
  [5, /\bstud(y|ies|ying)\w*|\bexam\w*|\bcourse\b|\bcertificat\w*|\bcreativ\w*/i],
  [9, /\bcivil service\b|\bupsc\b|\bhigher (education|learning)\b/i],
  [1, /\bconfiden\w*|\bemotional\w*|\bpersonal\w*/i],
];

/** Every natal house a fact/follow-up's topic plausibly touches, by keyword — empty when nothing matches. */
export function classifyFactHouses(text: string): number[] {
  const houses: number[] = [];
  for (const [house, pattern] of FACT_HOUSE_KEYWORDS) {
    if (pattern.test(text) && !houses.includes(house)) houses.push(house);
  }
  return houses;
}

/**
 * The heaviest (most astrologically significant) currently-transiting planet
 * whose house — from this reader's own natal Moon — matches the pick's
 * topic. Null when nothing currently lines up: a recurring job that must
 * always find a hook will eventually fabricate one, and this is an astrology
 * app trading on accuracy — silence beats a made-up transit.
 */
export function matchTransitForPick(
  pick: NudgePick,
  moonSign: string | null,
  currentSigns: readonly { planet: string; sign: string }[],
): TransitContext | null {
  if (!moonSign) return null;
  const candidateHouses = classifyFactHouses(`${pick.fact} ${pick.followUpQuestion ?? ''}`);
  if (candidateHouses.length === 0) return null;

  let best: TransitContext | null = null;
  let bestWeight = -1;
  for (const { planet, sign } of currentSigns) {
    const house = houseFromMoonSign(sign, moonSign);
    if (house == null || !candidateHouses.includes(house)) continue;
    const weight = PLANET_WEIGHT[planet] ?? 0;
    if (weight > bestWeight) {
      bestWeight = weight;
      best = { planet, house, theme: HOUSE_SIGNIFICATIONS[house] ?? '' };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export interface FactNudgeCopy {
  title: string;
  body: string;
}

export const MAX_TITLE_CHARS = 40;
export const MAX_BODY_CHARS = 120;

const LANG_NAMES: Record<LangCode, string> = {
  en: 'English',
  hi: 'Hindi',
  bn: 'Bengali',
  mr: 'Marathi',
  te: 'Telugu',
  ta: 'Tamil',
  gu: 'Gujarati',
};

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
const PLACEHOLDER_PATTERN = /\{\{?[^}]*\}?\}|\[[A-Z_]{3,}\]/;

const ORDINAL_SUFFIX: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
/** 1 -> "1st", 4 -> "4th", 11 -> "11th" (the 11-13 teens never take st/nd/rd). */
function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (ORDINAL_SUFFIX[n % 10] ?? 'th');
  return `${n}${suffix}`;
}

function buildPrompt(pick: NudgePick, transit: TransitContext, lang: LangCode): string {
  const task =
    pick.tier === 'window'
      ? `You previously told this reader: "${pick.fact}". Remind them the window is approaching. Reference the timing, but do NOT restate the exact date verbatim if it makes the notification feel like a form letter — a natural phrase like "this week" or "in the coming days" relative to the date is fine, but never invent a DIFFERENT date.`
      : `This reader has an open follow-up question on file: "${pick.followUpQuestion}" (about: "${pick.fact}"). Write a notification that draws them back to talk to the astrologer about it, without putting private family details on a lock screen.`;

  return `You are writing a short mobile push notification for a Vedic astrology app, re-engaging a user based on something they told the assistant in a past chat.

Right now, ${transit.planet} is transiting this reader's ${ordinal(transit.house)} house — the house of ${transit.theme}. This is real, computed from their own chart, not flavor text.

${task}

COPYWRITING — this needs a HOOK, not a status update:
- Open on the transit above — name the planet, keep it light, don't lecture on mechanics. Connect it to the reader's situation. Close by pointing them to the astrologer, not to a form.
- This is not a form to fill out. Never phrase it as "we don't have X on file" or "let us know Y" — that's a database asking a question. It's: the sky just moved, here's why that matters for what you told us, come ask the astrologer about it.
- Title is the tease (the transit, or what's at stake); body connects it to their situation and points at the astrologer, without resolving anything.
- Speak like an astrologer who noticed something, not an automated reminder. No "Reminder:", no "Update:", no generic filler ("the stars align", "cosmic energies").

HARD RULES:
- NEVER mention a spouse, child, son, daughter, parent, or in-law by relationship or name, even if the source text does. Speak only to the reader.
- NEVER mention health, illness, legal matters, unemployment, or conception/pregnancy, even if implied by the source text.
- NEVER invent a planet, house, date, name, or detail beyond what's given above.
- Title: maximum ${MAX_TITLE_CHARS} characters.
- Body: maximum ${MAX_BODY_CHARS} characters. Count them.
- Write entirely in ${LANG_NAMES[lang]}, using ${LANG_NAMES[lang]} script.
- No links, no placeholder text, no quotation marks.

Return ONLY this JSON object:
{"title": "...", "body": "..."}`;
}

export interface ValidationResult {
  ok: boolean;
  reason?: string;
}

/**
 * Gate every generated nudge before it can reach a device. No human reviews
 * this copy, so this is the only thing standing between a bad generation and
 * a lock-screen notification — deliberately strict, deliberately mechanical.
 */
export function validateFactNudgeCopy(
  copy: FactNudgeCopy,
  lang: LangCode,
  pick: NudgePick,
): ValidationResult {
  const title = copy.title?.trim() ?? '';
  const body = copy.body?.trim() ?? '';

  if (!title) return { ok: false, reason: 'empty-title' };
  if (!body) return { ok: false, reason: 'empty-body' };
  if (title.length > MAX_TITLE_CHARS)
    return { ok: false, reason: `title-too-long:${title.length}` };
  if (body.length > MAX_BODY_CHARS) return { ok: false, reason: `body-too-long:${body.length}` };

  if (URL_PATTERN.test(body) || URL_PATTERN.test(title))
    return { ok: false, reason: 'contains-url' };
  if (PLACEHOLDER_PATTERN.test(body) || PLACEHOLDER_PATTERN.test(title))
    return { ok: false, reason: 'unresolved-placeholder' };

  const script = SCRIPT_RANGES[lang];
  if (!script.test(body)) return { ok: false, reason: `wrong-script:${lang}` };

  const combined = `${title} ${body}`;
  if (isFactBlocked(combined)) return { ok: false, reason: 'blocked-topic' };

  // A date in the output that never appeared in the source fact is a
  // hallucination, not a paraphrase.
  const sourceDates = new Set(extractDates(pick.fact).map((d) => d.getTime()));
  if (pick.followUpQuestion) {
    for (const d of extractDates(pick.followUpQuestion)) sourceDates.add(d.getTime());
  }
  for (const d of extractDates(combined)) {
    if (!sourceDates.has(d.getTime())) return { ok: false, reason: 'hallucinated-date' };
  }

  const outputPolicy = classifyAssistantOutput(combined, lang);
  if (outputPolicy.blocked) return { ok: false, reason: `policy:${outputPolicy.topic}` };
  const topicPolicy = classifyUserMessage(combined, lang);
  if (topicPolicy.blocked) return { ok: false, reason: `policy:${topicPolicy.topic}` };

  return { ok: true };
}

function parseCopy(raw: string): FactNudgeCopy | null {
  try {
    const data = JSON.parse(cleanJsonString(raw)) as { title?: unknown; body?: unknown };
    if (typeof data.title !== 'string' || typeof data.body !== 'string') return null;
    return { title: data.title.trim(), body: data.body.trim() };
  } catch {
    return null;
  }
}

/**
 * Draft and validate copy for one pick. Returns null after two failed
 * attempts — the caller substitutes a static per-tier fallback. Never
 * throws: a Gemini outage must degrade the notification, not the send.
 */
export async function generateFactNudgeCopy(
  pick: NudgePick,
  transit: TransitContext,
  lang: LangCode,
): Promise<FactNudgeCopy | null> {
  const basePrompt = buildPrompt(pick, transit, lang);

  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt =
      attempt === 1
        ? basePrompt
        : `${basePrompt}\n\nYour previous attempt was rejected. Be stricter: do not name any family member, do not invent a date, and write entirely in ${LANG_NAMES[lang]} script within the length limits.`;

    let raw: string;
    try {
      raw = await generate({
        profile: FACT_NUDGE_PROFILE,
        model: MODEL,
        messages: [
          { role: 'system', content: POLICY_SYSTEM_DIRECTIVE },
          { role: 'user', content: prompt },
        ],
      });
    } catch (err) {
      logger.warn({ err, attempt, tier: pick.tier, lang }, 'fact-nudge: generation failed');
      continue;
    }

    const parsed = parseCopy(raw);
    if (!parsed) {
      logger.warn({ attempt, lang, raw: raw.slice(0, 200) }, 'fact-nudge: unparseable');
      continue;
    }

    const validation = validateFactNudgeCopy(parsed, lang, pick);
    if (validation.ok) return parsed;

    logger.warn(
      { attempt, lang, tier: pick.tier, reason: validation.reason },
      'fact-nudge: copy rejected',
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Fallback copy — used only when generation fails twice
// ---------------------------------------------------------------------------

const FALLBACK_COPY: Record<LangCode, Record<NudgeTier, FactNudgeCopy>> = {
  en: {
    window: {
      title: 'Your window is approaching',
      body: 'A timing window you were told about is coming up. Open Aroha to review.',
    },
    followup: {
      title: 'Pick up where you left off',
      body: 'Aroha has a quick question for you. Tap to continue.',
    },
  },
  hi: {
    window: {
      title: 'आपकी समय-अवधि नज़दीक है',
      body: 'आपको बताई गई एक अवधि जल्द आ रही है। समीक्षा के लिए Aroha खोलें।',
    },
    followup: {
      title: 'जहाँ छोड़ा था वहीं से शुरू करें',
      body: 'Aroha के पास आपके लिए एक छोटा सवाल है। जारी रखने के लिए टैप करें।',
    },
  },
  bn: {
    window: {
      title: 'আপনার সময়-জানালা কাছে আসছে',
      body: 'আপনাকে জানানো একটি সময়সীমা শীঘ্রই আসছে। পর্যালোচনার জন্য Aroha খুলুন।',
    },
    followup: {
      title: 'যেখানে রেখেছিলেন সেখান থেকে শুরু করুন',
      body: 'Aroha-র কাছে আপনার জন্য একটি ছোট প্রশ্ন আছে। চালিয়ে যেতে ট্যাপ করুন।',
    },
  },
  mr: {
    window: {
      title: 'तुमची वेळ जवळ येत आहे',
      body: 'तुम्हाला सांगितलेली वेळ लवकरच येत आहे. पुनरावलोकनासाठी Aroha उघडा.',
    },
    followup: {
      title: 'जिथे थांबला होता तिथून सुरू करा',
      body: 'Aroha कडे तुमच्यासाठी एक छोटा प्रश्न आहे. सुरू ठेवण्यासाठी टॅप करा.',
    },
  },
  te: {
    window: {
      title: 'మీ సమయ విండో సమీపిస్తోంది',
      body: 'మీకు చెప్పిన సమయం త్వరలో వస్తోంది. సమీక్షించడానికి Aroha తెరవండి.',
    },
    followup: {
      title: 'మీరు ఆపిన చోటు నుండి కొనసాగించండి',
      body: 'Aroha వద్ద మీ కోసం ఒక చిన్న ప్రశ్న ఉంది. కొనసాగించడానికి నొక్కండి.',
    },
  },
  ta: {
    window: {
      title: 'உங்கள் காலக்கெடு நெருங்குகிறது',
      body: 'உங்களுக்குச் சொல்லப்பட்ட காலம் விரைவில் வருகிறது. மதிப்பாய்வு செய்ய Aroha-வைத் திறக்கவும்.',
    },
    followup: {
      title: 'நிறுத்திய இடத்திலிருந்து தொடரவும்',
      body: 'Aroha உங்களுக்கு ஒரு சிறு கேள்வியைக் கேட்க விரும்புகிறது. தொடர தட்டவும்.',
    },
  },
  gu: {
    window: {
      title: 'તમારો સમય ગાળો નજીક આવી રહ્યો છે',
      body: 'તમને જણાવેલ સમય ટૂંક સમયમાં આવી રહ્યો છે. સમીક્ષા માટે Aroha ખોલો.',
    },
    followup: {
      title: 'તમે જ્યાં અટક્યા હતા ત્યાંથી ચાલુ કરો',
      body: 'Aroha પાસે તમારા માટે એક નાનો પ્રશ્ન છે. ચાલુ રાખવા ટેપ કરો.',
    },
  },
};

export function getFactNudgeFallback(tier: NudgeTier, lang: LangCode): FactNudgeCopy {
  return (FALLBACK_COPY[lang] ?? FALLBACK_COPY.en)[tier];
}
