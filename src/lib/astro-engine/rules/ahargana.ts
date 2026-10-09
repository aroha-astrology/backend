// =============================================================================
// Ahargana and the lords of the year, month and day (Varsha, Masa, Dina)
// =============================================================================
// Bṛhat Parāśara Horā Śāstra 27.13 (register BPHS-27.13) gives 15, 30, 45 and
// 60 virupas to the lords of the year, the month, the day and the hour. The
// translation (R. Santhanam, 1984) gives how to find the first three from the
// AHARGANA, the count of days since the beginning of creation in the
// Sūrya-Siddhānta reckoning:
//
//   day lord   = Ahargana mod 7, where 1 is Sunday ... 6 is Friday, 0 is Saturday
//   year lord  = (whole part of Ahargana / 360) x 3 + 1, mod 7, same numbering
//   month lord = (whole part of Ahargana / 30)  x 2 + 1, mod 7, same numbering
//
// so the "year" is 360 days and the "month" is 30 days of the day count, not a
// calendar year or a lunar month. The day is the Hindu day, from sunrise to
// sunrise.
//
// Only Ahargana mod 2520 (= 7 x 360) matters for the three lords. It is
// anchored on the book's own figures, which agree with each other:
//   - the book quotes Burgess for 714,404,108,573 days on 1 January 1860
//   - the book's table gives the abbreviated count 65,142 for "January 0, 1984"
//     (31 December 1983), and both are 2142 mod 2520.
// The book's worked example (1 June 1984: year lord Thursday, month lord
// Friday, day lord Friday) is pinned in test/audit/shadbala.audit.spec.ts.
// =============================================================================

import type { CivilDate } from './day.js';

const BURGESS_AHARGANA_1860_01_01 = 714_404_108_573;
const MS_PER_DAY = 86_400_000;
const ANCHOR_UTC = Date.UTC(1860, 0, 1);

/** Ahargana mod 2520 for a civil date (the Hindu day that begins at that date's sunrise). */
export function aharganaMod2520(date: CivilDate): number {
  const days = Math.round(
    (Date.UTC(date.year, date.month - 1, date.day) - ANCHOR_UTC) / MS_PER_DAY,
  );
  const anchor = BURGESS_AHARGANA_1860_01_01 % 2520;
  return (((anchor + days) % 2520) + 2520) % 2520;
}

/** The book numbers 1 = Sunday ... 6 = Friday, 0 = Saturday; this is 0 = Sunday ... 6 = Saturday. */
const toWeekdayIndex = (remainder: number): number => (((remainder - 1) % 7) + 7) % 7;

/** Weekday index (0 = Sunday) of the day lord, from the Ahargana. */
export function dinaLordIndex(date: CivilDate): number {
  return toWeekdayIndex(aharganaMod2520(date) % 7);
}

/** Weekday index (0 = Sunday) of the lord of the 360-day year. */
export function varshaLordIndex(date: CivilDate): number {
  return toWeekdayIndex((Math.floor(aharganaMod2520(date) / 360) * 3 + 1) % 7);
}

/** Weekday index (0 = Sunday) of the lord of the 30-day month. */
export function masaLordIndex(date: CivilDate): number {
  return toWeekdayIndex((Math.floor(aharganaMod2520(date) / 30) * 2 + 1) % 7);
}
