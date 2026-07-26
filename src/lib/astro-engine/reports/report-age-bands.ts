// =============================================================================
// Report age-band table — where does this user's CURRENT AGE sit relative to
// the timing windows Block A (report-timing.ts) found?
// =============================================================================
// A `RankedWindow[]` on its own states abstract calendar dates ("2027-03-01 to
// 2027-11-01") with no anchor to the reader's own age. This directly answers a
// real user complaint on the existing reports ("the report doesn't seem to
// account for my current age") by bucketing the years ahead into a small,
// fixed set of age bands and reporting, per band, the strongest confidence
// level any Block-A window's `startDate` falls into.
// =============================================================================

import type { RankedWindow } from './report-timing.js';

export interface AgeBand {
  /** e.g. "Now – 32", "33 – 36", "37 – 41", "42+" */
  label: string;
  startAge: number;
  /** null = open-ended final band */
  endAge: number | null;
  /** Highest-level RankedWindow whose startDate falls inside this band's date range; 'NONE' if none does. */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
}

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365.25;
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;

/**
 * Band widths, in whole years counted from the person's CURRENT age (see
 * `computeAgeYears` below):
 *   - "Now" band:     currentAge      .. currentAge + NEAR_TERM_SPAN            (4 age-values wide)
 *   - "Mid" band:     +(SPAN+1)       .. +(NEAR_TERM_SPAN + MID_SPAN)           (4 age-values wide)
 *   - "Further" band: +(prev end + 1) .. +(NEAR_TERM_SPAN+MID_SPAN+FURTHER_SPAN) (8 age-values wide)
 *   - "Beyond" band:  everything after that, open-ended
 *
 * The three closed bands' spans sum to 3 + 4 + 8 = 15 years. That is a
 * deliberate match to this codebase's existing ~15-year forward-looking
 * horizon for dasha timing-window searches (see marriage.ts's own
 * `MARRIAGE_WINDOW_YEARS = 15`, the span its window search already covers) —
 * rather than inventing a new, unrelated lookahead length for this table, it
 * mirrors the SAME horizon the windows themselves were found within. Any
 * window Block A (report-timing.ts) can realistically find at all therefore
 * lands in one of the three closed bands, not the open-ended "Beyond" one
 * (which exists only so the table always has a sane final row rather than
 * silently dropping an out-of-horizon window).
 *
 * The exact 3/4/8 split within those 15 years is a reasonable judgment call,
 * not a precision claim: a short, granular near-term band (3 years) reads as
 * immediately actionable, a matching mid band (4 years) as "the next
 * chapter," and a wider further band (8 years) acknowledges that confidence
 * naturally coarsens the further out a dasha-based read goes.
 */
const NEAR_TERM_SPAN = 3;
const MID_SPAN = 4;
const FURTHER_SPAN = 8;

const LEVEL_RANK: Record<'HIGH' | 'MEDIUM' | 'LOW', number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

/**
 * Whole-year age as of `asOf`, using calendar month/day (not a raw
 * milliseconds / 365.25 division) so it matches how a person actually states
 * their age — i.e. "hasn't had this year's birthday yet" correctly comes out
 * one year less. No existing age-calculation helper was found elsewhere in
 * this codebase (grepped for age/computeAge/calculateAge/ageInYears before
 * writing this), so this is a fresh, minimal implementation. Both dates are
 * read via UTC getters, matching every other date calculation in the reports
 * feature (see chart-facts.ts's `julianDayToDate`).
 */
export function computeAgeYears(birthDate: Date, asOf: Date): number {
  let age = asOf.getUTCFullYear() - birthDate.getUTCFullYear();
  const asOfMonthDay = asOf.getUTCMonth() * 100 + asOf.getUTCDate();
  const birthMonthDay = birthDate.getUTCMonth() * 100 + birthDate.getUTCDate();
  if (asOfMonthDay < birthMonthDay) age -= 1;
  return age;
}

/** `date` shifted forward by a (possibly fractional) number of years — the same
 * 365.25-day-year approximation marriage.ts's own private `addYears` uses. */
function addYears(date: Date, years: number): Date {
  return new Date(date.getTime() + years * MS_PER_YEAR);
}

/**
 * Highest-level window (HIGH > MEDIUM > LOW) whose `startDate` falls within
 * `[rangeStart, rangeEnd)` — `rangeEnd === null` means unbounded (the final,
 * open-ended band). Returns 'NONE' if nothing qualifies.
 */
function strongestConfidenceInRange(
  windows: RankedWindow[],
  rangeStart: Date,
  rangeEnd: Date | null,
): AgeBand['confidence'] {
  let best: AgeBand['confidence'] = 'NONE';
  let bestRank = 0;
  for (const w of windows) {
    const start = new Date(w.startDate);
    if (start.getTime() < rangeStart.getTime()) continue;
    if (rangeEnd && start.getTime() >= rangeEnd.getTime()) continue;
    const rank = LEVEL_RANK[w.level];
    if (rank > bestRank) {
      bestRank = rank;
      best = w.level;
    }
  }
  return best;
}

/**
 * Buckets `windows` (typically the output of `computeReportTimingWindows` in
 * report-timing.ts) into 4 age bands relative to the person's current age
 * (derived from `birthDate` as of `now`) — see the band-width doc comment
 * above for the exact 3/4/8/open-ended split and its rationale.
 *
 * Each band's `confidence` is the strongest window level whose `startDate`
 * falls in that band's corresponding calendar-date range — `birthDate +
 * startAge` years (inclusive) to `birthDate + endAge + 1` years (exclusive),
 * since `endAge` itself is inclusive — or 'NONE' if no window starts there.
 *
 * Never throws: an empty `windows` array simply yields 4 bands, every one of
 * them 'NONE'.
 */
export function computeAgeBandTable(
  birthDate: Date,
  now: Date,
  windows: RankedWindow[],
): AgeBand[] {
  const currentAge = computeAgeYears(birthDate, now);

  const bounds: Array<{ startAge: number; endAge: number | null }> = [
    { startAge: currentAge, endAge: currentAge + NEAR_TERM_SPAN },
    { startAge: currentAge + NEAR_TERM_SPAN + 1, endAge: currentAge + NEAR_TERM_SPAN + MID_SPAN },
    {
      startAge: currentAge + NEAR_TERM_SPAN + MID_SPAN + 1,
      endAge: currentAge + NEAR_TERM_SPAN + MID_SPAN + FURTHER_SPAN,
    },
    { startAge: currentAge + NEAR_TERM_SPAN + MID_SPAN + FURTHER_SPAN + 1, endAge: null },
  ];

  return bounds.map(({ startAge, endAge }, i) => {
    const rangeStart = addYears(birthDate, startAge);
    const rangeEnd = endAge == null ? null : addYears(birthDate, endAge + 1);
    const label =
      i === 0 ? `Now – ${endAge}` : endAge == null ? `${startAge}+` : `${startAge} – ${endAge}`;
    return {
      label,
      startAge,
      endAge,
      confidence: strongestConfidenceInRange(windows, rangeStart, rangeEnd),
    };
  });
}
