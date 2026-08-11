// =============================================================================
// True Love report generator registration
// =============================================================================
import { computeTrueLoveScores } from '../../../lib/astro-engine/reports/true-love.js';
import {
  generateTrueLoveNarrative,
  translateTrueLoveNarrative,
} from '../../../lib/llm/reports/true-love.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
  type SectionGenerationProgress,
} from '../report-generator.types.js';
import type { TrueLoveScores } from '../../../lib/astro-engine/reports/true-love.js';

const trueLoveGenerator: ReportGenerator = {
  key: 'true_love',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeTrueLoveScores(ctx, periodMonth);
  },
  async generateNarrative(
    scores: ReportScores,
    _language: 'en',
    progress?: SectionGenerationProgress,
  ): Promise<ReportSection[]> {
    return generateTrueLoveNarrative(scores as unknown as TrueLoveScores, progress);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateTrueLoveNarrative(sections, language);
  },
};

registerReportGenerator(trueLoveGenerator);

export { trueLoveGenerator };
