// =============================================================================
// Numerology report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access, and (unlike every other
// report type in this feature) no birth CHART involved at all: every number
// here is name+DOB math from the already-built, previously-unused
// `lib/astro-engine/numerology/` module (Vedic Mulank/Bhagyank/Kua system +
// Western Pythagorean Life Path/Expression/Soul Urge/Personality system).
// `ctx.chart` is intentionally never read by this module.
//
// Never throws, matching every other report type's `computeScores`
// convention (see baby-name's "handles a null chart defensively" tests) —
// `ctx.personName`/`ctx.personDob`/`ctx.personGender` are ALL treated as
// potentially missing and fall back to documented placeholders rather than
// crashing. In real production traffic this should never actually trigger:
// a report can only be generated once `kundli.status === 'ready'`, which
// itself requires a DOB to have been computed in the first place — but
// `recomputeScoresForRead` (reports.service.ts) re-derives this context on
// every read with no such guard, so defensive fallbacks here are load-bearing
// the same way baby-name's Moon-longitude-0 fallback is.
// =============================================================================

import {
  calculateLifePath,
  calculateExpression,
  calculateSoulUrge,
  calculatePersonality,
  calculateLuckyNumbers,
} from '../numerology/index.js';
import {
  calculateMulank,
  calculateBhagyank,
  calculateLoShuGrid,
  calculateChallengeNumbers,
  calculatePersonalYear,
  calculatePersonalMonth,
  generateMonthlyForecast,
  getNamePlanes,
  getKuaData,
  type LoShuGrid,
  type ChallengeNumbers,
  type NamePlanes,
  type KuaData,
} from '../numerology/vedic.js';
import { computeNameAlignment, type NameAlignmentResult } from '../numerology/nameCorrection.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

/**
 * Classical planetary day + color association per Mulank (1-9) — a commonly-cited Chaldean/Vedic
 * numerology convention, not presented as the one unimpeachable table (some traditions vary,
 * especially for 4/7/8) — same "standard reference, not the only valid one" discipline
 * baby-name.ts's own NAKSHATRA_PADA_SYLLABLE table documents. Answers "what are my luckiest...
 * days, and colors" (numbers themselves already came from `luckyNumbers`).
 */
const LUCKY_DAY_COLOR_BY_MULANK: Record<number, { day: string; colors: string[] }> = {
  1: { day: 'Sunday', colors: ['Gold', 'Orange', 'Yellow'] },
  2: { day: 'Monday', colors: ['White', 'Cream', 'Light Green'] },
  3: { day: 'Thursday', colors: ['Yellow', 'Purple', 'Pink'] },
  4: { day: 'Sunday', colors: ['Grey', 'Blue', 'Electric colors'] },
  5: { day: 'Wednesday', colors: ['Light Green', 'White'] },
  6: { day: 'Friday', colors: ['Blue', 'Pink', 'White'] },
  7: { day: 'Monday', colors: ['Green', 'White'] },
  8: { day: 'Saturday', colors: ['Black', 'Dark Blue', 'Purple'] },
  9: { day: 'Tuesday', colors: ['Red', 'Pink', 'Crimson'] },
};

export interface LuckyDayColor {
  day: string;
  colors: string[];
}

export interface YearlyForecastEntry {
  year: number;
  personalYear: number;
}

/**
 * Defensive-only fallback DOB (Unix epoch, UTC) — used ONLY when
 * `ctx.personDob` is missing or unparseable. See module doc comment: this
 * should never actually trigger against real production data.
 */
const FALLBACK_DOB = '1970-01-01';
/** Defensive-only fallback name — same reasoning as FALLBACK_DOB. */
const FALLBACK_NAME = 'Unknown';

export interface NumerologyMonthForecast {
  month: string;
  year: number;
  calendarMonth: number;
  personalMonth: number;
  personalYear: number;
}

export interface NumerologyScores extends Record<string, unknown> {
  /** The name actually used for the name-derived numbers below — `ctx.personName`, or
   * FALLBACK_NAME on the defensive path (see module doc comment). Surfaced so the narrative
   * layer can refer to it and so a defensive fallback is visible, not silently swallowed. */
  name: string;
  /** The DOB actually used (`YYYY-MM-DD`) for the date-derived numbers below — `ctx.personDob`,
   * or FALLBACK_DOB on the defensive path. Same visibility rationale as `name`. */
  dob: string;

  mulank: number;
  bhagyank: number;
  lifePath: number;
  expression: number;
  soulUrge: number;
  personality: number;
  luckyNumbers: number[];

  loShuGrid: LoShuGrid;
  challengeNumbers: ChallengeNumbers;

  /** This calendar year's Personal Year number, as of `now` (defaults to `new Date()` — pass
   * explicitly for deterministic tests). */
  personalYear: number;
  /** This calendar month's Personal Month number, derived from `personalYear` above. */
  personalMonth: number;
  /** 12 rolling months starting at `now`'s own calendar month/year. */
  monthlyForecast: NumerologyMonthForecast[];

  namePlanes: NamePlanes;
  /** Kua Number + Feng Shui element. `calculateKuaNumber`'s formula is a classical binary
   * male/female formula with no third branch — `ctx.personGender === 'female'` maps to
   * `'female'`, everything else (`'male'`, `'other'`, missing/null) maps to `'male'`. This is a
   * documented judgment call (see `ReportScoreContext.personGender`'s own doc comment), not a
   * claim that the classical formula itself has a non-binary form. */
  kua: KuaData;

  /** Whether the current name's Chaldean number aligns with the birth-derived target numbers —
   * answers "does my current name numerologically support my birth-date numbers, or work
   * against them." Reuses name-change.ts's own `computeNameAlignment` rather than reinventing
   * it — same underlying classical computation, just also surfaced here. */
  nameAlignment: NameAlignmentResult;
  /** Answers "what are my luckiest... days, and colors" — `luckyNumbers` above already covers
   * the numbers themselves. Keyed by Mulank (see LUCKY_DAY_COLOR_BY_MULANK doc comment). */
  luckyDayColor: LuckyDayColor;
  /** 5 forward-looking years (starting this calendar year), each with its Personal Year number
   * — answers "which years ahead are numerologically strongest for me," which the existing
   * 12-month `monthlyForecast` doesn't reach (months, not years). */
  yearlyForecast: YearlyForecastEntry[];
}

function resolveName(ctx: ReportScoreContext): string {
  const trimmed = ctx.personName?.trim();
  return trimmed ? trimmed : FALLBACK_NAME;
}

/** `dobString` for `calculateLifePath` (wants 'YYYY-MM-DD') and `dob` (a `Date`) for every
 * vedic.ts function (wants a `Date`, reads getUTCDate/getUTCMonth/getUTCFullYear) are derived
 * from the SAME source string, so they can never disagree with each other. */
function resolveDob(ctx: ReportScoreContext): { dobString: string; dob: Date } {
  if (ctx.personDob) {
    const parsed = new Date(ctx.personDob);
    if (!Number.isNaN(parsed.getTime())) {
      return { dobString: ctx.personDob, dob: parsed };
    }
  }
  return { dobString: FALLBACK_DOB, dob: new Date(FALLBACK_DOB) };
}

function resolveGender(ctx: ReportScoreContext): 'male' | 'female' {
  return ctx.personGender === 'female' ? 'female' : 'male';
}

export function computeNumerologyScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
  now: Date = new Date(),
): NumerologyScores {
  const name = resolveName(ctx);
  const { dobString, dob } = resolveDob(ctx);
  const gender = resolveGender(ctx);

  const mulank = calculateMulank(dob);
  const bhagyank = calculateBhagyank(dob);
  const lifePath = calculateLifePath(dobString);
  const expression = calculateExpression(name);
  const soulUrge = calculateSoulUrge(name);
  const personality = calculatePersonality(name);
  const luckyNumbers = calculateLuckyNumbers(lifePath);

  const loShuGrid = calculateLoShuGrid(dob);
  const challengeNumbers = calculateChallengeNumbers(dob);

  const personalYear = calculatePersonalYear(dob, now.getUTCFullYear());
  const personalMonth = calculatePersonalMonth(personalYear, now.getUTCMonth() + 1);
  const monthlyForecast = generateMonthlyForecast(dob, now.getUTCFullYear(), now.getUTCMonth() + 1);

  const namePlanes = getNamePlanes(name);
  const kua = getKuaData(dob.getUTCFullYear(), gender);

  const nameAlignment = computeNameAlignment(name, dob);
  const luckyDayColor = LUCKY_DAY_COLOR_BY_MULANK[mulank] ?? {
    day: 'unavailable',
    colors: [],
  };
  const currentYear = now.getUTCFullYear();
  const yearlyForecast: YearlyForecastEntry[] = Array.from({ length: 5 }, (_, i) => {
    const year = currentYear + i;
    return { year, personalYear: calculatePersonalYear(dob, year) };
  });

  return {
    name,
    dob: dobString,
    mulank,
    bhagyank,
    lifePath,
    expression,
    soulUrge,
    personality,
    luckyNumbers,
    loShuGrid,
    challengeNumbers,
    personalYear,
    personalMonth,
    monthlyForecast,
    namePlanes,
    kua,
    nameAlignment,
    luckyDayColor,
    yearlyForecast,
  };
}
