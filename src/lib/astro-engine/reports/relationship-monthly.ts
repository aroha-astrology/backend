// =============================================================================
// Relationship (monthly) report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access. See
// monthly-dasha-context.ts for the shared dasha-resolution + scoring formula
// this and the other 3 monthly reports are built on.
// =============================================================================

import { analyzePlanetStrengths } from '../gemstones.js';
import {
  computeMonthlyReportScore,
  findMonthSubPeriods,
  safelyResolveActivePeriod,
  toneFromMonthScore,
  type MonthlyTone,
  type MonthSubPeriod,
} from './monthly-dasha-context.js';
import { computeDoshaYogaSummary, type DoshaYogaSummary } from './report-dosha-yoga-summary.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

/** 7th house = partnership, 5th house = romance/harmony. */
const KEY_HOUSES = [7, 5];

export interface RelationshipMonthlyScores extends Record<string, unknown> {
  periodMonth: string;
  activeMahadashaLord: string;
  activeAntardashaLord: string;
  monthScore: number;
  keyHouses: number[];
  tone: MonthlyTone;
  /** Mangal Dosha caution (previously completely missing from this report, same gap as
   * true_love) — no yoga-type filter, since this report is scoped to a single month and no
   * yoga `type` in this codebase reads as month-specific (yogas are fixed natal placements,
   * not month-scoped facts) — see the doc comment above `computeRelationshipMonthlyScores`. */
  doshaYoga: DoshaYogaSummary;
  /** Within-month Pratyantardasha slices, each independently scored — closes the gap this
   * report's own LLM-file doc comment previously flagged as "genuinely cannot be answered
   * without a new astro-engine computation": "are there specific days this month best for
   * important relationship talks." Empty when periodMonth/chart data isn't usable. */
  subPeriods: MonthSubPeriod[];
}

export function computeRelationshipMonthlyScores(
  ctx: ReportScoreContext,
  periodMonth: string | null,
): RelationshipMonthlyScores {
  const chart = ctx.chart;
  const analyses = analyzePlanetStrengths(chart);
  const period = safelyResolveActivePeriod(chart, periodMonth);

  const monthScore = period
    ? computeMonthlyReportScore(period.antardashaLord, KEY_HOUSES, chart, analyses)
    : 50;

  // Mangal Dosha was completely missing from this report despite it covering the 5th/7th
  // houses — the same gap true_love had — so adding it is a real gap-fill. No yoga-type
  // filter (empty array): this report is monthly-scoped, and yogas are fixed natal placements
  // rather than month-scoped facts, so no yoga `type` in this codebase clearly fits a
  // single-month reading the way Mangal Dosha (a standing natal caution worth surfacing
  // regardless of which month is being read) does.
  const doshaYoga = computeDoshaYogaSummary(
    ctx.doshaData ?? null,
    ctx.yogaData ?? null,
    ['mangal', 'kaalSarp'],
    ['benefic', 'mahapurusha'],
  );

  const subPeriods = findMonthSubPeriods(chart, periodMonth, KEY_HOUSES, analyses);

  return {
    periodMonth: periodMonth ?? 'unknown',
    activeMahadashaLord: period?.mahadashaLord ?? 'Unknown',
    activeAntardashaLord: period?.antardashaLord ?? 'Unknown',
    monthScore,
    keyHouses: KEY_HOUSES,
    tone: toneFromMonthScore(monthScore),
    doshaYoga,
    subPeriods,
  };
}
