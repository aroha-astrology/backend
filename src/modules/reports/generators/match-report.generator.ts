// =============================================================================
// Match report generator registration
// =============================================================================
import { computeMatchReportScores } from '../../../lib/astro-engine/reports/match-report.js';
import {
  generateMatchReportNarrative,
  translateMatchReportNarrative,
} from '../../../lib/llm/reports/match-report.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
} from '../report-generator.types.js';
import type { MatchReportScores } from '../../../lib/astro-engine/reports/match-report.js';

const matchReportGenerator: ReportGenerator = {
  key: 'match_report',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeMatchReportScores(ctx, periodMonth);
  },
  async generateNarrative(scores: ReportScores, _language: 'en'): Promise<ReportSection[]> {
    return generateMatchReportNarrative(scores as unknown as MatchReportScores);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateMatchReportNarrative(sections, language);
  },
};

registerReportGenerator(matchReportGenerator);

export { matchReportGenerator };
