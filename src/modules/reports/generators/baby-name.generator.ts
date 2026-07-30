// =============================================================================
// Baby Name report generator registration
// =============================================================================
import { computeBabyNameScores } from '../../../lib/astro-engine/reports/baby-name.js';
import {
  generateBabyNameNarrative,
  translateBabyNameNarrative,
} from '../../../lib/llm/reports/baby-name.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
} from '../report-generator.types.js';
import type { BabyNameScores } from '../../../lib/astro-engine/reports/baby-name.js';

const babyNameGenerator: ReportGenerator = {
  key: 'baby_name',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeBabyNameScores(ctx, periodMonth);
  },
  async generateNarrative(scores: ReportScores, _language: 'en'): Promise<ReportSection[]> {
    return generateBabyNameNarrative(scores as unknown as BabyNameScores);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateBabyNameNarrative(sections, language);
  },
};

registerReportGenerator(babyNameGenerator);

export { babyNameGenerator };
