// =============================================================================
// Past Life report generator registration
// =============================================================================
import { computePastLifeScores } from '../../../lib/astro-engine/reports/past-life.js';
import {
  generatePastLifeNarrative,
  translatePastLifeNarrative,
} from '../../../lib/llm/reports/past-life.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
} from '../report-generator.types.js';
import type { PastLifeScores } from '../../../lib/astro-engine/reports/past-life.js';

const pastLifeGenerator: ReportGenerator = {
  key: 'past_life',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computePastLifeScores(ctx, periodMonth);
  },
  async generateNarrative(scores: ReportScores, _language: 'en'): Promise<ReportSection[]> {
    return generatePastLifeNarrative(scores as unknown as PastLifeScores);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translatePastLifeNarrative(sections, language);
  },
};

registerReportGenerator(pastLifeGenerator);

export { pastLifeGenerator };
