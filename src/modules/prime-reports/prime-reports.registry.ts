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
import {
  generateTarotReport,
  translateTarotContent,
  type TarotNarrative,
} from '../../lib/llm/tarot-report.js';
import { drawThreeCardSpread } from '../../lib/tarot/deck.js';
import {
  generateBabyNameReport,
  translateBabyNameContent,
  BABY_NAME_STYLES,
  type BabyNameStyle,
  type BabyNameNarrative,
} from '../../lib/llm/baby-name-report.js';
import { getNamingSyllable } from '../../lib/astro-engine/babyNameSyllables.js';
import {
  generatePalmReport,
  translatePalmContent,
  type PalmNarrative,
} from '../../lib/llm/palm-report.js';
import { findPendingPalmPhoto, deletePalmPhoto } from '../palm/palm-photo.repo.js';
import { generateKpReport, translateKpContent, type KpNarrative } from '../../lib/llm/kp-report.js';
import { computeKpSignificators } from '../../lib/astro-engine/kpSubLord.js';
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
  /**
   * Periods (beyond the universal default `'lifetime'`) this report type
   * supports as separately-priced, separately-unlocked variants — e.g.
   * baby-name's naming-style choices. Omitted = this report type ONLY
   * supports `'lifetime'`; requesting any other period is rejected before
   * any wallet charge (see prime-reports.service.ts#isPeriodAllowed).
   */
  allowedPeriods?: string[];
  generate: (
    userId: string,
    profile: ProfileContext,
    period: string,
  ) => Promise<PrimeReportGenerateResult>;
  translate: (
    content: Record<string, unknown>,
    language: string,
  ) => Promise<Record<string, unknown>>;
}

const NUMEROLOGY_UNLOCK_COST_PAISE = 2500;

/**
 * Aroha Prime pricing sheet, 2026-07-23: the original 7 life-area reports
 * are standard tier (₹25 = 2500 paise). Past-Life and Kundalini are premium
 * tier (₹49 = 4900 paise), same tier as KP — per-area pricing replaces the
 * old single flat constant.
 */
const LIFE_AREA_PRICES: Record<LifeArea, number> = {
  career: 2500,
  finance: 2500,
  health: 2500,
  relationship: 2500,
  marriage: 2500,
  love: 2500,
  education: 2500,
  'past-life': 4900,
  kundalini: 4900,
};

const LIFE_AREA_TITLES: Record<LifeArea, string> = {
  career: 'Career Report',
  finance: 'Financial Report',
  health: 'Health Report',
  relationship: 'Relationship Report',
  marriage: 'Marriage Report',
  love: 'Love Report',
  education: 'Education Report',
  'past-life': 'Past-Life Report',
  kundalini: 'Kundalini & Spiritual Awakening Report',
};

const LIFE_AREAS: LifeArea[] = [
  'career',
  'finance',
  'health',
  'relationship',
  'marriage',
  'love',
  'education',
  'past-life',
  'kundalini',
];

function makeLifeAreaDefinition(area: LifeArea): PrimeReportDefinition {
  return {
    reportType: area,
    title: LIFE_AREA_TITLES[area],
    pricePaise: LIFE_AREA_PRICES[area],
    async generate(userId, profile, _period) {
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
    async generate(_userId, profile, _period) {
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
    async generate(_userId, profile, _period) {
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
    async generate(_userId, profile, _period) {
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
    async generate(userId, profile, _period) {
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
    async generate(userId, profile, _period) {
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
  tarot: {
    reportType: 'tarot',
    title: 'Tarot Reading (Past-Present-Future)',
    pricePaise: 2500,
    async generate(_userId, _profile, _period) {
      const drawn = drawThreeCardSpread();
      const cards = drawn.map((d) => ({
        name: d.card.name,
        reversed: d.reversed,
        position: d.position,
      }));
      const { model, ...narrative } = await generateTarotReport({ drawn });
      return { content: { cards, ...narrative }, model };
    },
    async translate(content, language) {
      const c = content as { cards: unknown; [key: string]: unknown };
      const { cards, ...narrative } = c;
      const translated = await translateTarotContent(
        narrative as unknown as TarotNarrative,
        language,
      );
      return { cards, ...translated };
    },
  },
  'baby-name': {
    reportType: 'baby-name',
    title: 'Baby Name Suggestions',
    pricePaise: 2500,
    allowedPeriods: BABY_NAME_STYLES,
    async generate(userId, profile, period) {
      const style = period as BabyNameStyle;
      if (!BABY_NAME_STYLES.includes(style)) {
        throw new Error(
          `Baby Name report requires choosing a style: ${BABY_NAME_STYLES.join(', ')}`,
        );
      }
      const kundli = await getKundliForUser(userId, profile.birthProfileId);
      if (!kundli || kundli.status !== 'ready') {
        throw new Error('Baby Name report requires a completed birth chart');
      }
      const chart = kundli.chartData;
      const planets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
      const moon = planets.find((p) => p.planet === 'Moon');
      if (!moon || moon.nakshatraIndex == null || moon.nakshatraPada == null) {
        throw new Error('Baby Name report requires Moon nakshatra/pada data');
      }
      const syllable = getNamingSyllable(Number(moon.nakshatraIndex), Number(moon.nakshatraPada));
      const { model, ...narrative } = await generateBabyNameReport({
        syllable,
        style,
        gender: profile.gender ?? null,
      });
      return { content: { syllable, style, ...narrative }, model };
    },
    async translate(content, language) {
      const c = content as unknown as { syllable: string; style: string } & BabyNameNarrative;
      const { syllable, style, ...narrative } = c;
      const translated = await translateBabyNameContent(narrative, language);
      return { syllable, style, ...translated };
    },
  },
  palm: {
    reportType: 'palm',
    title: 'Palm Reading',
    pricePaise: 2500,
    async generate(userId, profile, _period) {
      const photo = await findPendingPalmPhoto(userId, profile.birthProfileId);
      if (!photo) {
        throw new Error(
          'Upload a palm photo first via POST /v1/prime/palm/photo before unlocking this report',
        );
      }
      const { model, ...narrative } = await generatePalmReport({
        imageBase64: photo.imageBase64,
        mimeType: photo.mimeType,
      });
      // Consumed successfully — delete now rather than waiting for the 48h
      // cleanup window. (If markPrimeReportReady somehow fails right after
      // this returns, the photo is already gone and a retry would need a
      // fresh upload — an accepted, narrow edge case: a DB write failing
      // immediately after a successful read-and-delete is rare, and no
      // simpler alternative avoids it without meaningfully more complexity.)
      await deletePalmPhoto(photo.id);
      return { content: narrative, model };
    },
    async translate(content, language) {
      const translated = await translatePalmContent(content as unknown as PalmNarrative, language);
      return translated as unknown as Record<string, unknown>;
    },
  },
  kp: {
    reportType: 'kp',
    title: 'KP System Report',
    pricePaise: 4900,
    async generate(userId, profile, _period) {
      const kundli = await getKundliForUser(userId, profile.birthProfileId);
      if (!kundli || kundli.status !== 'ready') {
        throw new Error('KP System report requires a completed birth chart');
      }
      const significators = computeKpSignificators(kundli.chartData ?? null);
      if (significators.length === 0) {
        throw new Error('KP System report requires chart placement data');
      }
      const { model, ...content } = await generateKpReport({ significators });
      return { content, model };
    },
    async translate(content, language) {
      const translated = await translateKpContent(content as unknown as KpNarrative, language);
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
