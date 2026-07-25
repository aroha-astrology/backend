// =============================================================================
// Finance (monthly) report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access. See
// monthly-dasha-context.ts for the shared dasha-resolution + scoring formula
// this and the other 3 monthly reports are built on.
// =============================================================================

import { analyzePlanetStrengths } from '../gemstones.js';
import {
  computeMonthlyReportScore,
  safelyResolveActivePeriod,
  toneFromMonthScore,
  type MonthlyTone,
} from './monthly-dasha-context.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

/** 2nd house = accumulated wealth, 11th house = monthly gains/income. */
const KEY_HOUSES = [2, 11];

export interface FinanceMonthlyScores extends Record<string, unknown> {
  periodMonth: string;
  activeMahadashaLord: string;
  activeAntardashaLord: string;
  monthScore: number;
  keyHouses: number[];
  tone: MonthlyTone;
}

export function computeFinanceMonthlyScores(
  ctx: ReportScoreContext,
  periodMonth: string | null,
): FinanceMonthlyScores {
  const chart = ctx.chart;
  const analyses = analyzePlanetStrengths(chart);
  const period = safelyResolveActivePeriod(chart, periodMonth);

  const monthScore = period
    ? computeMonthlyReportScore(period.antardashaLord, KEY_HOUSES, chart, analyses)
    : 50;

  return {
    periodMonth: periodMonth ?? 'unknown',
    activeMahadashaLord: period?.mahadashaLord ?? 'Unknown',
    activeAntardashaLord: period?.antardashaLord ?? 'Unknown',
    monthScore,
    keyHouses: KEY_HOUSES,
    tone: toneFromMonthScore(monthScore),
  };
}
