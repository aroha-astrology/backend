// =============================================================================
// Health (monthly) report generator registration
// =============================================================================
import { computeHealthMonthlyScores } from '../../../lib/astro-engine/reports/health-monthly.js';
import {
  generateHealthMonthlyNarrative,
  translateHealthMonthlyNarrative,
} from '../../../lib/llm/reports/health-monthly.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
} from '../report-generator.types.js';
import type { HealthMonthlyScores } from '../../../lib/astro-engine/reports/health-monthly.js';

const healthMonthlyGenerator: ReportGenerator = {
  key: 'health_monthly',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeHealthMonthlyScores(ctx, periodMonth);
  },
  async generateNarrative(scores: ReportScores, _language: 'en'): Promise<ReportSection[]> {
    return generateHealthMonthlyNarrative(scores as unknown as HealthMonthlyScores);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateHealthMonthlyNarrative(sections, language);
  },
};

registerReportGenerator(healthMonthlyGenerator);

export { healthMonthlyGenerator };
