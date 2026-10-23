// =============================================================================
// Morning Ritual — the rules that need no database
// =============================================================================
// The Prashna card of the day, when a Cosmic Key or a shield is earned, and when a
// shield steps in. Kept pure so the numbers are pinned by tests.
// =============================================================================

import { addDays } from '../purchase-plan/purchase-plan.dates.js';

/** 27 nakshatras x 4 padas: one card for each pada. */
export const PRASHNA_CARDS = 108;
const PADA_DEG = 360 / PRASHNA_CARDS;

/** Every third ritual day (a run of 3, 6, 9 ...) hands out a Cosmic Key. */
export const KEY_EVERY = 3;
/** Every seventh ritual day (the end of a week) earns a shield. */
export const SHIELD_EVERY = 7;
/** At most this many shields are held at once. */
export const MAX_SHIELDS = 2;

/** The nakshatra-pada (0-107) a sidereal longitude sits in. */
export function padaIndexOf(moonLongitude: number): number {
  const lon = ((moonLongitude % 360) + 360) % 360;
  return Math.min(PRASHNA_CARDS - 1, Math.floor(lon / PADA_DEG));
}

/**
 * The card for a day: the Moon's nakshatra-pada at the day's sky, moved on by nine cards (the
 * width of one sign) for every sign the reader's Ascendant sits past Aries. Without a reliable birth time
 * the Ascendant is left out (`null`), so the card follows the Moon alone and never a guessed Lagna.
 */
export function prashnaCardIndex(moonLongitude: number, ascendantSignIndex: number | null): number {
  const lagna = ascendantSignIndex === null ? 0 : ((ascendantSignIndex % 12) + 12) % 12;
  return (padaIndexOf(moonLongitude) + 9 * lagna) % PRASHNA_CARDS;
}

/** What finishing the ritual on streak day `run` earns besides the daily reward. */
export function earnedOnRun(run: number): { key: boolean; shield: boolean } {
  return { key: run > 0 && run % KEY_EVERY === 0, shield: run > 0 && run % SHIELD_EVERY === 0 };
}

/** Days until the next multiple of `every` (the next one when `run` is already on a multiple). */
export function daysUntilNext(run: number, every: number): number {
  return every - (run % every);
}

/**
 * The day a shield should cover when the ritual is done on `today`: exactly one missed day
 * (yesterday), with a claimed day before it, and a shield in hand. Two missed days in a row
 * break the streak, shield or not.
 */
export function shieldGap(
  claimed: ReadonlySet<string>,
  today: string,
  shields: number,
): string | null {
  if (shields <= 0) return null;
  const yesterday = addDays(today, -1);
  if (claimed.has(yesterday) || claimed.has(today)) return null;
  return claimed.has(addDays(today, -2)) ? yesterday : null;
}
