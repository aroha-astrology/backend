// =============================================================================
// Career (monthly) report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access. See
// monthly-dasha-context.ts for the shared dasha-resolution + scoring formula
// this and the other 3 monthly reports are built on.
// =============================================================================

import { analyzePlanetStrengths } from '../gemstones.js';
import { getAscendantSignIndex, getHouseLord, getHouseSign } from './chart-facts.js';
import {
  computeMonthlyReportScore,
  findMonthSubPeriods,
  safelyResolveActivePeriod,
  toneFromMonthScore,
  type MonthlyTone,
  type MonthSubPeriod,
} from './monthly-dasha-context.js';
import { computeArchetype, type Archetype } from './report-archetype.js';
import { computeDoshaYogaSummary, type DoshaYogaSummary } from './report-dosha-yoga-summary.js';
import { computeLifeContext, CAREER_KEY_HOUSES } from './report-life-context.js';
import { buildReportHeader } from './report-header.js';
import { computeReportVargas } from './report-vargas.js';
import { ashtakavargaFacts } from '../../chat-grounding.js';
import type { ReportSharedFacts } from './report-shared-facts.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

/** 10th house = career/public status, 6th house = daily work/service — imported from
 * report-life-context.ts (single source of truth) rather than declared here, to avoid a
 * circular import (that module also imports `computeLifeContext` used below). */
const KEY_HOUSES = CAREER_KEY_HOUSES;

// =============================================================================
// industryFit — deterministic (non-LLM) 10th-house-lord -> industry lookup
// =============================================================================
// Keyed by the PLANET that lords the 10th house (not its sign) — the classical
// significator of "what kind of work" a chart favors. Values are classical
// karakatva (natural significations) of each of the 7 grahas, applied to
// career/industry framing:
//   Sun     = authority, status, government service, command roles
//   Moon    = the public, care/nurture, anything mind- or audience-facing
//   Mars    = courage, technical action, physical risk/precision work
//   Mercury = intellect, commerce, communication, analysis
//   Jupiter = wisdom, counsel, teaching, law, and financial judgment
//   Venus   = beauty, harmony, comfort, and refined/creative goods
//   Saturn  = endurance, structure, long-horizon and large-scale labor
// Rahu and Ketu are shadow/node points, not among the 7 classical grahas with
// a fixed karakatva of their own — included anyway, per commonly-cited modern
// Vedic career-astrology usage (Rahu's association with foreignness, novelty,
// and mass communication; Ketu's association with detachment, deep research
// focus, and the occult/scientific fringe), and EXPLICITLY labeled as an
// unconventional pairing in the returned `note` so this doesn't read as
// classical certainty it isn't.
// =============================================================================
const INDUSTRY_FIT_BY_PLANET: Record<string, string[]> = {
  Sun: ['leadership roles', 'government', 'management'],
  Moon: ['public-facing work', 'hospitality', 'caregiving professions'],
  Mars: ['engineering', 'defense', 'sports', 'surgery'],
  Mercury: ['communication', 'writing', 'trade', 'analytics'],
  Jupiter: ['education', 'law', 'consulting', 'finance'],
  Venus: ['arts', 'design', 'hospitality', 'luxury goods'],
  Saturn: ['long-term/structural work', 'administration', 'mining', 'real estate'],
  Rahu: ['technology', 'foreign trade', 'mass media'],
  Ketu: ['research', 'spirituality/mysticism', 'niche technical specialization'],
};

const NODE_PLANETS = new Set(['Rahu', 'Ketu']);

export interface IndustryFit {
  likelyIndustries: string[];
  note: string;
}

/** Never throws — degrades to an empty list with an explanatory note when the chart lacks
 * house-lord data or the lord isn't one of the 9 catalogued planets. */
function industryFitForTenthLord(tenthLordPlanet: string | undefined): IndustryFit {
  if (!tenthLordPlanet) {
    return { likelyIndustries: [], note: '10th-house lord is unavailable on this chart.' };
  }
  const likelyIndustries = INDUSTRY_FIT_BY_PLANET[tenthLordPlanet];
  if (!likelyIndustries) {
    return {
      likelyIndustries: [],
      note: `No classical industry association is catalogued for ${tenthLordPlanet}.`,
    };
  }
  const note = NODE_PLANETS.has(tenthLordPlanet)
    ? `Unconventional pairing: ${tenthLordPlanet} (10th-house lord) has no fixed classical karakatva of its own, but is commonly associated with these fields in modern Vedic career astrology.`
    : `Classical industry associations for the 10th-house lord, ${tenthLordPlanet}.`;
  return { likelyIndustries: [...likelyIndustries], note };
}

export interface CareerMonthlyScores extends Record<string, unknown>, ReportSharedFacts {
  periodMonth: string;
  activeMahadashaLord: string;
  activeAntardashaLord: string;
  monthScore: number;
  keyHouses: number[];
  tone: MonthlyTone;
  workArchetype: Archetype;
  doshaYoga: DoshaYogaSummary;
  industryFit: IndustryFit;
  /** Within-month Pratyantardasha slices, each independently scored — answers "are there
   * specific dates this month best for important career moves." Empty when periodMonth/chart
   * data isn't usable (never throws). */
  subPeriods: MonthSubPeriod[];
}

export function computeCareerMonthlyScores(
  ctx: ReportScoreContext,
  periodMonth: string | null,
): CareerMonthlyScores {
  const chart = ctx.chart;
  const analyses = analyzePlanetStrengths(chart);
  const period = safelyResolveActivePeriod(chart, periodMonth);

  const monthScore = period
    ? computeMonthlyReportScore(period.antardashaLord, KEY_HOUSES, chart, analyses)
    : 50;

  // Trait-significator mapping (classical karakatva, ORDER-MATCHED to the trait labels below):
  // Discipline <- Saturn (karaka of karma/service and sustained, structured effort), Ambition
  // <- Sun (karaka of status, authority, and drive for position), Creativity <- Venus (karaka
  // of the arts and aesthetic/creative expression), Risk-tolerance <- Mars (karaka of courage,
  // initiative, and competitive action), Collaboration <- Mercury (karaka of communication and
  // exchange — the basis of working productively with others).
  const workArchetype = computeArchetype(
    getHouseSign(10, chart),
    'Work Style Archetype',
    ['Discipline', 'Ambition', 'Creativity', 'Risk-tolerance', 'Collaboration'],
    ['Saturn', 'Sun', 'Venus', 'Mars', 'Mercury'],
    analyses,
  );

  const doshaYoga = computeDoshaYogaSummary(
    ctx.doshaData ?? null,
    ctx.yogaData ?? null,
    ['sadeSati', 'kaalSarp'],
    ['raja', 'mahapurusha'],
  );

  const industryFit = industryFitForTenthLord(getHouseLord(10, chart));
  const subPeriods = findMonthSubPeriods(chart, periodMonth, KEY_HOUSES, analyses);

  const lifeContext = computeLifeContext(chart, analyses, ctx.dashaData ?? null, new Date());
  const header = buildReportHeader(chart, ctx.personName, ctx.personDob, lifeContext);
  // Dashamsha (D10) — the classical career/profession/public-status chart.
  const vargas = computeReportVargas(chart, ['D10']);
  const ashtakavargaSummary = ashtakavargaFacts(
    ctx.ashtakavargaData ?? null,
    getAscendantSignIndex(chart),
  );

  return {
    header,
    lifeContext,
    vargas,
    ashtakavargaSummary,
    userAnswers: ctx.userAnswers ?? null,
    periodMonth: periodMonth ?? 'unknown',
    activeMahadashaLord: period?.mahadashaLord ?? 'Unknown',
    activeAntardashaLord: period?.antardashaLord ?? 'Unknown',
    monthScore,
    keyHouses: KEY_HOUSES,
    tone: toneFromMonthScore(monthScore),
    workArchetype,
    doshaYoga,
    industryFit,
    subPeriods,
  };
}
