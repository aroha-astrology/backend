// =============================================================================
// Marriage report generator registration
// =============================================================================
// Wires the deterministic scoring (astro-engine) and LLM narrative (lib/llm)
// modules together behind the ReportGenerator contract and self-registers
// into REPORT_GENERATORS on import — see kundli-milan.generator.ts for the
// original worked example this follows exactly.
// =============================================================================

import { computeMarriageScores } from '../../../lib/astro-engine/reports/marriage.js';
import {
  generateMarriageNarrative,
  translateMarriageNarrative,
} from '../../../lib/llm/reports/marriage.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
} from '../report-generator.types.js';
import type { MarriageScores } from '../../../lib/astro-engine/reports/marriage.js';

const marriageGenerator: ReportGenerator = {
  key: 'marriage',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeMarriageScores(ctx, periodMonth);
  },
  async generateNarrative(scores: ReportScores, _language: 'en'): Promise<ReportSection[]> {
    return generateMarriageNarrative(scores as unknown as MarriageScores);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateMarriageNarrative(sections, language);
  },
};

registerReportGenerator(marriageGenerator);

export { marriageGenerator };
