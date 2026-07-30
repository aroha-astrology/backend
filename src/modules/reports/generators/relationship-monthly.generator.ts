// =============================================================================
// Relationship (monthly) report generator registration
// =============================================================================
import { computeRelationshipMonthlyScores } from '../../../lib/astro-engine/reports/relationship-monthly.js';
import {
  generateRelationshipMonthlyNarrative,
  translateRelationshipMonthlyNarrative,
} from '../../../lib/llm/reports/relationship-monthly.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
} from '../report-generator.types.js';
import type { RelationshipMonthlyScores } from '../../../lib/astro-engine/reports/relationship-monthly.js';

const relationshipMonthlyGenerator: ReportGenerator = {
  key: 'relationship_monthly',
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeRelationshipMonthlyScores(ctx, periodMonth);
  },
  async generateNarrative(scores: ReportScores, _language: 'en'): Promise<ReportSection[]> {
    return generateRelationshipMonthlyNarrative(scores as unknown as RelationshipMonthlyScores);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateRelationshipMonthlyNarrative(sections, language);
  },
};

registerReportGenerator(relationshipMonthlyGenerator);

export { relationshipMonthlyGenerator };
