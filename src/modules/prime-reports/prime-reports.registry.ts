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
import {
  generateLifeAreaReport,
  translateLifeAreaContent,
  type LifeArea,
  type LifeAreaNarrative,
} from '../../lib/llm/life-area-report.js';
import {
  generateRemediesReport,
  translateRemediesContent,
  type RemediesNarrative,
} from '../../lib/llm/remedies-report.js';
import {
  generateCompatibilityNarrative,
  translateCompatibilityContent,
  type CompatibilityNarrative,
} from '../../lib/llm/compatibility-report.js';
import { computeCompatibilityFacts } from '../../lib/astro-engine/compatibility.js';
import {
  generatePoojaReport,
  translatePoojaContent,
  type PoojaNarrative,
} from '../../lib/llm/pooja-report.js';
import { getPoojaRecommendations } from '../../lib/astro-engine/poojaRecommendations.js';
import { getRemedies } from '../astro/astro.service.js';
import { getKundliForUser, withLiveSadeSati } from '../kundli/kundli.service.js';
import type { GroundingSource } from '../../lib/chat-grounding.js';
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

/** Aroha Prime pricing sheet, 2026-07-23: standard reports are ₹25 = 2500 paise. */
const LIFE_AREA_PRICE_PAISE = 2500;

const LIFE_AREA_TITLES: Record<LifeArea, string> = {
  career: 'Career Report',
  finance: 'Financial Report',
  health: 'Health Report',
  relationship: 'Relationship Report',
  marriage: 'Marriage Report',
  love: 'Love Report',
  education: 'Education Report',
};

const LIFE_AREAS: LifeArea[] = [
  'career',
  'finance',
  'health',
  'relationship',
  'marriage',
  'love',
  'education',
];

function makeLifeAreaDefinition(area: LifeArea): PrimeReportDefinition {
  return {
    reportType: area,
    title: LIFE_AREA_TITLES[area],
    pricePaise: LIFE_AREA_PRICE_PAISE,
    async generate(userId, profile) {
      const kundli = await getKundliForUser(userId, profile.birthProfileId);
      if (!kundli || kundli.status !== 'ready') {
        throw new Error(`${LIFE_AREA_TITLES[area]} requires a completed birth chart`);
      }
      const grounding: GroundingSource = {
        chart: kundli.chartData ?? null,
        dasha: kundli.dashaData ?? null,
        yogas: kundli.yogaData ?? null,
        doshas: await withLiveSadeSati(kundli.doshaData ?? null),
        ashtakavarga: kundli.ashtakavargaData ?? null,
      };
      const { model, ...content } = await generateLifeAreaReport({ area, grounding });
      return { content, model };
    },
    async translate(content, language) {
      const translated = await translateLifeAreaContent(
        content as unknown as LifeAreaNarrative,
        language,
      );
      return translated as unknown as Record<string, unknown>;
    },
  };
}

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
  remedies: {
    reportType: 'remedies',
    title: 'Remedies Report',
    pricePaise: 2500,
    async generate(_userId, profile) {
      const birthData =
        profile.dateOfBirth &&
        profile.timeOfBirth &&
        profile.placeOfBirth?.lat != null &&
        profile.placeOfBirth?.lon != null &&
        profile.placeOfBirth?.tz
          ? {
              date: profile.dateOfBirth,
              time: profile.timeOfBirth,
              latitude: profile.placeOfBirth.lat,
              longitude: profile.placeOfBirth.lon,
              timezone: profile.placeOfBirth.tz,
            }
          : undefined;
      if (!birthData) throw new Error('Remedies report requires complete birth details');
      const remedies = await getRemedies(birthData);
      const { model, ...content } = await generateRemediesReport({ remedies });
      return { content, model };
    },
    async translate(content, language) {
      const translated = await translateRemediesContent(
        content as unknown as RemediesNarrative,
        language,
      );
      return translated as unknown as Record<string, unknown>;
    },
  },
  compatibility: {
    reportType: 'compatibility',
    title: 'Compatibility Report (Guna Milan)',
    pricePaise: 2500,
    async generate(userId, profile) {
      if (!profile.birthProfileId) {
        throw new Error(
          'Switch to a saved partner/friend profile first to check compatibility with them',
        );
      }
      const [selfKundli, partnerKundli] = await Promise.all([
        getKundliForUser(userId, null),
        getKundliForUser(userId, profile.birthProfileId),
      ]);
      if (!selfKundli || selfKundli.status !== 'ready') {
        throw new Error('Compatibility report requires your own completed birth chart');
      }
      if (!partnerKundli || partnerKundli.status !== 'ready') {
        throw new Error(
          'Compatibility report requires a completed birth chart for the selected profile',
        );
      }
      const facts = computeCompatibilityFacts(
        selfKundli.chartData ?? null,
        partnerKundli.chartData ?? null,
      );
      const { model, ...narrative } = await generateCompatibilityNarrative({
        facts,
        partnerLabel: profile.displayName ?? 'this profile',
      });
      return { content: { ...facts, narrative }, model };
    },
    async translate(content, language) {
      const c = content as { narrative: CompatibilityNarrative; [key: string]: unknown };
      const translatedNarrative = await translateCompatibilityContent(c.narrative, language);
      return { ...c, narrative: translatedNarrative };
    },
  },
  pooja: {
    reportType: 'pooja',
    title: 'Pooja Guidance Report',
    pricePaise: 2500,
    async generate(userId, profile) {
      const kundli = await getKundliForUser(userId, profile.birthProfileId);
      if (!kundli || kundli.status !== 'ready') {
        throw new Error('Pooja Guidance report requires a completed birth chart');
      }
      const doshas = await withLiveSadeSati(kundli.doshaData ?? null);
      const recommendations = getPoojaRecommendations(doshas);
      const { model, ...content } = await generatePoojaReport({ recommendations });
      return { content, model };
    },
    async translate(content, language) {
      const translated = await translatePoojaContent(
        content as unknown as PoojaNarrative,
        language,
      );
      return translated as unknown as Record<string, unknown>;
    },
  },
  ...Object.fromEntries(LIFE_AREAS.map((area) => [area, makeLifeAreaDefinition(area)])),
};

export function getPrimeReportDefinition(reportType: string): PrimeReportDefinition | undefined {
  return PRIME_REPORT_DEFINITIONS[reportType];
}

export function listPrimeReportDefinitions(): PrimeReportDefinition[] {
  return Object.values(PRIME_REPORT_DEFINITIONS);
}
