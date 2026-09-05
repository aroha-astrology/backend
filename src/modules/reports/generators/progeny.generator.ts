// =============================================================================
// Progeny report generator registration
// =============================================================================
// Wires the deterministic scoring (astro-engine) and LLM narrative (lib/llm)
// modules together behind the ReportGenerator contract and self-registers
// into REPORT_GENERATORS on import — see kundli-milan.generator.ts for the
// original worked example this follows exactly.
// =============================================================================

import { computeProgenyScores } from '../../../lib/astro-engine/reports/progeny.js';
import {
  generateProgenyNarrative,
  translateProgenyNarrative,
} from '../../../lib/llm/reports/progeny.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
  type SectionGenerationProgress,
} from '../report-generator.types.js';
import type { ProgenyScores } from '../../../lib/astro-engine/reports/progeny.js';

const progenyGenerator: ReportGenerator = {
  key: 'progeny',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeProgenyScores(ctx, periodMonth);
  },
  async generateNarrative(
    scores: ReportScores,
    _language: 'en',
    progress?: SectionGenerationProgress,
  ): Promise<ReportSection[]> {
    return generateProgenyNarrative(scores as unknown as ProgenyScores, progress);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateProgenyNarrative(sections, language);
  },
};

registerReportGenerator(progenyGenerator);

export { progenyGenerator };
