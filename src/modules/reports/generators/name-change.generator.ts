// =============================================================================
// Name Change report generator registration
// =============================================================================
// Wires the deterministic scoring (astro-engine) and LLM narrative (lib/llm)
// modules together behind the ReportGenerator contract and self-registers
// into REPORT_GENERATORS on import — see kundli-milan.generator.ts for the
// original worked example this follows exactly.
// =============================================================================

import { computeNameChangeScores } from '../../../lib/astro-engine/reports/name-change.js';
import { assertPersonInputs } from '../../../lib/astro-engine/reports/numerology.js';
import {
  generateNameChangeNarrative,
  translateNameChangeNarrative,
} from '../../../lib/llm/reports/name-change.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
} from '../report-generator.types.js';
import type { NameChangeScores } from '../../../lib/astro-engine/reports/name-change.js';

const nameChangeGenerator: ReportGenerator = {
  key: 'name_change',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeNameChangeScores(ctx, periodMonth);
  },
  async generateNarrative(scores: ReportScores, _language: 'en'): Promise<ReportSection[]> {
    // See numerology.generator.ts: never narrate a stand-in name or date of birth.
    assertPersonInputs(scores, 'name change');
    return generateNameChangeNarrative(scores as unknown as NameChangeScores);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateNameChangeNarrative(sections, language);
  },
};

registerReportGenerator(nameChangeGenerator);

export { nameChangeGenerator };
