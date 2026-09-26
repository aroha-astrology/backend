// =============================================================================
// KP Year Ahead report generator registration
// =============================================================================
// The one report whose facts need ephemeris work the stored kundli can't
// supply (KP ayanamsa + Placidus cusps + a year of transits), done in the
// `prepareContext` hook so `computeScores` stays pure — see
// astro-engine/kp/kp-chart.ts and astro-engine/reports/kp-annual.ts.
// =============================================================================

import { computeKpRawData } from '../../../lib/astro-engine/kp/kp-chart.js';
import {
  computeKpAnnualScores,
  type KpAnnualScores,
} from '../../../lib/astro-engine/reports/kp-annual.js';
import {
  generateKpAnnualNarrative,
  translateKpAnnualNarrative,
} from '../../../lib/llm/reports/kp-annual.js';
import { logger } from '../../../lib/logger.js';
import {
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
  type SectionGenerationProgress,
} from '../report-generator.types.js';

const kpAnnualGenerator: ReportGenerator = {
  key: 'kp_annual',
  async prepareContext(
    ctx: ReportScoreContext,
    periodMonth: string | null,
  ): Promise<ReportScoreContext> {
    const birthJd = (ctx.chart as { julianDay?: unknown } | null)?.julianDay;
    const place = ctx.personBirthPlace;
    if (typeof birthJd !== 'number' || !place) return { ...ctx, kpRaw: null };
    try {
      const kpRaw = await computeKpRawData({
        birthJd,
        latitude: place.lat,
        longitude: place.lon,
        start: periodMonth ?? new Date().toISOString().slice(0, 10),
      });
      return { ...ctx, kpRaw };
    } catch (err) {
      // Degrades to empty scores; generateNarrative then throws so the queue retries.
      logger.warn({ err }, 'kp_annual: KP chart computation failed');
      return { ...ctx, kpRaw: null };
    }
  },
  computeScores(ctx: ReportScoreContext, periodMonth: string | null): ReportScores {
    return computeKpAnnualScores(ctx, periodMonth) as unknown as ReportScores;
  },
  async generateNarrative(
    scores: ReportScores,
    _language: 'en',
    progress?: SectionGenerationProgress,
  ): Promise<ReportSection[]> {
    return generateKpAnnualNarrative(scores as unknown as KpAnnualScores, progress);
  },
  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateKpAnnualNarrative(sections, language);
  },
};

registerReportGenerator(kpAnnualGenerator);

export { kpAnnualGenerator };
