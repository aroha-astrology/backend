// =============================================================================
// Wealth report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access.
// =============================================================================

import { analyzePlanetStrengths, type PlanetStrength } from '../gemstones.js';
import {
  getHouseLord,
  getHouseSign,
  getPlanetPosition,
  julianDayToDate,
  strengthOfPlanet,
  strengthScoreOfPlanet,
} from './chart-facts.js';
import { computeReportTimingWindows, type RankedWindow } from './report-timing.js';
import { computeAgeBandTable, type AgeBand } from './report-age-bands.js';
import { computeArchetype, type Archetype } from './report-archetype.js';
import { computeDecadeArc, type DecadeBand } from './report-decade-arc.js';
import { computeDoshaYogaSummary, type DoshaYogaSummary } from './report-dosha-yoga-summary.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

export type WealthPattern = 'steady_accumulation' | 'volatile_gains' | 'late_blooming';

export interface WealthScores extends Record<string, unknown> {
  /** Unweighted average of 2nd-lord, 11th-lord, and Jupiter strength scores (30/60/90 mapping). */
  wealthScore: number;
  secondLordStrength: PlanetStrength;
  eleventhLordStrength: PlanetStrength;
  jupiterStrength: PlanetStrength;
  jupiterHouse: number | undefined;
  wealthPattern: WealthPattern;
  /** Ranked wealth timing windows — domain 'wealth', from report-timing.ts. Empty (never
   * fabricated) when no favorable window was found. */
  windows: RankedWindow[];
  /** Where the `windows` above fall relative to the user's current age. Empty when the birth
   * date can't be recovered from the chart (missing/invalid julianDay). */
  ageBands: AgeBand[];
  /** "Money personality" archetype themed around the 2nd house sign — see
   * WEALTH_ARCHETYPE_LABEL/WEALTH_TRAIT_LABELS/WEALTH_TRAIT_SIGNIFICATORS below for the naming
   * and trait-significator reasoning. */
  moneyArchetype: Archetype;
  /** 3 forward-looking decade bands (Years 1-10/11-20/21-30), keyed to the 2nd/11th houses. */
  wealthArc: DecadeBand[];
  /** Kemdruma Dosha (prosperity-suppressing) cautions + Dhana-yoga positives. */
  doshaYoga: DoshaYogaSummary;
  /** 0-10. See computeSpendingVsSavingTilt for the exact formula. 0 = strongly
   * saving/accumulation-leaning, 10 = strongly spending/gains-leaning, 5 = balanced. */
  spendingVsSavingTilt: number;
}

/**
 * Documented rule: compare the 2nd-lord (accumulated/saved wealth) strength score against the
 * 11th-lord (income/gains) strength score.
 *   - 2nd notably stronger (diff >= 30, i.e. at least one full weak/average/strong tier ahead)
 *     => 'steady_accumulation' (wealth builds through saving/holding rather than big inflows).
 *   - 11th notably stronger (diff <= -30) => 'volatile_gains' (money arrives in bursts/gains
 *     rather than accumulating steadily).
 *   - Otherwise (roughly tied, |diff| < 30) => 'late_blooming' (no clear early pattern either
 *     way — framed in the narrative as a pattern that takes shape/strengthens later in life).
 * This intentionally does NOT factor in Jupiter's strength — Jupiter is a separate significator
 * surfaced on its own (jupiterStrength/jupiterHouse) and folded into the overall wealthScore, but
 * the steady-vs-volatile-vs-late-blooming SHAPE of the pattern is read purely from 2nd vs 11th.
 */
function wealthPatternFromLordScores(
  secondLordScore: number,
  eleventhLordScore: number,
): WealthPattern {
  const diff = secondLordScore - eleventhLordScore;
  if (diff >= 30) return 'steady_accumulation';
  if (diff <= -30) return 'volatile_gains';
  return 'late_blooming';
}

/**
 * Documented formula, mirroring true-love.ts's `computeLoveVsArrangedTilt` idiom exactly (same
 * inputs as `wealthPatternFromLordScores` above, just a continuous tilt instead of a 3-bucket
 * classification): compare "gains/spending-on-desires" signifiers (11th house lord — classically
 * the house of income, fulfilled desires, and money spent enjoying them) against
 * "saving/accumulation" signifiers (2nd house lord — classically the house of held/banked
 * wealth). `tilt = round(5 + (eleventhLordScore - secondLordScore) / 12)`, clamped to [0, 10]:
 *   - Both scores are each one of {30, 60, 90} (STRENGTH_SCORE), so their difference ranges over
 *     [-60, 60].
 *   - Dividing by 12 maps that range onto [-5, 5]; adding 5 recenters it onto [0, 10], with 5
 *     (both sides equal) as the exact neutral midpoint.
 * 0 = strongly saving/accumulation-leaning, 10 = strongly spending/gains-leaning (the first-named
 * quality in the field name, "spending", is what a HIGHER score means — same left-to-right
 * naming convention true-love.ts's loveVsArrangedTilt uses).
 */
function computeSpendingVsSavingTilt(secondLordScore: number, eleventhLordScore: number): number {
  const raw = 5 + (eleventhLordScore - secondLordScore) / 12;
  return Math.max(0, Math.min(10, Math.round(raw)));
}

/** Planets physically occupying a given house (whole-sign occupancy) — mirrors
 * chat-grounding.ts's own `houseOccupantsMap` construction (a fresh, local read of `chart.planets`,
 * not an import from that file, per this task's constraints). */
function occupantsOfHouse(houseNumber: number, chart: Record<string, unknown> | null): string[] {
  const planets = (chart?.planets ?? []) as { planet?: unknown; house?: unknown }[];
  return planets
    .filter((p) => p.house === houseNumber && typeof p.planet === 'string')
    .map((p) => p.planet as string);
}

/** Birth date recovered from `chart.julianDay`, or null if unavailable — never throws. Needed for
 * `ageBands` (computeAgeBandTable requires an actual birth Date, unlike the rest of this report's
 * inputs which only need the chart). */
function safeBirthDate(chart: Record<string, unknown> | null): Date | null {
  const julianDay = chart?.julianDay;
  return typeof julianDay === 'number' ? julianDayToDate(julianDay) : null;
}

/**
 * The money archetype's display NAME varies by the already-computed `wealthPattern`
 * classification, rather than inventing a second, independent naming rule — generic and
 * non-predictive (a personality-flavor label, not a claim about the person's actual life), same
 * discipline `computeArchetype`'s own doc comment describes for its `archetypeLabel` parameter.
 */
const WEALTH_ARCHETYPE_LABEL: Record<WealthPattern, string> = {
  steady_accumulation: 'The Steady Accumulator',
  volatile_gains: 'The Opportunistic Gainer',
  late_blooming: 'The Late Bloomer',
};

/**
 * Money-archetype trait significators — 5 wealth-relevant traits, each order-matched to ONE
 * classical planetary significator whose NATAL STRENGTH backs that trait's 0-10 tilt (see
 * `computeArchetype`'s scaling formula). Reasoning per trait:
 *   - Caution         -> Saturn  (classical karaka of restriction, fear, delay, and a careful,
 *                                 patient approach to risk).
 *   - Ambition         -> Mars    (classical karaka of drive, courage, and competitive initiative
 *                                 to go out and acquire).
 *   - Generosity       -> Jupiter (classical karaka of abundance, benevolence, and charitable
 *                                 expansiveness — Jupiter as "Guru" is the generous benefactor).
 *   - Discipline       -> Mercury (classical karaka of analytical, methodical thinking; Mercury
 *                                 also classically rules commerce/accounts — the discipline of
 *                                 systematic money tracking and planning).
 *   - Risk-tolerance   -> Rahu    (classical karaka of unconventional, speculative, extreme
 *                                 pursuit of material gain — classically the significator most
 *                                 associated with speculative/unconventional income).
 */
const WEALTH_TRAIT_LABELS: [string, string, string, string, string] = [
  'Caution',
  'Ambition',
  'Generosity',
  'Discipline',
  'Risk-tolerance',
];
const WEALTH_TRAIT_SIGNIFICATORS: [string, string, string, string, string] = [
  'Saturn',
  'Mars',
  'Jupiter',
  'Mercury',
  'Rahu',
];

export function computeWealthScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
): WealthScores {
  const chart = ctx.chart;
  const analyses = analyzePlanetStrengths(chart);
  const now = new Date();

  const secondLord = getHouseLord(2, chart);
  const secondLordStrength = secondLord ? strengthOfPlanet(secondLord, analyses) : 'average';
  const secondLordScore = secondLord ? strengthScoreOfPlanet(secondLord, analyses) : 60;

  const eleventhLord = getHouseLord(11, chart);
  const eleventhLordStrength = eleventhLord ? strengthOfPlanet(eleventhLord, analyses) : 'average';
  const eleventhLordScore = eleventhLord ? strengthScoreOfPlanet(eleventhLord, analyses) : 60;

  const jupiterStrength = strengthOfPlanet('Jupiter', analyses);
  const jupiterScore = strengthScoreOfPlanet('Jupiter', analyses);
  const jupiterHouse = getPlanetPosition('Jupiter', chart)?.house;

  const wealthScore = Math.round((secondLordScore + eleventhLordScore + jupiterScore) / 3);
  const wealthPattern = wealthPatternFromLordScores(secondLordScore, eleventhLordScore);

  // --- New enrichment blocks (shared report-timing/age-bands/archetype/decade-arc/dosha-yoga) ---

  // Significators mirror DOMAIN_CONFIG.wealth's own recipe (dasha-confidence.ts): natal houses
  // [2, 11] house-lord + occupants, plus the static karaka Jupiter — the exact same
  // house-lord/occupant merge chat-grounding.ts's significator-building loop performs per domain.
  const significatorLords = [
    ...new Set([
      ...(secondLord ? [secondLord] : []),
      ...occupantsOfHouse(2, chart),
      ...(eleventhLord ? [eleventhLord] : []),
      ...occupantsOfHouse(11, chart),
      'Jupiter',
    ]),
  ];
  const { windows } = computeReportTimingWindows(
    'wealth',
    significatorLords,
    ctx.dashaData ?? null,
    chart,
    now,
  );

  const birthDate = safeBirthDate(chart);
  const ageBands = birthDate ? computeAgeBandTable(birthDate, now, windows) : [];

  const secondHouseSign = getHouseSign(2, chart);
  const moneyArchetype = computeArchetype(
    secondHouseSign,
    WEALTH_ARCHETYPE_LABEL[wealthPattern],
    WEALTH_TRAIT_LABELS,
    WEALTH_TRAIT_SIGNIFICATORS,
    analyses,
  );

  const wealthArc = computeDecadeArc(chart, [2, 11], now);

  // Kemdruma Dosha (classically prosperity-suppressing) is directly on-theme but was previously
  // unused by this report; Dhana-yoga presence is a direct, currently-unused wealth signal.
  const doshaYoga = computeDoshaYogaSummary(
    ctx.doshaData ?? null,
    ctx.yogaData ?? null,
    ['kemDruma', 'guruChandal', 'kaalSarp', 'pitra'],
    ['dhana', 'raja', 'mahapurusha', 'lunar'],
  );

  const spendingVsSavingTilt = computeSpendingVsSavingTilt(secondLordScore, eleventhLordScore);

  return {
    wealthScore,
    secondLordStrength,
    eleventhLordStrength,
    jupiterStrength,
    jupiterHouse,
    wealthPattern,
    windows,
    ageBands,
    moneyArchetype,
    wealthArc,
    doshaYoga,
    spendingVsSavingTilt,
  };
}
