// =============================================================================
// Varshik Rashifal 2027 generator registration
// =============================================================================
// The one report that freezes its facts. Building them is a year of daily ephemeris (the two
// Varsha years, 365 sky positions, Saham windows, the sky events), far too much to redo on every
// page view, so:
//
//   prepareContext   builds the VarshikFacts once (generation, regeneration) and reads the
//                    reader's stored chat facts for this birth profile. A read-only DB lookup,
//                    which is allowed here because the read path never gets this far for a saved
//                    report (frozenScores answers first).
//   computeScores    pure: wraps the facts, plus a compact `verdictBrief` for the Final Verdict
//   generateNarrative  preflight first. A missing, NaN or out-of-range field throws
//                    ReportGenerationAbort: the row fails at once, the existing refund flow gives
//                    the money back, and the row's error names the fields. Then the 5 calls.
//   contentExtras / frozenScores   the facts are saved in `content.varshik` and served from there
// =============================================================================

import { calculateChart } from '../../../lib/astro-engine/calculations/planetPositions.js';
import { zoneOffsetMs } from '../../../lib/astro-engine/varshphal/calendar-year.js';
import type { CalendarYearInputs } from '../../../lib/astro-engine/varshphal/calendar-year.js';
import { buildVarshikContext } from '../../../lib/astro-engine/reports/varshik-context.js';
import { computeVarshikScores, type VarshikAnswers } from '../../../lib/astro-engine/reports/varshik-2027.js';
import {
  ANSWER_KEYS,
  VarshikFactsSchema,
  buildVarshikFacts,
  preflightVarshikFacts,
  type VarshikFacts,
} from '../../../lib/astro-engine/reports/varshik-facts.js';
import { MONTH_NAMES, TIER_MEANING } from '../../../lib/astro-engine/reports/varshik-labels.js';
import {
  generateVarshikNarrative,
  translateVarshikNarrative,
} from '../../../lib/llm/reports/varshik-2027.js';
import { logger } from '../../../lib/logger.js';
import { getUserFacts } from '../../astro/user-facts.repo.js';
import {
  ReportGenerationAbort,
  registerReportGenerator,
  type ReportGenerator,
  type ReportScoreContext,
  type ReportScores,
  type ReportSection,
  type SectionGenerationProgress,
} from '../report-generator.types.js';

const MAX_FACT_CHARS = 300;

/** The ten pre-purchase answers, as the scorer reads them. Unknown values are dropped. */
function answersFrom(raw: Record<string, string> | null | undefined): VarshikAnswers {
  const out: VarshikAnswers = {};
  for (const key of ANSWER_KEYS) {
    const v = raw?.[key];
    if (typeof v === 'string' && v.length > 0) out[key] = v;
  }
  return out;
}

/** A compact read of the year for the Final Verdict card: words only, no scores. */
function verdictBriefOf(f: VarshikFacts): Record<string, unknown> {
  return {
    year: 2027,
    overallTone: TIER_MEANING[f.scores.overall.tier],
    strongestMonths: f.scores.peakMonths.map((m) => MONTH_NAMES[m]),
    quietestMonth: MONTH_NAMES[f.scores.restMonth],
    months: f.scores.months.map((c, m) => ({ month: MONTH_NAMES[m], tone: TIER_MEANING[c.tier] })),
    bestWindows: Object.entries(f.scores.answerWindows)
      .filter(([, w]) => !w.weak)
      .slice(0, 7)
      .map(([key, w]) => ({ for: key, from: w.best.fromDate, to: w.best.toDate })),
    yearLord: f.varsha[f.varsha.length - 1]!.yearLord,
  };
}

export interface ReaderInput {
  name: string | null;
  birthDate: string; // YYYY-MM-DD
  birthTime: string; // HH:MM
  place: { lat: number; lon: number; tz: string };
  answers: VarshikAnswers;
  /** The reader's stored chat facts for this birth profile; may be empty. */
  facts: string[];
  /** Where the reader lives now (account owner only), for eclipse visibility; null = India summary. Never the birth place. */
  currentPlace?: { name: string; lat: number; lon: number; tz: string } | null;
  /** The calendar year the report reads. 2027 for a purchase; a dev-only test may ask for another (the owner's 2026 accuracy test). */
  year?: number;
}

/**
 * Casts the natal chart again on the Lahiri ayanamsa the Varsha engine is built on, builds the
 * two Varsha years and the daily sky for 2027, scores them and assembles VarshikFacts. Exported so
 * the test-report script and the specs build the facts exactly the way a purchase does.
 */
export async function buildVarshikFactsForReader(reader: ReaderInput): Promise<VarshikFacts> {
  const { place } = reader;
  const [y, mo, d] = reader.birthDate.split('-').map(Number) as [number, number, number];
  const [h, mi] = reader.birthTime.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - zoneOffsetMs(wall, place.tz);
  utc = wall - zoneOffsetMs(utc, place.tz);
  const natal = await calculateChart(y, mo, d, h, mi, (wall - utc) / 3_600_000, place.lat, place.lon, 'lahiri', 'W');
  const sun = natal.planets.find((p) => p.planet === 'Sun')!;
  const moon = natal.planets.find((p) => p.planet === 'Moon')!;
  const inputs: CalendarYearInputs = {
    natalSunLongitude: sun.longitude,
    natalAscSignIndex: natal.ascendant.signIndex,
    birthDate: new Date(utc),
    birthNakshatraIndex: moon.nakshatraIndex,
    latitude: place.lat,
    longitude: place.lon,
    timezone: place.tz,
  };
  const vctx = await buildVarshikContext({ inputs, natal, year: reader.year ?? 2027 });
  const scores = computeVarshikScores(vctx, reader.answers);
  return buildVarshikFacts({
    ctx: vctx,
    natal,
    scores,
    reader: {
      name: reader.name,
      birthDate: reader.birthDate,
      birthTime: reader.birthTime.slice(0, 5),
      timezone: place.tz,
      lat: place.lat,
      lng: place.lon,
      answers: reader.answers,
      facts: reader.facts.map((fact) => ({ fact })),
      currentPlace: reader.currentPlace ?? null,
    },
  });
}

const varshikGenerator: ReportGenerator = {
  key: 'varshik_rashifal_2027',
  ownsClaimCheck: true,

  async prepareContext(ctx: ReportScoreContext): Promise<ReportScoreContext> {
    try {
      const place = ctx.personBirthPlace;
      const dob = ctx.personDob;
      const time = ctx.personTimeOfBirth;
      const missing = [
        !place && 'birth place',
        !dob && 'date of birth',
        !time && 'time of birth',
      ].filter(Boolean);
      if (missing.length > 0 || !place || !dob || !time) {
        return { ...ctx, varshikFacts: null, varshikBuildError: `missing: ${missing.join(', ')}` };
      }

      const answers = answersFrom(ctx.userAnswers);

      // The reader's own stored facts for THIS birth profile; may be empty.
      const stored = ctx.userId ? await getUserFacts(ctx.userId, ctx.birthProfileId ?? null) : [];
      const readerFacts = stored
        .map((x) => x.fact.trim().slice(0, MAX_FACT_CHARS))
        .filter((x) => x.length > 0);

      const facts = await buildVarshikFactsForReader({
        name: ctx.personName ?? null,
        birthDate: dob,
        birthTime: time,
        place,
        currentPlace: ctx.personCurrentPlace ?? null,
        answers,
        facts: readerFacts,
      });
      return { ...ctx, varshikFacts: facts as unknown as Record<string, unknown>, varshikBuildError: null };
    } catch (err) {
      logger.warn({ err }, 'varshik_rashifal_2027: building the facts failed');
      return {
        ...ctx,
        varshikFacts: null,
        varshikBuildError: err instanceof Error ? err.message.slice(0, 300) : 'unknown error',
      };
    }
  },

  computeScores(ctx: ReportScoreContext): ReportScores {
    const facts = ctx.varshikFacts as unknown as VarshikFacts | null | undefined;
    if (!facts) return { varshikError: ctx.varshikBuildError ?? 'facts were not built' };
    return { varshik: facts, verdictBrief: verdictBriefOf(facts) };
  },

  async generateNarrative(
    scores: ReportScores,
    _language: 'en',
    progress?: SectionGenerationProgress,
  ): Promise<ReportSection[]> {
    // The completeness contract: the facts are validated BEFORE any text is written.
    const preflight = preflightVarshikFacts(scores.varshik);
    if (!preflight.ok) {
      const failures =
        scores.varshik === undefined
          ? [`facts: ${String(scores.varshikError ?? 'missing')}`]
          : preflight.failures;
      logger.error({ failures }, 'varshik_rashifal_2027: preflight failed, no text written');
      throw new ReportGenerationAbort(`varshik preflight failed: ${failures.slice(0, 8).join('; ')}`.slice(0, 480));
    }
    const facts = VarshikFactsSchema.parse(scores.varshik);
    const narrative = await generateVarshikNarrative(facts, progress);
    // The admin log: AI tells that survived the one regenerate. generateNarrative cannot return
    // them, so they ride on the scores object the service hands on to contentExtras.
    (scores as Record<string, unknown>).textFlags = narrative.flags;
    if (narrative.flags.length > 0) {
      logger.warn({ flags: narrative.flags.slice(0, 20) }, 'varshik_rashifal_2027: text flags');
    }
    return narrative.sections;
  },

  async translateNarrative(sections: ReportSection[], language: string): Promise<ReportSection[]> {
    return translateVarshikNarrative(sections, language);
  },

  contentExtras(scores: ReportScores): Record<string, unknown> | null {
    if (!scores.varshik) return null;
    const flags = (scores.textFlags as unknown[] | undefined) ?? [];
    return { varshik: scores.varshik, ...(flags.length > 0 ? { textFlags: flags } : {}) };
  },

  frozenScores(content: unknown): ReportScores | null {
    const saved = (content as { varshik?: VarshikFacts } | null)?.varshik;
    if (!saved) return null;
    return { varshik: saved, verdictBrief: verdictBriefOf(saved) };
  },
};

registerReportGenerator(varshikGenerator);

export { varshikGenerator };
