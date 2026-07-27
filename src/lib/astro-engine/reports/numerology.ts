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
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

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
  };
}
