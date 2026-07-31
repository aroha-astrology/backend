// =============================================================================
// Remedies report generator registration
// =============================================================================
// Wires the deterministic scoring (astro-engine) and LLM narrative (lib/llm)
// modules together behind the ReportGenerator contract and self-registers
// into REPORT_GENERATORS on import — see kundli-milan.generator.ts for the
// original worked example this follows exactly.
// =============================================================================

import { computeRemediesScores } from '../../../lib/astro-engine/reports/remedies.js';
import {
  generateRemediesNarrative,
  translateRemediesNarrative,
} from '../../../lib/llm/reports/remedies.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
} from '../report-generator.types.js';
import type { RemediesScores } from '../../../lib/astro-engine/reports/remedies.js';

const remediesGenerator: ReportGenerator = {
  key: 'remedies',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeRemediesScores(ctx, periodMonth);
  },
  async generateNarrative(scores: ReportScores, _language: 'en'): Promise<ReportSection[]> {
    return generateRemediesNarrative(scores as unknown as RemediesScores);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateRemediesNarrative(sections, language);
  },
};

registerReportGenerator(remediesGenerator);

export { remediesGenerator };
