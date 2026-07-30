// =============================================================================
// Career (monthly) report generator registration
// =============================================================================
import { computeCareerMonthlyScores } from '../../../lib/astro-engine/reports/career-monthly.js';
import {
  generateCareerMonthlyNarrative,
  translateCareerMonthlyNarrative,
} from '../../../lib/llm/reports/career-monthly.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
} from '../report-generator.types.js';
import type { CareerMonthlyScores } from '../../../lib/astro-engine/reports/career-monthly.js';

const careerMonthlyGenerator: ReportGenerator = {
  key: 'career_monthly',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeCareerMonthlyScores(ctx, periodMonth);
  },
  async generateNarrative(scores: ReportScores, _language: 'en'): Promise<ReportSection[]> {
    return generateCareerMonthlyNarrative(scores as unknown as CareerMonthlyScores);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateCareerMonthlyNarrative(sections, language);
  },
};

registerReportGenerator(careerMonthlyGenerator);

export { careerMonthlyGenerator };
