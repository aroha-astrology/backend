// =============================================================================
// Wealth report generator registration
// =============================================================================
import { computeWealthScores } from '../../../lib/astro-engine/reports/wealth.js';
import {
  generateWealthNarrative,
  translateWealthNarrative,
} from '../../../lib/llm/reports/wealth.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
} from '../report-generator.types.js';
import type { WealthScores } from '../../../lib/astro-engine/reports/wealth.js';

const wealthGenerator: ReportGenerator = {
  key: 'wealth',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeWealthScores(ctx, periodMonth);
  },
  async generateNarrative(scores: ReportScores, _language: 'en'): Promise<ReportSection[]> {
    return generateWealthNarrative(scores as unknown as WealthScores);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateWealthNarrative(sections, language);
  },
};

registerReportGenerator(wealthGenerator);

export { wealthGenerator };
