// =============================================================================
// Kundli Milan generator registration
// =============================================================================
// Wires the deterministic scoring (astro-engine) and LLM narrative (lib/llm)
// modules together behind the ReportGenerator contract and self-registers
// into REPORT_GENERATORS on import. This module's only side effect is the
// registerReportGenerator() call at the bottom — it must be imported (for
// that side effect) by modules/reports/generators/index.ts, which
// reports.service.ts imports in turn, so the registration always runs before
// any report is purchased or read.
// =============================================================================

import { computeKundliMilanScores } from '../../../lib/astro-engine/reports/kundli-milan.js';
import {
  generateKundliMilanNarrative,
  translateKundliMilanNarrative,
} from '../../../lib/llm/reports/kundli-milan.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
} from '../report-generator.types.js';
import type { KundliMilanScores } from '../../../lib/astro-engine/reports/kundli-milan.js';

const kundliMilanGenerator: ReportGenerator = {
  key: 'kundli_milan',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeKundliMilanScores(ctx, periodMonth);
  },
  async generateNarrative(scores: ReportScores, _language: 'en'): Promise<ReportSection[]> {
    return generateKundliMilanNarrative(scores as unknown as KundliMilanScores);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateKundliMilanNarrative(sections, language);
  },
};

registerReportGenerator(kundliMilanGenerator);

export { kundliMilanGenerator };
