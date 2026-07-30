// =============================================================================
// Finance (monthly) report generator registration
// =============================================================================
import { computeFinanceMonthlyScores } from '../../../lib/astro-engine/reports/finance-monthly.js';
import {
  generateFinanceMonthlyNarrative,
  translateFinanceMonthlyNarrative,
} from '../../../lib/llm/reports/finance-monthly.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
} from '../report-generator.types.js';
import type { FinanceMonthlyScores } from '../../../lib/astro-engine/reports/finance-monthly.js';

const financeMonthlyGenerator: ReportGenerator = {
  key: 'finance_monthly',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeFinanceMonthlyScores(ctx, periodMonth);
  },
  async generateNarrative(scores: ReportScores, _language: 'en'): Promise<ReportSection[]> {
    return generateFinanceMonthlyNarrative(scores as unknown as FinanceMonthlyScores);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateFinanceMonthlyNarrative(sections, language);
  },
};

registerReportGenerator(financeMonthlyGenerator);

export { financeMonthlyGenerator };
