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
import { buildReportGemstones } from './report-gemstones.js';
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
  // match_report deliberately does NOT get a gemstone section (product decision — only the 5
  // flagship report types do, see report-gemstones.ts's doc comment) — overrides kundli-milan's
  // own gemstones (which computeKundliMilanScores computes for ITS OWN report type) with
  // match_report's own (always empty, since 'match_report' isn't in REPORT_GEMSTONE_SLOTS).
  const gemstones = buildReportGemstones('match_report', ctx.chart);
  return { ...kundliMilan, riskFactors, gemstones };
}
