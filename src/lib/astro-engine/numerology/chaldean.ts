// =============================================================================
// Chaldean Numerology
// =============================================================================
// Replaces the pseudo-random "lucky number" generators this responds to
// (daily-synthesis.ts's (moonSignIndex + dayOfYear) % 9, and
// lucky-elements.ts's nakshatra/pada-based formula) with the actual
// classical Chaldean system: numbers derived from the native's date of birth
// (Moolank, Bhagyank) and the phonetic value of their name (Namank), each
// tied to a planetary ruler — never a day-of-year counter.
//
// Moolank/Bhagyank's date arithmetic already existed, correctly, as
// calculateMulank/calculateBhagyank in ./vedic.ts (part of the previously-
// unused Vedic numerology module) — this module delegates to those rather
// than re-deriving the same math, and adds what did NOT already exist
// anywhere in the codebase: the Chaldean LETTER-based Namank (distinct from
// both vedic.ts's date-only numbers and numerology/index.ts's Pythagorean-
// primary name numbers) and the NUMBER_RULER planetary-ruler cross-reference
// that drives day-to-day favorability judgments.
// =============================================================================

import { calculateMulank, calculateBhagyank } from './vedic.js';

/**
 * The Chaldean letter-to-number table. Unlike Pythagorean numerology's
 * sequential A=1..Z=26 (mod 9), Chaldean values are grouped by phonetic
 * vibration, not alphabet position — and 9 is never assigned to a letter; it
 * is sacred and can only appear as a REDUCED SUM.
 */
export const CHALDEAN_MAP: Readonly<Record<string, number>> = {
  A: 1,
  I: 1,
  J: 1,
  Q: 1,
  Y: 1,
  B: 2,
  K: 2,
  R: 2,
  C: 3,
  G: 3,
  L: 3,
  S: 3,
  D: 4,
  M: 4,
  T: 4,
  E: 5,
  H: 5,
  N: 5,
  X: 5,
  U: 6,
  V: 6,
  W: 6,
  O: 7,
  Z: 7,
  P: 8,
  F: 8,
};

/** The planetary ruler of each single-digit number 1-9. */
export const NUMBER_RULER: Readonly<Record<number, string>> = {
  1: 'Sun',
  2: 'Moon',
  3: 'Jupiter',
  4: 'Rahu',
  5: 'Mercury',
  6: 'Venus',
  7: 'Ketu',
  8: 'Saturn',
  9: 'Mars',
};

function digitSum(n: number): number {
  return String(Math.abs(Math.trunc(n)))
    .split('')
    .reduce((sum, d) => sum + Number(d), 0);
}

/** Repeatedly sums digits until a single digit 1-9 remains (0 reduces to 9, matching Chaldean's cyclical 1-9 range). */
export function reduceToSingleDigit(n: number): number {
  let result = Math.abs(Math.trunc(n));
  while (result > 9) result = digitSum(result);
  return result === 0 ? 9 : result;
}

/**
 * Moolank (Root/Psychic Number) — the day of birth alone, reduced.
 * Thin string-input wrapper over vedic.ts's calculateMulank (identical math,
 * already correct — see this file's header for why it isn't re-derived here).
 * @param dateOfBirth 'YYYY-MM-DD'
 */
export function moolank(dateOfBirth: string): number {
  return calculateMulank(new Date(`${dateOfBirth}T00:00:00Z`));
}

/**
 * Bhagyank (Destiny Number) — every digit of the full date of birth
 * (day + month + year) summed, then reduced. Thin wrapper over vedic.ts's
 * calculateBhagyank — see moolank() above.
 * @param dateOfBirth 'YYYY-MM-DD'
 */
export function bhagyank(dateOfBirth: string): number {
  return calculateBhagyank(new Date(`${dateOfBirth}T00:00:00Z`));
}

export interface NamankResult {
  /** The raw letter-value sum before final reduction — Chaldean treats compound numbers like 11/13/22/26 as meaningful in their own right. */
  compound: number;
  /** The final single digit 1-9. */
  reduced: number;
}

/**
 * Namank (Name Number) — the Chaldean letter-value sum of a name, exactly as
 * spelled (Latin script only; the mapping is defined per Roman letter, so
 * non-Latin input is filtered out rather than guessed at).
 */
export function namank(name: string): NamankResult {
  const letters = name
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .split('');
  const compound = letters.reduce((sum, ch) => sum + (CHALDEAN_MAP[ch] ?? 0), 0);
  return { compound, reduced: reduceToSingleDigit(compound) };
}

// ---------------------------------------------------------------------------
// Day vibration — today's number cross-referenced against the user's Moolank
// ---------------------------------------------------------------------------

/**
 * Classical Graha Maitri (natural planetary friendship), used to judge
 * whether a given day's ruling planet is favorable, neutral, or challenging
 * relative to the user's Moolank ruler. Rahu/Ketu (not part of the classical
 * seven) use the commonly-cited modern convention: aligned with the slower/
 * cooler planets (Saturn, Venus, Mercury), opposed to the luminaries and Mars.
 */
const NATURAL_FRIENDS: Readonly<Record<string, readonly string[]>> = {
  Sun: ['Moon', 'Mars', 'Jupiter'],
  Moon: ['Sun', 'Mercury'],
  Mars: ['Sun', 'Moon', 'Jupiter'],
  Mercury: ['Sun', 'Venus'],
  Jupiter: ['Sun', 'Moon', 'Mars'],
  Venus: ['Mercury', 'Saturn'],
  Saturn: ['Mercury', 'Venus'],
  Rahu: ['Venus', 'Saturn', 'Mercury'],
  Ketu: ['Mars', 'Venus', 'Saturn'],
};

const NATURAL_ENEMIES: Readonly<Record<string, readonly string[]>> = {
  Sun: ['Venus', 'Saturn'],
  Moon: [],
  Mars: ['Mercury'],
  Mercury: ['Moon'],
  Jupiter: ['Mercury', 'Venus'],
  Venus: ['Sun', 'Moon'],
  Saturn: ['Sun', 'Moon', 'Mars'],
  Rahu: ['Sun', 'Moon', 'Mars'],
  Ketu: ['Sun', 'Moon'],
};

/** What each planetary ruler's day is traditionally best suited for. */
const RULER_DOMAIN_GUIDANCE: Readonly<Record<string, string>> = {
  Sun: 'authority, leadership decisions, and dealings with officials',
  Moon: 'emotional matters, home, and public-facing work',
  Jupiter: 'finance, learning, and important agreements',
  Rahu: 'bold or unconventional moves, but not final commitments',
  Mercury: 'communication, negotiation, and short-term planning',
  Venus: 'relationships, beauty, and creative or financial pleasures',
  Ketu: 'spiritual practice and introspection, not new ventures',
  Saturn: 'disciplined, patient work — not for starting anything new',
  Mars: 'decisive action, competition, and physical exertion',
};

export interface DayVibrationResult {
  /** Today's date reduced to a single digit 1-9. */
  dayNumber: number;
  dayRuler: string;
  moolankRuler: string;
  compatibility: 'favorable' | 'neutral' | 'challenging';
  /** What today's ruling planet traditionally favors. */
  guidance: string;
}

/** Cross-references today's date-number against the user's Moolank to judge the day's overall favorability for them specifically. */
export function dayVibration(date: Date, moolankValue: number): DayVibrationResult {
  const dayNumber = reduceToSingleDigit(date.getUTCDate());
  const dayRuler = NUMBER_RULER[dayNumber] ?? 'Sun';
  const moolankRuler = NUMBER_RULER[moolankValue] ?? 'Sun';

  let compatibility: DayVibrationResult['compatibility'];
  if (dayRuler === moolankRuler || (NATURAL_FRIENDS[moolankRuler]?.includes(dayRuler) ?? false)) {
    compatibility = 'favorable';
  } else if (NATURAL_ENEMIES[moolankRuler]?.includes(dayRuler) ?? false) {
    compatibility = 'challenging';
  } else {
    compatibility = 'neutral';
  }

  return {
    dayNumber,
    dayRuler,
    moolankRuler,
    compatibility,
    guidance: RULER_DOMAIN_GUIDANCE[dayRuler] ?? 'general activities',
  };
}

// ---------------------------------------------------------------------------
// Favorable color — from the day's ruling planet, not a static per-sign table
// ---------------------------------------------------------------------------

const PLANET_COLOR: Readonly<Record<string, string>> = {
  Sun: 'Gold',
  Moon: 'Silver',
  Mars: 'Red',
  Mercury: 'Green',
  Jupiter: 'Yellow',
  Venus: 'Pink',
  Saturn: 'Blue',
  Rahu: 'Charcoal',
  Ketu: 'Brown',
};

export interface ChaldeanProfile {
  moolank: number;
  moolankRuler: string;
  bhagyank: number;
  bhagyankRuler: string;
  namank: NamankResult;
  namankRuler: string;
}

/** The user's full static numerology profile from their date of birth + name. */
export function buildChaldeanProfile(dateOfBirth: string, name: string): ChaldeanProfile {
  const moolankValue = moolank(dateOfBirth);
  const bhagyankValue = bhagyank(dateOfBirth);
  const namankValue = namank(name);
  return {
    moolank: moolankValue,
    moolankRuler: NUMBER_RULER[moolankValue] ?? 'Sun',
    bhagyank: bhagyankValue,
    bhagyankRuler: NUMBER_RULER[bhagyankValue] ?? 'Sun',
    namank: namankValue,
    namankRuler: NUMBER_RULER[namankValue.reduced] ?? 'Sun',
  };
}

export interface DailyNumerologyResult extends DayVibrationResult {
  luckyNumber: number;
  luckyColor: string;
}

/**
 * The actual daily "lucky number/color" replacement — genuinely varies day
 * to day (unlike both retired implementations), derived from today's date
 * number and colored by today's ruling planet, judged against the user's
 * own Moolank.
 */
export function dailyNumerology(date: Date, moolankValue: number): DailyNumerologyResult {
  const vibration = dayVibration(date, moolankValue);
  return {
    ...vibration,
    luckyNumber: vibration.dayNumber,
    luckyColor: PLANET_COLOR[vibration.dayRuler] ?? 'Gold',
  };
}
