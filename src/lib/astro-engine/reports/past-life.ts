// =============================================================================
// Past Life report — deterministic scoring
// =============================================================================
// Pure, synchronous, fast — no LLM call, no DB access. The thinnest-margin
// report in the catalogue (₹25) — kept simple by design: Rahu/Ketu axis facts
// plus 12th-lord strength, read straight from the chart.
// =============================================================================

import { analyzePlanetStrengths, type PlanetStrength } from '../gemstones.js';
import { getHouseLord, getPlanetPosition, strengthOfPlanet } from './chart-facts.js';
import { computeDoshaYogaSummary, type DoshaYogaSummary } from './report-dosha-yoga-summary.js';
import type { ReportScoreContext } from '../../../modules/reports/report-generator.types.js';

export interface KarmicArchetype {
  label: string;
  description: string;
}

/**
 * Rahu and Ketu are always exactly 7 houses apart (a 180-degree axis), so there are exactly 6
 * possible house axes across a chart: 1-7, 2-8, 3-9, 4-10, 5-11, 6-12. Keyed here by the LOWER
 * house number of each pair (the axis's canonical id, via `axisIdForHouse` below) rather than by
 * whichever specific house Rahu vs. Ketu happens to occupy, so the same theme applies regardless
 * of which node sits in which half — deliberately generic/classical framing, not a claim about a
 * specific individual, matching this report's own "deliberately thin, not fabricated specificity"
 * discipline (see this module's top-of-file doc comment).
 */
const HOUSE_AXIS_THEMES: Record<number, KarmicArchetype> = {
  1: {
    label: 'Self & Partnership Axis',
    description:
      'Your Rahu/Ketu axis runs through the 1st and 7th houses — a classical theme of karma between self-identity and one-on-one partnership, learning where you end and another begins.',
  },
  2: {
    label: 'Resources & Shared Transformation Axis',
    description:
      'Your Rahu/Ketu axis runs through the 2nd and 8th houses — a classical theme of karma between personal resources/values and shared or transformative resources, learning what is truly yours to hold versus what must be released or merged.',
  },
  3: {
    label: 'Effort & Belief Axis',
    description:
      'Your Rahu/Ketu axis runs through the 3rd and 9th houses — a classical theme of karma between everyday effort/communication and higher belief/philosophy, learning to balance hands-on initiative with faith and a wider worldview.',
  },
  4: {
    label: 'Roots & Career Axis',
    description:
      'Your Rahu/Ketu axis runs through the 4th and 10th houses — a classical theme of karma between home/inner roots and career/public life, learning to balance private emotional grounding with public achievement.',
  },
  5: {
    label: 'Creative Self & Community Axis',
    description:
      'Your Rahu/Ketu axis runs through the 5th and 11th houses — a classical theme of karma between personal creativity/romance and community/collective gain, learning to balance individual self-expression with belonging to a larger group.',
  },
  6: {
    label: 'Service & Release Axis',
    description:
      'Your Rahu/Ketu axis runs through the 6th and 12th houses — a classical theme of karma between daily service/health and surrender/the unseen, the axis most directly tied to release itself, balancing disciplined effort with letting go.',
  },
};

/** Degrades to this generic theme when neither Rahu's nor Ketu's house is available on the chart
 * — never throws, never guesses a specific axis from incomplete data. */
const DEFAULT_KARMIC_ARCHETYPE: KarmicArchetype = {
  label: 'Karmic Axis',
  description:
    'Your Rahu/Ketu axis could not be placed on a specific house pair from the available chart data, so this theme stays general: a classical karmic thread between what you are still learning and what you are releasing.',
};

/** Maps any house 1-12 to its axis id 1-6 (e.g. houses 1 and 7 both map to axis 1). */
function axisIdForHouse(house: number): number {
  return ((house - 1) % 6) + 1;
}

function computeKarmicArchetype(
  rahuHouse: number | null,
  ketuHouse: number | null,
): KarmicArchetype {
  const house = rahuHouse ?? ketuHouse;
  if (typeof house !== 'number' || house < 1 || house > 12) return DEFAULT_KARMIC_ARCHETYPE;
  return HOUSE_AXIS_THEMES[axisIdForHouse(house)] ?? DEFAULT_KARMIC_ARCHETYPE;
}

export interface PastLifeScores extends Record<string, unknown> {
  rahuHouse: number | null;
  rahuSign: string | null;
  ketuHouse: number | null;
  ketuSign: string | null;
  twelfthLordStrength: PlanetStrength;
  /** Planets sharing Rahu's or Ketu's house (whole-sign conjunction) — "karmic amplifiers". */
  conjunctPlanets: string[];
  /** Deterministic house-axis karmic theme (see `HOUSE_AXIS_THEMES` above) — NOT built via
   * `computeArchetype` (that shared primitive is built around a single house's sign plus 5
   * planet-strength traits, which doesn't fit a Rahu/Ketu axis theme). */
  karmicArchetype: KarmicArchetype;
  /** Kaal Sarp Dosha check on the Rahu/Ketu axis — directly on-theme for a past-life report and
   * previously entirely unused by this report type. */
  doshaYoga: DoshaYogaSummary;
}

export function computePastLifeScores(
  ctx: ReportScoreContext,
  _periodMonth: string | null,
): PastLifeScores {
  const chart = ctx.chart;

  // Read Rahu/Ketu directly from the chart's own data rather than assuming Ketu is always
  // exactly 180 degrees from Rahu — true in classical theory, but this function trusts
  // whatever the chart actually computed rather than re-deriving it.
  const rahu = getPlanetPosition('Rahu', chart);
  const ketu = getPlanetPosition('Ketu', chart);

  const analyses = analyzePlanetStrengths(chart);
  const twelfthLord = getHouseLord(12, chart);
  const twelfthLordStrength = twelfthLord ? strengthOfPlanet(twelfthLord, analyses) : 'average';

  const conjunctPlanets: string[] = [];
  const allPlanets = ((chart?.planets ?? []) as Array<{ planet?: string; house?: number }>) || [];
  for (const p of allPlanets) {
    if (!p.planet || p.planet === 'Rahu' || p.planet === 'Ketu') continue;
    if (typeof p.house !== 'number') continue;
    if (p.house === rahu?.house || p.house === ketu?.house) {
      conjunctPlanets.push(p.planet);
    }
  }

  const rahuHouse = rahu?.house ?? null;
  const ketuHouse = ketu?.house ?? null;
  const karmicArchetype = computeKarmicArchetype(rahuHouse, ketuHouse);
  const doshaYoga = computeDoshaYogaSummary(
    ctx.doshaData ?? null,
    ctx.yogaData ?? null,
    ['kaalSarp'],
    [],
  );

  return {
    rahuHouse,
    rahuSign: rahu?.sign ?? null,
    ketuHouse,
    ketuSign: ketu?.sign ?? null,
    twelfthLordStrength,
    conjunctPlanets,
    karmicArchetype,
    doshaYoga,
  };
}
