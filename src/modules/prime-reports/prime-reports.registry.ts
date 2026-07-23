// =============================================================================
// Report-type registry — the one place a new Aroha Prime report type gets
// added. Currently holds exactly one entry, `numerology`; future report
// types (career, finance, tarot, ...) get their own entry here mapping
// reportType -> price + generate()/translate(), same shape.
// =============================================================================

import {
  generateNumerologyReport,
  translateNumerologyContent,
  type NumerologyNarrative,
} from '../../lib/llm/numerology-report.js';
import {
  generateNameCorrectionReport,
  translateNameCorrectionContent,
  type NameCorrectionNarrative,
} from '../../lib/llm/name-correction-report.js';
import type { ProfileContext } from '../birth-profiles/profile-context.js';

export interface PrimeReportGenerateResult {
  content: Record<string, unknown>;
  model: string;
}

export interface PrimeReportDefinition {
  reportType: string;
  title: string;
  /** Aroha Prime pricing sheet, 2026-07-23: standard reports are ₹25 = 2500 paise. */
  pricePaise: number;
  generate: (userId: string, profile: ProfileContext) => Promise<PrimeReportGenerateResult>;
  translate: (
    content: Record<string, unknown>,
    language: string,
  ) => Promise<Record<string, unknown>>;
}

const NUMEROLOGY_UNLOCK_COST_PAISE = 2500;

export const PRIME_REPORT_DEFINITIONS: Record<string, PrimeReportDefinition> = {
  numerology: {
    reportType: 'numerology',
    title: 'Numerology Report',
    pricePaise: NUMEROLOGY_UNLOCK_COST_PAISE,
    async generate(_userId, profile) {
      if (!profile.dateOfBirth || !profile.displayName) {
        throw new Error('Numerology report requires a date of birth and a name');
      }
      const { model, ...content } = await generateNumerologyReport({
        dateOfBirth: profile.dateOfBirth,
        fullName: profile.displayName,
      });
      return { content, model };
    },
    async translate(content, language) {
      const translated = await translateNumerologyContent(
        content as unknown as NumerologyNarrative,
        language,
      );
      return translated as unknown as Record<string, unknown>;
    },
  },
  'name-correction': {
    reportType: 'name-correction',
    title: 'Name Correction Report',
    pricePaise: 2500,
    async generate(_userId, profile) {
      if (!profile.dateOfBirth || !profile.displayName) {
        throw new Error('Name Correction report requires a date of birth and a name');
      }
      const { model, ...content } = await generateNameCorrectionReport({
        dateOfBirth: profile.dateOfBirth,
        fullName: profile.displayName,
      });
      return { content, model };
    },
    async translate(content, language) {
      const translated = await translateNameCorrectionContent(
        content as unknown as NameCorrectionNarrative,
        language,
      );
      return translated as unknown as Record<string, unknown>;
    },
  },
};

export function getPrimeReportDefinition(reportType: string): PrimeReportDefinition | undefined {
  return PRIME_REPORT_DEFINITIONS[reportType];
}

export function listPrimeReportDefinitions(): PrimeReportDefinition[] {
  return Object.values(PRIME_REPORT_DEFINITIONS);
}
