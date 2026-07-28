// =============================================================================
// Numerology report generator registration
// =============================================================================
// Wires the deterministic scoring (astro-engine) and LLM narrative (lib/llm)
// modules together behind the ReportGenerator contract and self-registers
// into REPORT_GENERATORS on import — see kundli-milan.generator.ts for the
// original worked example this follows exactly.
// =============================================================================

import { computeNumerologyScores } from '../../../lib/astro-engine/reports/numerology.js';
import {
  generateNumerologyNarrative,
  translateNumerologyNarrative,
} from '../../../lib/llm/reports/numerology.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
} from '../report-generator.types.js';
import type { NumerologyScores } from '../../../lib/astro-engine/reports/numerology.js';

const numerologyGenerator: ReportGenerator = {
  key: 'numerology',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeNumerologyScores(ctx, periodMonth);
  },
  async generateNarrative(scores: ReportScores, _language: 'en'): Promise<ReportSection[]> {
    return generateNumerologyNarrative(scores as unknown as NumerologyScores);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateNumerologyNarrative(sections, language);
  },
};

registerReportGenerator(numerologyGenerator);

export { numerologyGenerator };
