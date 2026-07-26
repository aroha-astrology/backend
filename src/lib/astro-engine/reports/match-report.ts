// =============================================================================
// Match report — deterministic scoring (Guna Milan + 8 life-area risk factors)
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access. Wraps
// computeKundliMilanScores (unchanged, still backs the separate ₹99
// kundli_milan report) and adds the 8-area synastry read from match-risks.ts
// that no other report type computes. Kept as its own module rather than
// folded into kundli-milan.ts so the existing kundli_milan report's scores
// shape and narrative are completely unaffected by this addition.
// =============================================================================

import { computeMatchRiskFactors, type MatchRiskFactor } from '../matching/match-risks.js';
import { computeKundliMilanScores, type KundliMilanScores } from './kundli-milan.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

export interface MatchReportScores extends KundliMilanScores {
  riskFactors: MatchRiskFactor[];
}

export function computeMatchReportScores(
  ctx: ReportScoreContext,
  periodMonth: string | null,
): MatchReportScores {
  const kundliMilan = computeKundliMilanScores(ctx, periodMonth);
  const riskFactors = computeMatchRiskFactors(
    ctx.chart,
    ctx.partnerChart ?? null,
    kundliMilan,
    ctx.dashaData ?? null,
  );
  return { ...kundliMilan, riskFactors };
}
