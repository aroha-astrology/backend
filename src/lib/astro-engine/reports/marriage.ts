// =============================================================================
// Marriage report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access — called both at
// generation time (to ground the narrative prompt) and at every read (to
// merge fresh scores into the cached narrative, same policy as
// gemstone's buildDeterministicGems / kundli-milan's computeKundliMilanScores).
//
// Timing windows below now go through the SAME shared search
// (report-timing.ts -> dasha-confidence.ts's scoreDomainWindows) that the AI
// chat feature's grounding layer already uses for its own "when will X
// happen" facts. This report used to run its own bespoke, shallower search
// (Antardasha-only, a fixed 3-planet significator set) which could — and did
// — disagree with what chat told the very same user about the very same
// chart: chat reaches Pratyantardasha depth (recurs every ~9 months), so a
// near-term Pratyantardasha match can exist well before the coarser
// Antardasha level ever rotates onto a significator. See report-timing.ts's
// own module doc comment for the full rationale, and chat-grounding.ts's
// per-domain significator-building loop for the exact recipe replicated in
// `buildPrimarySignificators` below.
// =============================================================================

import { analyzePlanetStrengths, type PlanetAnalysis, type PlanetStrength } from '../gemstones.js';
import { detectMangalDosha } from '../doshas/mangalDosha.js';
import {
  getAscendantSignIndex,
  getHouseLord,
  getHouseSign,
  getPlanetPosition,
  julianDayToDate,
  strengthOfPlanet,
  strengthScoreOfPlanet,
} from './chart-facts.js';
import { computeArchetype, SIGN_TEMPERAMENT, type Archetype } from './report-archetype.js';
import { computeReportTimingWindows, type RankedWindow } from './report-timing.js';
import { computeAgeBandTable, type AgeBand } from './report-age-bands.js';
import { computeDecadeArc, type DecadeBand } from './report-decade-arc.js';
import { computeDoshaYogaSummary, type DoshaYogaSummary } from './report-dosha-yoga-summary.js';
import { computeLifeContext } from './report-life-context.js';
import { buildReportHeader } from './report-header.js';
import { buildReportRemedies } from './report-remedy-slots.js';
import { computeReportVargas } from './report-vargas.js';
import { ashtakavargaFacts } from '../../chat-grounding.js';
import type { ReportSharedFactsWithRemedies } from './report-shared-facts.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

export type MarriageBand = 'slow_build' | 'steady' | 'accelerated';

export interface MarriageScores extends Record<string, unknown>, ReportSharedFactsWithRemedies {
  marriageScore: number;
  band: MarriageBand;
  manglik: { isManglik: boolean; cancelled: boolean };
  seventhLord: string | undefined;
  seventhLordStrength: PlanetStrength;
  venusStrength: PlanetStrength;
  venusHouse: number | undefined;
  jupiterStrength: PlanetStrength;
  jupiterHouse: number | undefined;
  seventhHouseSign: string | undefined;
  /** Classical sign-quality lore for the 7th house sign, e.g. "direct, driven" for Aries —
   * hardcoded, deliberately generic (not fabricated specificity about "who you will marry"). */
  seventhHouseTemperament: string;
  fourthLordStrength: PlanetStrength;

  /** Primary, headline timing search — SAME significator recipe as chat's 'love' domain
   * (7th-house-lord + 7th-house occupants + Venus, via DOMAIN_CONFIG.love), so this can never
   * independently disagree with what chat tells the same user. Empty array (not a fabricated
   * guess) when nothing qualifies. */
  windows: RankedWindow[];
  /** Jupiter's own Mahadasha/Antardasha/Pratyantardasha window(s) — SEPARATE, supplementary,
   * marriage/dharma-karaka-specific color. Never merged into `windows` — this is what lets the
   * report keep its "Jupiter matters for marriage" classical angle without creating a second,
   * disagreeing headline answer. Null if none found. */
  jupiterDharmaWindow: { startDate: string; endDate: string } | null;
  /** Age-band probability table built from `windows` (the primary search only, not
   * jupiterDharmaWindow) — see report-age-bands.ts. Empty array if birth date is undecodable
   * from the chart (missing julianDay). */
  ageBands: AgeBand[];

  /** Why the 7th-lord/Venus/Jupiter are weak/strong — the `reason` string analyzePlanetStrengths
   * already computes (e.g. "Debilitated in Pisces", "Exalted", "Combust") but which this report
   * discarded until now, keeping only the weak/average/strong label. */
  seventhLordReason: string;
  venusReason: string;
  jupiterReason: string;
  doshaYoga: DoshaYogaSummary;
  partnerArchetype: Archetype;
  marriageQualityArc: DecadeBand[];

  /** The person's own current relationship status (users.relationship_status), passed straight
   * through from ctx.personRelationshipStatus — lets the narrative module distinguish "when will
   * I get married" framing (single/in_relationship/engaged) from "understand/strengthen an
   * existing marriage" framing (married/divorced/widowed) instead of always assuming the former.
   * Optional (not required) for the same additive-only reason ctx.personRelationshipStatus itself
   * is optional on ReportScoreContext — existing test fixtures construct MarriageScores without it. */
  relationshipStatus?: string | null;

  /** Bespoke marriage panel — pure fact, no LLM call, built here from the same 4th-lord strength
   * already computed above; the narrative module writes prose around this. */
  inLaws: { fourthHouseSign: string | undefined; note: string };
  moneyAfterMarriage: {
    secondHouseSign: string | undefined;
    eleventhHouseSign: string | undefined;
    note: string;
  };
  modernRealities: {
    /** True if every band before the final "+open-ended" one is NONE/LOW and the final band is
     * MEDIUM/HIGH — i.e. this chart's own timing data genuinely skews to a later marriage age,
     * not an arbitrary claim. */
    lateMarriageLeaning: boolean;
    /** Rahu's own natal house number (whichever house it occupies) — used narratively as a
     * classical "distance/foreign-connection" flavor signal, framed as tendency not prediction. */
    rahuHouse: number | undefined;
    /** Count of natal planets (from chart.planets) physically occupying the 7th house — more
     * than 2 is classically read as a busier/more complex marriage-house signature. */
    seventhHousePlanetCount: number;
  };
}

// SIGN_TEMPERAMENT (classical sign-quality lore for the 7th house sign — deliberately
// generic, labeled in the narrative prompt as "classical sign-quality lore, not fabricated
// specificity about a real person") now lives in report-archetype.ts, shared by every report
// type that wants the same "sign -> temperament flavor" primitive. Imported above.

/**
 * Documented weighting: simple unweighted average of the 7th-lord, Venus, and Jupiter strength
 * scores (each mapped weak=30/average=60/strong=90 via chart-facts.ts's STRENGTH_SCORE) — these
 * three are the classical marriage/spouse significators (7th lord = the house of partnership
 * itself; Venus = romantic/relational significator; Jupiter = husband/dharma significator used
 * for both genders in this app's single unified reading). No planet is weighted more than
 * another; a future refinement could weight the 7th lord higher, but an unweighted average is
 * the simplest transparent starting point and is what this report ships with.
 */
function computeMarriageScore(
  seventhLordScore: number,
  venusScore: number,
  jupiterScore: number,
): number {
  return Math.round((seventhLordScore + venusScore + jupiterScore) / 3);
}

/** <40 slow_build, 40-70 steady (inclusive both ends), >70 accelerated. */
function bandFromScore(score: number): MarriageBand {
  if (score < 40) return 'slow_build';
  if (score <= 70) return 'steady';
  return 'accelerated';
}

/** Planets (by name) natally occupying `houseNumber`, whole-sign-house basis. */
function planetsInHouse(houseNumber: number, chart: Record<string, unknown> | null): string[] {
  const planets = ((chart?.planets ?? []) as Array<{ planet: string; house?: number }>) || [];
  return planets.filter((p) => p.house === houseNumber).map((p) => p.planet);
}

/** `analyzePlanetStrengths`'s own `reason` string for a planet (e.g. "Debilitated in Pisces"),
 * defaulting to a plain unavailable message when the planet/lord itself couldn't be determined. */
function reasonForPlanet(planetName: string | undefined, analyses: PlanetAnalysis[]): string {
  if (!planetName) return 'Unavailable — this lord could not be determined from the chart.';
  return analyses.find((a) => a.planet === planetName)?.reason ?? 'Reason unavailable.';
}

/**
 * Same significator recipe chat-grounding.ts builds for its 'love' domain (see that file's
 * per-domain loop merging `DOMAIN_CONFIG[domain].staticKarakas` with house-lord/occupants, and
 * DOMAIN_CONFIG.love in dasha-confidence.ts): the 7th house's lord + whatever planets natally
 * occupy the 7th house + Venus (love's static karaka). Using the IDENTICAL recipe here — not a
 * lookalike — is the actual fix for the report/chat disagreement: both features now search the
 * same significator set, at the same (Pratyantardasha) depth, via the same function.
 */
function buildPrimarySignificators(
  seventhLord: string | undefined,
  chart: Record<string, unknown> | null,
): string[] {
  const lords = seventhLord ? [seventhLord] : [];
  const occupants = planetsInHouse(7, chart);
  return [...new Set([...lords, ...occupants, 'Venus'])];
}

/** Pure, deterministic "Family & In-Laws" fact — no LLM call. */
function buildInLawsNote(
  fourthHouseSign: string | undefined,
  fourthLordStrength: PlanetStrength,
): string {
  const signPart = fourthHouseSign
    ? `The 4th house (home and family) falls in ${fourthHouseSign}`
    : 'The 4th house sign is unavailable on this chart';
  const strengthPart =
    fourthLordStrength === 'strong'
      ? 'its lord is classically strong, favoring smoother in-law and home-life integration'
      : fourthLordStrength === 'weak'
        ? 'its lord is classically weak, calling for more patience and deliberate effort in family/in-law integration'
        : 'its lord is classically average — a typical, unremarkable path with in-laws';
  return `${signPart}, and ${strengthPart}.`;
}

/** Pure, deterministic "Money After Marriage" fact — no LLM call. */
function buildMoneyNote(
  secondHouseSign: string | undefined,
  eleventhHouseSign: string | undefined,
): string {
  const secondPart = secondHouseSign
    ? `The 2nd house (accumulated/family wealth) is in ${secondHouseSign}`
    : 'The 2nd house sign is unavailable';
  const eleventhPart = eleventhHouseSign
    ? `the 11th house (gains and income) is in ${eleventhHouseSign}`
    : 'the 11th house sign is unavailable';
  return `${secondPart}, and ${eleventhPart} — together the classical signature for how finances are read to shift after marriage.`;
}

const AGE_BAND_RANK: Record<AgeBand['confidence'], number> = {
  NONE: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

/**
 * True only if every age band BEFORE the final open-ended one is NONE/LOW confidence AND the
 * final band is MEDIUM/HIGH — i.e. this chart's own timing data genuinely skews to a later
 * marriage age, not an arbitrary claim. Never throws: fewer than 2 bands (e.g. ageBands === [],
 * undecodable birth date) yields false rather than a spurious true.
 */
function computeLateMarriageLeaning(ageBands: AgeBand[]): boolean {
  if (ageBands.length < 2) return false;
  const finalBand = ageBands[ageBands.length - 1]!;
  const earlierBands = ageBands.slice(0, -1);
  const earlierAllWeak = earlierBands.every(
    (b) => AGE_BAND_RANK[b.confidence] <= AGE_BAND_RANK.LOW,
  );
  const finalIsStrongest = AGE_BAND_RANK[finalBand.confidence] >= AGE_BAND_RANK.MEDIUM;
  return earlierAllWeak && finalIsStrongest;
}

export function computeMarriageScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
): MarriageScores {
  const chart = ctx.chart;
  const now = new Date();

  const analyses = analyzePlanetStrengths(chart);
  const seventhLord = getHouseLord(7, chart);
  const seventhLordStrength = seventhLord ? strengthOfPlanet(seventhLord, analyses) : 'average';
  const seventhLordScore = seventhLord ? strengthScoreOfPlanet(seventhLord, analyses) : 60;
  const seventhLordReason = reasonForPlanet(seventhLord, analyses);

  const venusStrength = strengthOfPlanet('Venus', analyses);
  const venusScore = strengthScoreOfPlanet('Venus', analyses);
  const venusHouse = getPlanetPosition('Venus', chart)?.house;
  const venusReason = reasonForPlanet('Venus', analyses);

  const jupiterStrength = strengthOfPlanet('Jupiter', analyses);
  const jupiterScore = strengthScoreOfPlanet('Jupiter', analyses);
  const jupiterHouse = getPlanetPosition('Jupiter', chart)?.house;
  const jupiterReason = reasonForPlanet('Jupiter', analyses);

  const marriageScore = computeMarriageScore(seventhLordScore, venusScore, jupiterScore);
  const band = bandFromScore(marriageScore);

  const mangal = chart
    ? detectMangalDosha(chart as unknown as Parameters<typeof detectMangalDosha>[0])
    : null;
  const manglik = {
    isManglik: mangal?.present ?? false,
    cancelled: mangal?.type === 'cancelled',
  };

  const seventhHouseSign = getHouseSign(7, chart);
  const seventhHouseTemperament = seventhHouseSign
    ? (SIGN_TEMPERAMENT[seventhHouseSign] ?? "a distinct temperament shaped by this house's sign")
    : 'unknown — 7th house sign unavailable';

  const fourthLord = getHouseLord(4, chart);
  const fourthLordStrength = fourthLord ? strengthOfPlanet(fourthLord, analyses) : 'average';

  // --- Primary timing search: SAME significator recipe + SAME shared search chat's 'love'
  // domain uses (see buildPrimarySignificators above and report-timing.ts's own doc comment). ---
  const significatorLords = buildPrimarySignificators(seventhLord, chart);
  const timingResult = computeReportTimingWindows(
    'love',
    significatorLords,
    ctx.dashaData ?? null,
    chart,
    now,
  );
  const windows = timingResult.windows;

  // --- Jupiter's own separate window: supplementary dharma/marriage-karaka color, kept OUT of
  // `windows` so it can never create a second, disagreeing headline timing answer. Reuses the
  // exact same shared search machinery with Jupiter as the sole significator, rather than
  // inventing a second bespoke search function. ---
  const jupiterTimingResult = computeReportTimingWindows(
    'love',
    ['Jupiter'],
    ctx.dashaData ?? null,
    chart,
    now,
  );
  const jupiterDharmaWindow = jupiterTimingResult.windows[0]
    ? {
        startDate: jupiterTimingResult.windows[0].startDate,
        endDate: jupiterTimingResult.windows[0].endDate,
      }
    : null;

  // --- Age-band table: needs a birth date, recovered from chart.julianDay (same pattern
  // chart-facts.ts's getVimshottariDashaFromChart uses) — [] if undecodable, never throws. ---
  const julianDay = chart?.julianDay;
  const ageBands =
    typeof julianDay === 'number'
      ? computeAgeBandTable(julianDayToDate(julianDay), now, windows)
      : [];

  const doshaYoga = computeDoshaYogaSummary(
    ctx.doshaData ?? null,
    ctx.yogaData ?? null,
    ['mangal', 'kaalSarp', 'sadeSati', 'guruChandal'],
    ['raja', 'dhana', 'mahapurusha'],
  );

  // Trait-significator mapping (classical, documented, order-matched to traitLabels below):
  // Warmth <- Moon (mind/emotional nurturing), Discipline <- Saturn (commitment, structure,
  // endurance), Intellect <- Mercury (communication and reasoning), Sensuality <- Venus
  // (romantic/sensual connection — also this domain's own primary karaka), Ambition <- Mars
  // (drive and initiative).
  const partnerArchetype = computeArchetype(
    seventhHouseSign,
    'Partnership Archetype',
    ['Warmth', 'Discipline', 'Intellect', 'Sensuality', 'Ambition'],
    ['Moon', 'Saturn', 'Mercury', 'Venus', 'Mars'],
    analyses,
  );

  const marriageQualityArc = computeDecadeArc(chart, [7], now);

  const fourthHouseSign = getHouseSign(4, chart);
  const inLaws = {
    fourthHouseSign,
    note: buildInLawsNote(fourthHouseSign, fourthLordStrength),
  };

  const secondHouseSign = getHouseSign(2, chart);
  const eleventhHouseSign = getHouseSign(11, chart);
  const moneyAfterMarriage = {
    secondHouseSign,
    eleventhHouseSign,
    note: buildMoneyNote(secondHouseSign, eleventhHouseSign),
  };

  const modernRealities = {
    lateMarriageLeaning: computeLateMarriageLeaning(ageBands),
    rahuHouse: getPlanetPosition('Rahu', chart)?.house,
    seventhHousePlanetCount: planetsInHouse(7, chart).length,
  };

  const lifeContext = computeLifeContext(chart, analyses, ctx.dashaData ?? null, now);
  const header = buildReportHeader(chart, ctx.personName, ctx.personDob, lifeContext);
  const planetRemedies = buildReportRemedies('marriage', chart);
  // Navamsa (D9) — the classical marriage/spouse/dharma chart, the same varga chat-grounding.ts
  // surfaces to the AI chat feature for this exact chart (see VARGA_LABELS.D9 there).
  const vargas = computeReportVargas(chart, ['D9']);
  // Ashtakavarga house-strength summary — same function chat-grounding.ts already uses for this
  // exact chart, never previously read by any report generator despite ctx.ashtakavargaData being
  // passed into every ReportScoreContext already.
  const ashtakavargaSummary = ashtakavargaFacts(
    ctx.ashtakavargaData ?? null,
    getAscendantSignIndex(chart),
  );

  return {
    header,
    lifeContext,
    planetRemedies,
    vargas,
    ashtakavargaSummary,
    marriageScore,
    band,
    manglik,
    seventhLord,
    seventhLordStrength,
    venusStrength,
    venusHouse,
    jupiterStrength,
    jupiterHouse,
    seventhHouseSign,
    seventhHouseTemperament,
    fourthLordStrength,
    windows,
    jupiterDharmaWindow,
    ageBands,
    seventhLordReason,
    venusReason,
    jupiterReason,
    doshaYoga,
    partnerArchetype,
    marriageQualityArc,
    relationshipStatus: ctx.personRelationshipStatus ?? null,
    inLaws,
    moneyAfterMarriage,
    modernRealities,
  };
}
