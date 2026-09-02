/**
 * Coarse time-of-day windows for readers who don't know their birth time.
 *
 * Onboarding lets them name the part of the day they were born in instead of a
 * clock time; we store that window's MIDPOINT as `timeOfBirth` alongside
 * `birthTimeAccuracy: 'unknown'`. The window itself is deliberately NOT stored
 * — the buckets are contiguous and every midpoint falls inside its own bucket,
 * so `birthTimeWindowFor(timeOfBirth)` recovers it exactly. That also means the
 * pre-existing 'unknown'-accuracy rows (typed time, low self-rated confidence)
 * bucket to a window that is true of them by definition.
 *
 * Duplicated in the frontend at `lib/birth-time-window.ts` — same house pattern
 * as the Vastu rules. Keep the two in sync; a shared package for 30 lines is
 * not worth the build wiring.
 */

/**
 * Contiguous, gap-free cover of the 24h clock. `mid` is what lands in
 * `timeOfBirth`; `label`/`range` are English and exist only for prompt
 * interpolation (the frontend translates from `key` instead).
 */
export const BIRTH_TIME_WINDOWS = [
  {
    key: 'late_night',
    startH: 0,
    endH: 3,
    mid: '01:30',
    label: 'late night',
    range: '00:00–03:00',
  },
  {
    key: 'early_morning',
    startH: 3,
    endH: 6,
    mid: '04:30',
    label: 'early morning',
    range: '03:00–06:00',
  },
  { key: 'morning', startH: 6, endH: 12, mid: '09:00', label: 'morning', range: '06:00–12:00' },
  {
    key: 'afternoon',
    startH: 12,
    endH: 16,
    mid: '14:00',
    label: 'afternoon',
    range: '12:00–16:00',
  },
  { key: 'evening', startH: 16, endH: 20, mid: '18:00', label: 'evening', range: '16:00–20:00' },
  { key: 'night', startH: 20, endH: 24, mid: '22:00', label: 'night', range: '20:00–00:00' },
] as const;

export type BirthTimeWindow = (typeof BIRTH_TIME_WINDOWS)[number];

/**
 * Bucket an `HH:mm` / `HH:mm:ss` clock time into its window. Null only for a
 * missing or unparseable value.
 */
export function birthTimeWindowFor(time: string | null | undefined): BirthTimeWindow | null {
  if (!time) return null;
  const hour = Number(time.split(':')[0]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return BIRTH_TIME_WINDOWS.find((w) => hour >= w.startH && hour < w.endH) ?? null;
}

/**
 * The instruction every AI surface (chat, voice, horoscope, reports) sends when
 * the reader never gave a clock time — onboarding only got a part-of-day window
 * out of them and we stored its midpoint, so the time can be up to three hours
 * off. The Lagna moves a whole sign every ~2h, which leaves the ascendant right
 * only about a third of the time and the varga lagnas effectively random, and
 * drifts dasha dates by a year or two. Hedging that with "if your birth time is
 * accurate" would be dishonest, so the model is told to switch to the classical
 * treatment for an unknown birth time — read it as a Chandra Lagna (Moon-sign)
 * chart — rather than to caveat house talk it should not be doing at all.
 *
 * Defined here, beside the window table, so chat and reports cannot drift.
 */
export function unknownBirthTimeGuidance(timeOfBirth: string | null | undefined): string {
  const w = birthTimeWindowFor(timeOfBirth);
  const window = w ? `the ${w.label} (${w.range})` : 'a broad part of the day';
  return (
    `BIRTH TIME NOT KNOWN: this person could only say they were born in ${window}. ` +
    'The chart was computed from the MIDPOINT of that window, so the Ascendant, every house ' +
    'number, every divisional chart (D9/D10/...) and every dasha DATE are unreliable — the ' +
    'Lagna alone is right only about a third of the time. Read this as a CHANDRA LAGNA ' +
    "(Moon-sign) chart: ground everything in sign placements, the Moon's sign and nakshatra, " +
    'sign-based yogas, and transits. Do NOT state the Ascendant, do NOT say "your Nth house", ' +
    'do NOT cite varga placements, and give dasha periods as approximate years rather than ' +
    'dated windows. Say once, naturally, that a confirmed birth time would sharpen this and ' +
    'that they can add it in their profile — then do not raise it again.'
  );
}
