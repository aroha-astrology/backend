// =============================================================================
// Shared monthly-dasha resolution for the 4 monthly report types
// =============================================================================
// health_monthly, career_monthly, finance_monthly, and relationship_monthly all
// need the same underlying fact: "which Mahadasha and Antardasha rules the
// month this report is FOR" (periodMonth, a past OR future month — never
// necessarily "now").
//
// This is trickier than it looks because of two properties of
// calculateVimshottariDasha (src/lib/astro-engine/dashas/vimshottari.ts, NOT
// modified here):
//
//   1. Every period's `isActive` flag is computed against the REAL wall-clock
//      "now" at the moment the tree was built — never against an arbitrary
//      target date. Using `isActive` here would silently answer "what's ruling
//      right now" instead of "what ruled/will rule periodMonth".
//   2. `subPeriods` (the Antardasha level and deeper) are ONLY populated for
//      whichever Mahadasha happened to be active-at-computation-time — see
//      `mahadashas.push({ ..., subPeriods: isActive ? buildSubPeriods(...) : [] })`
//      in vimshottari.ts. Every OTHER Mahadasha's `subPeriods` is `[]`. So for
//      a report about a month outside the currently-active Mahadasha, the
//      Antardasha data simply isn't there to read.
//
// The fix: never trust `isActive`/`subPeriods` from the passed-in tree at all.
// Find the Mahadasha whose own [startDate, endDate) genuinely contains the
// target date (those dates are correct regardless of isActive), then
// INDEPENDENTLY recompute that Mahadasha's Antardasha level via the exported
// `buildSubPeriods` helper (same function vimshottari.ts itself uses), scoped
// to exactly that Mahadasha's span. This is deterministic and correct for any
// past or future month, and never depends on when the tree was built.
// =============================================================================

import type { VimshottariDasha, DashaPeriod } from '@aroha-astrology/shared';
import { buildSubPeriods } from '../dashas/vimshottari.js';
import type { PlanetAnalysis } from '../gemstones.js';
import {
  getHousesRuledBy,
  getVimshottariDashaFromChart,
  isPlanetInHouse,
  strengthOfPlanet,
  strengthScoreOfPlanet,
} from './chart-facts.js';

const MS_PER_DAY = 86_400_000;
// Mirrors vimshottari.ts's own (module-private) DAYS_PER_YEAR/MS_PER_YEAR constants exactly —
// duplicated here rather than imported since vimshottari.ts doesn't export them, and this value
// must match theirs for the years<->dates conversion below to round-trip correctly.
const DAYS_PER_YEAR = 365.25;
const MS_PER_YEAR = DAYS_PER_YEAR * MS_PER_DAY;

export interface ActivePeriodForMonth {
  mahadashaLord: string;
  antardashaLord: string;
  /** The covering Mahadasha's own start/end — NOT the Antardasha's — since that's the window
   * a monthly report's "what dasha governs this period" framing refers to at the top level. */
  startDate: Date;
  endDate: Date;
}

/** Accepts 'YYYY-MM' or 'YYYY-MM-01' (or any 'YYYY-MM-DD') identically — only the year/month matter.
 * Always resolves to the 1st of that month at UTC midnight, so comparisons are timezone-independent. */
function parsePeriodMonthToDate(periodMonth: string): Date {
  const [yearStr, monthStr] = periodMonth.slice(0, 7).split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  return new Date(Date.UTC(year, month - 1, 1));
}

/** First instant of the NEXT calendar month after `monthStart` — the exclusive upper bound of
 * the target month's own date range. */
function nextMonthStart(monthStart: Date): Date {
  return new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1));
}

export function isInRange(date: Date, start: Date, end: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t < end.getTime();
}

function yearsBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / MS_PER_YEAR;
}

/**
 * Independently (re)computes the Antardasha level for a single Mahadasha node, scoped to
 * exactly that Mahadasha's own [startDate, endDate) span — never reads `mahadasha.subPeriods`,
 * which (per the module doc comment above) is `[]` for every Mahadasha except whichever one was
 * active at the moment `calculateVimshottariDasha` originally ran. Shared by
 * `findActivePeriodForMonth` (single target date) and marriage.ts's multi-year window walk
 * (which needs every Mahadasha's Antardashas across a 15-year span, not just one).
 */
export function computeFreshAntardashas(mahadasha: DashaPeriod): DashaPeriod[] {
  return buildSubPeriods(
    mahadasha.planet,
    mahadasha.startDate,
    yearsBetween(mahadasha.startDate, mahadasha.endDate),
    1,
    mahadasha.startDate, // currentDate only affects isActive flags, which callers here never read
    1,
  );
}

/**
 * Finds the Mahadasha + Antardasha lord covering an arbitrary `periodMonth` (past or future),
 * ignoring the tree's own `isActive` flags and never relying on `subPeriods` being pre-populated
 * (see the module doc comment above for why). Throws if `periodMonth` falls outside the
 * computed 120-year Vimshottari span (should not happen for any realistic birth date + report
 * month combination — a defensive guard, not an expected runtime path).
 */
export function findActivePeriodForMonth(
  vimshottari: VimshottariDasha,
  periodMonth: string,
): ActivePeriodForMonth {
  const target = parsePeriodMonthToDate(periodMonth);

  const mahadasha = vimshottari.mahadashas.find((m) => isInRange(target, m.startDate, m.endDate));
  if (!mahadasha) {
    throw new Error(
      `No Mahadasha covers periodMonth "${periodMonth}" — target date falls outside the computed 120-year Vimshottari span`,
    );
  }

  // Recompute the Antardasha level fresh, scoped to exactly this Mahadasha's real span —
  // never reads mahadasha.subPeriods, which may be `[]` for a non-currently-active Mahadasha.
  const antardashas: DashaPeriod[] = computeFreshAntardashas(mahadasha);
  const antardasha =
    antardashas.find((p) => isInRange(target, p.startDate, p.endDate)) ??
    antardashas[antardashas.length - 1]; // floating-point-boundary fallback: target is within the
  // Mahadasha's own range by construction, so it can only miss every Antardasha slice due to
  // sub-millisecond rounding at the very end of the span — the last slice is the correct answer.

  if (!antardasha) {
    throw new Error(
      `Could not resolve an Antardasha within Mahadasha ${mahadasha.planet} for periodMonth "${periodMonth}"`,
    );
  }

  return {
    mahadashaLord: mahadasha.planet,
    antardashaLord: antardasha.planet,
    startDate: mahadasha.startDate,
    endDate: mahadasha.endDate,
  };
}

export interface MonthSubPeriod {
  startDate: Date;
  endDate: Date;
  /** The Pratyantardasha lord ruling this specific slice. */
  lord: string;
  /** Same `computeMonthlyReportScore` formula as the month-level score, applied to just this
   * slice's own lord — lets a report call out which specific days/weeks within the month run
   * notably better or worse than the month's overall tone. */
  score: number;
}

/**
 * Finds the Pratyantardasha-level sub-periods (typically days-to-weeks long, one level deeper
 * than the Antardasha `findActivePeriodForMonth` resolves) that overlap `periodMonth`, each
 * scored via the SAME `computeMonthlyReportScore` formula the month-level score uses — this is
 * what lets a monthly report answer "which specific weeks/dates this month" rather than only "how
 * does the whole month look." Never trusts the tree's own `subPeriods` (see this module's doc
 * comment) — independently resolves the covering Mahadasha, then Antardasha, then recomputes
 * Pratyantardashas fresh, scoped to exactly that Antardasha's own span.
 *
 * Never throws: returns `[]` for a null/missing periodMonth, an unusable chart, or a periodMonth
 * outside the 120-year Vimshottari span — same defensive contract as `safelyResolveActivePeriod`,
 * since `computeScores` (this function's only caller) must never throw.
 */
export function findMonthSubPeriods(
  chart: Record<string, unknown> | null,
  periodMonth: string | null,
  keyHouses: number[],
  analyses: PlanetAnalysis[],
): MonthSubPeriod[] {
  if (!periodMonth) return [];
  const vimshottari = getVimshottariDashaFromChart(chart);
  if (!vimshottari) return [];

  try {
    const target = parsePeriodMonthToDate(periodMonth);
    const monthEnd = nextMonthStart(target);

    const mahadasha = vimshottari.mahadashas.find((m) => isInRange(target, m.startDate, m.endDate));
    if (!mahadasha) return [];

    const antardashas = computeFreshAntardashas(mahadasha);
    const antardasha =
      antardashas.find((a) => isInRange(target, a.startDate, a.endDate)) ??
      antardashas[antardashas.length - 1];
    if (!antardasha) return [];

    const pratyantardashas = buildSubPeriods(
      antardasha.planet,
      antardasha.startDate,
      yearsBetween(antardasha.startDate, antardasha.endDate),
      2,
      antardasha.startDate, // currentDate only affects isActive flags, never read below
      2,
    );

    return pratyantardashas
      .filter(
        (p) => p.startDate.getTime() < monthEnd.getTime() && p.endDate.getTime() > target.getTime(),
      )
      .map((p) => ({
        startDate: p.startDate,
        endDate: p.endDate,
        lord: p.planet,
        score: computeMonthlyReportScore(p.planet, keyHouses, chart, analyses),
      }));
  } catch {
    return [];
  }
}

// =============================================================================
// Shared monthScore/tone formula for the 4 monthly report types
// =============================================================================
// health_monthly, career_monthly, finance_monthly, and relationship_monthly each define their
// own key houses (see each generator's astro-engine module) but apply this SAME transparent
// formula to them, rather than 4 independently-invented rules — simpler to reason about and to
// audit, and the spec allows (without requiring) identical formulas across the 4 report types.
// =============================================================================

export type MonthlyTone = 'challenging' | 'mixed' | 'favorable';

/**
 * Start from the active Antardasha lord's own strength score (30/60/90, via chart-facts.ts's
 * STRENGTH_SCORE mapping). Then adjust by +/-15 ONLY if that lord has a direct topical connection
 * to the report's key houses — either it RULES one of them (getHousesRuledBy) or it physically
 * SITS in one of them (isPlanetInHouse):
 *   - +15 if the lord is average/strong AND connected — a well-placed ruler amplifies a good
 *     outlook for exactly the houses this report is about.
 *   - -15 if the lord is weak AND connected — affliction concentrated exactly where this report
 *     is looking makes the outlook worse than the lord's bare strength alone would suggest.
 *   - No adjustment if the lord has no direct connection to either key house — the score then
 *     reflects only the lord's general strength, with no house-specific amplification either way.
 * Clamped to [0, 100].
 */
export function computeMonthlyReportScore(
  antardashaLord: string,
  keyHouses: number[],
  chart: Record<string, unknown> | null,
  analyses: PlanetAnalysis[],
): number {
  const baseScore = strengthScoreOfPlanet(antardashaLord, analyses);
  const strength = strengthOfPlanet(antardashaLord, analyses);
  const hasAffinity =
    getHousesRuledBy(antardashaLord, chart).some((h) => keyHouses.includes(h)) ||
    isPlanetInHouse(antardashaLord, keyHouses, chart);

  const adjustment = hasAffinity ? (strength === 'weak' ? -15 : 15) : 0;
  return Math.max(0, Math.min(100, baseScore + adjustment));
}

/**
 * Which of the report's own `keyHouses` the ruling lord actually connects to — by ruling it
 * (`getHousesRuledBy`) or physically sitting in it (`isPlanetInHouse`) — the same two checks
 * `computeMonthlyReportScore`'s `hasAffinity` already makes internally, just surfaced here as
 * the SPECIFIC house(s) rather than a bare boolean. Lets a report name which particular life
 * area (e.g. "your 8th house — transformation/hidden conditions" for health, or "your 10th
 * house — career/public standing" for career) is most emphasized this month, answering
 * "which specific area needs the most attention" instead of only giving one combined score.
 * Returns every matching house (never throws on a null/incomplete chart).
 */
export function computeConnectedHouses(
  lord: string,
  keyHouses: number[],
  chart: Record<string, unknown> | null,
): number[] {
  const ruled = new Set(getHousesRuledBy(lord, chart));
  return keyHouses.filter((h) => ruled.has(h) || isPlanetInHouse(lord, [h], chart));
}

/** <40 challenging, 40-70 mixed (inclusive both ends), >70 favorable — same threshold shape as
 * the marriage report's band classification, for consistency across the reports feature. */
export function toneFromMonthScore(score: number): MonthlyTone {
  if (score < 40) return 'challenging';
  if (score <= 70) return 'mixed';
  return 'favorable';
}

/**
 * Defensive wrapper around `getVimshottariDashaFromChart` + `findActivePeriodForMonth`: NEVER
 * throws, returns null on any failure (missing periodMonth, chart lacking julianDay/Moon data,
 * or a periodMonth outside the computed 120-year span). Every one of the 4 monthly report
 * generators' `computeScores` calls this rather than the two lower-level functions directly,
 * because `computeScores` must never throw — reports.service.ts's `recomputeScoresForRead` (the
 * read-time path, used on every report view, not just at generation) calls `computeScores`
 * WITHOUT a surrounding try/catch, unlike the generation-time path which does catch and
 * fail-and-refund. An uncaught throw here would crash a read request instead of degrading
 * gracefully — the same defensive discipline kundli-milan's computeKundliMilanScores already
 * follows (never throws, falls back to safe defaults on missing data).
 */
export function safelyResolveActivePeriod(
  chart: Record<string, unknown> | null,
  periodMonth: string | null,
): ActivePeriodForMonth | null {
  if (!periodMonth) return null;
  const vimshottari = getVimshottariDashaFromChart(chart);
  if (!vimshottari) return null;
  try {
    return findActivePeriodForMonth(vimshottari, periodMonth);
  } catch {
    return null;
  }
}
