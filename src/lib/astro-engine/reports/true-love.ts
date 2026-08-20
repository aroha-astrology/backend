// =============================================================================
// True Love report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access.
// =============================================================================

import { analyzePlanetStrengths } from '../gemstones.js';
import {
  getHouseLord,
  getHouseSign,
  isPlanetInHouse,
  julianDayToDate,
  strengthScoreOfPlanet,
} from './chart-facts.js';
import { computeReportTimingWindows, type RankedWindow } from './report-timing.js';
import { computeAgeBandTable, type AgeBand } from './report-age-bands.js';
import { computeArchetype, type Archetype } from './report-archetype.js';
import { computeDecadeArc, type DecadeBand } from './report-decade-arc.js';
import { computeDoshaYogaSummary, type DoshaYogaSummary } from './report-dosha-yoga-summary.js';
import { computeLifeContext } from './report-life-context.js';
import { buildReportHeader } from './report-header.js';
import { buildReportRemedies } from './report-remedy-slots.js';
import { computeReportVargas } from './report-vargas.js';
import type { ReportSharedFactsWithRemedies } from './report-shared-facts.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

export interface TrueLoveScores extends Record<string, unknown>, ReportSharedFactsWithRemedies {
  /** Average of 5th-lord strength score and Venus strength score (romance/creativity signifiers). */
  romanceScore: number;
  /** Average of 7th-lord strength score and Venus strength score (partnership signifiers). */
  partnershipScore: number;
  venusInKeyHouse: boolean;
  /** 0-10, higher = more love-marriage-leaning. See computeLoveVsArrangedTilt for the exact formula. */
  loveVsArrangedTilt: number;
  /** Timing windows for the 'love' domain — significators are the UNION of the 5th house
   * (romance) and 7th house (partnership) lord/occupants plus Venus, unlike the Marriage
   * report (7th-house-only), since True Love covers both. See `buildLoveSignificators`. */
  windows: RankedWindow[];
  /** Current-age-relative confidence buckets derived from `windows`. */
  ageBands: AgeBand[];
  /** A small "romantic archetype" sketch themed on the 5th house sign, with 5 trait tilts. */
  archetype: Archetype;
  /** Themed on the 7th house sign (partnership) rather than the 5th (self) — answers "what kind
   * of person am I naturally, deeply drawn to in love," distinct from `archetype`'s "how do I
   * love." Same trait/significator recipe as Marriage report's own `partnerArchetype`
   * (astro-engine/reports/marriage.ts) — same underlying classical concept (7th-house partner
   * temperament), reused rather than reinvented. */
  partnerArchetype: Archetype;
  /** 3 forward-looking decade bands scored against the 5th/7th houses. */
  romanceArc: DecadeBand[];
  /** Mangal Dosha caution (previously completely missing from this report) + a wealth-yoga
   * positive — see the doc comment above `computeTrueLoveScores`'s own dosha/yoga block for
   * why 'dhana' was chosen as the yoga-type filter. */
  doshaYoga: DoshaYogaSummary;
}

/**
 * Every planet physically occupying a given house (whole-sign houses). chart-facts.ts exports
 * a single-planet occupancy check (`isPlanetInHouse`) and a house's lord (`getHouseLord`), but
 * not an "every occupant of this house" list — adding that to the shared chart-facts.ts module
 * is out of scope for this task (other report types/agents rely on its current exports), so this
 * is a small, local, single-purpose helper instead. Mirrors the same `chart?.planets` read
 * `getPlanetPosition` uses in chart-facts.ts.
 */
function occupantsOfHouse(houseNumber: number, chart: Record<string, unknown> | null): string[] {
  const planets = ((chart?.planets ?? []) as Array<{ planet?: string; house?: number }>) || [];
  const result: string[] = [];
  for (const p of planets) {
    if (p.house === houseNumber && p.planet) result.push(p.planet);
  }
  return result;
}

/**
 * True Love's timing-window significators: the UNION of the 5th house's (romance) and 7th
 * house's (partnership) lord + occupants, plus Venus — unlike marriage.ts (7th-house-only),
 * since this report explicitly covers both romance and partnership. Mirrors the exact
 * significator-building recipe chat-grounding.ts's domain-window loop uses for every OTHER
 * domain (house lords + static karakas + house occupants, deduped via a Set), just built by
 * hand for the two houses this report cares about instead of reading DOMAIN_CONFIG.love's
 * single natalHouses:[7] entry (which would miss the 5th house entirely).
 */
function buildLoveSignificators(chart: Record<string, unknown> | null): string[] {
  const houseLords = [getHouseLord(5, chart), getHouseLord(7, chart)].filter((p): p is string =>
    Boolean(p),
  );
  const houseOccupants = [...occupantsOfHouse(5, chart), ...occupantsOfHouse(7, chart)];
  return [...new Set([...houseLords, ...houseOccupants, 'Venus'])];
}

/**
 * Documented formula: compare "self-initiated romance" signifiers (Venus + 5th lord — the
 * planets classically tied to personal romantic initiative and courtship) against
 * "family-arranged" signifiers (7th lord + 4th lord — partnership formalized through family/home
 * involvement). `tilt = round(5 + (selfInitiated - family) / 12)`, clamped to [0, 10]:
 *   - selfInitiated/family are each 0-100 (average of two STRENGTH_SCORE values in {30,60,90}),
 *     so their difference ranges over [-60, 60].
 *   - Dividing by 12 maps that range onto [-5, 5]; adding 5 recenters it onto [0, 10], with 5
 *     (both sides equal) as the exact neutral midpoint.
 */
function computeLoveVsArrangedTilt(
  venusScore: number,
  fifthLordScore: number,
  seventhLordScore: number,
  fourthLordScore: number,
): number {
  const selfInitiated = (venusScore + fifthLordScore) / 2;
  const family = (seventhLordScore + fourthLordScore) / 2;
  const raw = 5 + (selfInitiated - family) / 12;
  return Math.max(0, Math.min(10, Math.round(raw)));
}

export function computeTrueLoveScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
  now: Date = new Date(),
): TrueLoveScores {
  const chart = ctx.chart;
  const analyses = analyzePlanetStrengths(chart);

  const venusScore = strengthScoreOfPlanet('Venus', analyses);

  const fifthLord = getHouseLord(5, chart);
  const fifthLordScore = fifthLord ? strengthScoreOfPlanet(fifthLord, analyses) : 60;

  const seventhLord = getHouseLord(7, chart);
  const seventhLordScore = seventhLord ? strengthScoreOfPlanet(seventhLord, analyses) : 60;

  const fourthLord = getHouseLord(4, chart);
  const fourthLordScore = fourthLord ? strengthScoreOfPlanet(fourthLord, analyses) : 60;

  const romanceScore = Math.round((fifthLordScore + venusScore) / 2);
  const partnershipScore = Math.round((seventhLordScore + venusScore) / 2);
  const venusInKeyHouse = isPlanetInHouse('Venus', [5, 7], chart);
  const loveVsArrangedTilt = computeLoveVsArrangedTilt(
    venusScore,
    fifthLordScore,
    seventhLordScore,
    fourthLordScore,
  );

  // --- Timing windows + age bands ------------------------------------------
  const significatorLords = buildLoveSignificators(chart);
  const { windows } = computeReportTimingWindows(
    'love',
    significatorLords,
    ctx.dashaData ?? null,
    chart,
    now,
  );

  const julianDay = chart?.julianDay;
  // Defensive fallback: a chart missing `julianDay` (should not happen for a real, fully
  // generated chart) has no derivable birth date. Falling back to `now` degrades
  // computeAgeYears to 0 (bands simply read "Now - 3", "4 - 7", etc.) rather than handing
  // computeAgeBandTable an invalid Date, which requires a real Date and has no null-safe path
  // of its own (see report-age-bands.ts's signature — birthDate is a required Date, not
  // nullable, by design, since every OTHER caller of it already has a real birth date).
  const birthDate = typeof julianDay === 'number' ? julianDayToDate(julianDay) : now;
  const ageBands = computeAgeBandTable(birthDate, now, windows);

  // --- Romantic archetype ---------------------------------------------------
  // Themed on the 5th house (romance/self-expression) — the more "true love"-specific of the
  // two houses this report covers (the 7th house/partnership-general temperament sketch is
  // already the Marriage report's own territory).
  const fifthHouseSign = getHouseSign(5, chart);
  const archetype = computeArchetype(
    fifthHouseSign,
    'The Romantic Explorer', // Generic, non-predictive archetype name — not a real-person claim,
    // same discipline SIGN_TEMPERAMENT's own lore follows.
    ['Passion', 'Openness', 'Loyalty', 'Spontaneity', 'Depth'],
    // Order-matched significators — a judgment call, documented:
    //   Passion     -> Mars    (classical significator of desire, drive, initiative)
    //   Openness    -> Mercury (communication, curiosity, willingness to connect)
    //   Loyalty     -> Saturn  (commitment, endurance, staying power)
    //   Spontaneity -> Rahu    (unconventional impulse, novelty-seeking)
    //   Depth       -> Moon    (emotional depth, inner life)
    ['Mars', 'Mercury', 'Saturn', 'Rahu', 'Moon'],
    analyses,
  );

  // --- Partner archetype (7th house — "who am I drawn to") -------------------
  // Same trait/significator recipe as Marriage's `partnerArchetype` (both classically read the
  // 7th house for partner temperament) — deliberately reused rather than invented from scratch.
  const seventhHouseSign = getHouseSign(7, chart);
  const partnerArchetype = computeArchetype(
    seventhHouseSign,
    'Partnership Archetype',
    ['Warmth', 'Discipline', 'Intellect', 'Sensuality', 'Ambition'],
    ['Moon', 'Saturn', 'Mercury', 'Venus', 'Mars'],
    analyses,
  );

  // --- Romance decade arc ----------------------------------------------------
  const romanceArc = computeDecadeArc(chart, [5, 7], now);

  // --- Dosha/Yoga summary -----------------------------------------------------
  // Mangal Dosha was completely missing from this report despite it covering the 5th/7th
  // houses — the same houses Mangal Dosha classically stresses — so adding it is a real
  // gap-fill, not decoration. Yoga type: 'dhana' (wealth) is the positives filter — not a
  // romance-specific category (no yoga `type` in this codebase is tagged specifically for
  // romance/relationships), but the most topically adjacent one available: financial
  // stability/prosperity is classically read alongside partnership and family blessing (this
  // report's own "Family Blessing" narrative section theme), unlike an unrelated category such
  // as 'raja' (career/power) or 'mahapurusha' (general greatness).
  const doshaYoga = computeDoshaYogaSummary(
    ctx.doshaData ?? null,
    ctx.yogaData ?? null,
    ['mangal', 'kaalSarp'],
    ['benefic', 'mahapurusha'],
  );

  const lifeContext = computeLifeContext(chart, analyses, ctx.dashaData ?? null, now);
  const header = buildReportHeader(chart, ctx.personName, ctx.personDob, lifeContext);
  const planetRemedies = buildReportRemedies('true_love', chart);
  // Navamsa (D9) — same marriage/relationship-domain varga as marriage.ts/kundli-milan.ts.
  const vargas = computeReportVargas(chart, ['D9']);

  return {
    header,
    lifeContext,
    planetRemedies,
    vargas,
    romanceScore,
    partnershipScore,
    venusInKeyHouse,
    loveVsArrangedTilt,
    windows,
    ageBands,
    archetype,
    partnerArchetype,
    romanceArc,
    doshaYoga,
  };
}
