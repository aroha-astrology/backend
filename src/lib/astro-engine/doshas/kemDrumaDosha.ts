// @ts-nocheck
import type { ChartData, KemDrumaDosha, Planet } from '@aroha-astrology/shared';

import { getActiveProfile, type AstrologyRuleProfile } from '../rules/profile.js';

/**
 * Kemadruma (Kemdrum) detection, after the Brihat Jataka 13.3
 * (docs/engine-audit/D-source-register.md, BJ-13.3; audit item DS3).
 *
 * The text: "Excepting the Sun, if the other planets occupy the 2nd, the 12th,
 * or both ... from the Moon", the yogas are Sunapha, Anapha and Durudhara;
 * "otherwise" the yoga is Kemadruma. It ceases "if the Moon occupy the Kendra
 * from the ascendant or if the Moon be accompanied by a planet". The text also
 * reports other views (an angle from the Moon, the navamsa) and says "these
 * views are not considered as authoritative". It does not mention Jupiter.
 *
 * Two exemption sets, chosen by `AstrologyRuleProfile.kemadrumaExemptions`:
 *  - 'brihat-jataka' (default): formed when no planet but the Sun is in the
 *    2nd or 12th from the Moon; cancelled when the Moon is in an angle from
 *    the Lagna or has any planet in its sign.
 *  - 'later-tradition': what this engine used before the audit. A planet in an
 *    angle from the Moon also prevents it, and the Moon is cancelled by an
 *    angle from the Lagna, by Jupiter's aspect, or by Venus in its sign.
 *
 * Rahu and Ketu are not counted: the text speaks of the seven planets.
 */

/** Planets that stand beside the Moon for Sunapha/Anapha/Kemadruma: the Sun is excepted. */
const BESIDE_MOON_PLANETS: Planet[] = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
/** "Accompanied by a planet": any of the seven. */
const COMPANION_PLANETS: Planet[] = ['Sun', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

export type KemadrumaExemptions = AstrologyRuleProfile['kemadrumaExemptions'];

export interface KemadrumaAssessment {
  /** The yoga is formed: nothing stands in the 2nd or 12th from the Moon (and, in the later set, no angle). */
  formed: boolean;
  /** Plain-language reasons it is cancelled; empty when nothing cancels it. */
  cancellations: string[];
  /** Planets that take part in a cancellation, for the cancellation yoga. */
  cancellingPlanets: Planet[];
}

function getHouseFromSign(planetSignIndex: number, referenceSignIndex: number): number {
  return ((planetSignIndex - referenceSignIndex + 12) % 12) + 1;
}

function isAspectedByJupiter(chartData: ChartData, targetSignIndex: number): boolean {
  const jupiter = chartData.planets.find((p) => p.planet === 'Jupiter');
  if (!jupiter) return false;

  // Jupiter aspects 5th, 7th, and 9th from its position
  const aspectOffsets = [5, 7, 9];
  for (const offset of aspectOffsets) {
    const aspectedSignIndex = (jupiter.signIndex + offset - 1) % 12;
    if (aspectedSignIndex === targetSignIndex) return true;
  }
  return false;
}

/**
 * Is Kemadruma formed in this chart, and what cancels it? Shared by the dosha
 * and by the "Kemadruma Cancellation" yoga so the two cannot disagree.
 */
export function assessKemadruma(
  chartData: ChartData,
  exemptions: KemadrumaExemptions = getActiveProfile().kemadrumaExemptions,
): KemadrumaAssessment | null {
  const moon = chartData.planets.find((p) => p.planet === 'Moon');
  if (!moon) return null;

  const moonSignIndex = moon.signIndex;
  const houseFromMoon = (p: { signIndex: number }) => getHouseFromSign(p.signIndex, moonSignIndex);

  const hasAdjacentPlanet = chartData.planets.some(
    (p) =>
      BESIDE_MOON_PLANETS.includes(p.planet) && (houseFromMoon(p) === 2 || houseFromMoon(p) === 12),
  );
  const later = exemptions === 'later-tradition';
  const hasAngularPlanet =
    later &&
    chartData.planets.some(
      (p) => BESIDE_MOON_PLANETS.includes(p.planet) && [1, 4, 7, 10].includes(houseFromMoon(p)),
    );

  const formed = !hasAdjacentPlanet && !hasAngularPlanet;
  if (!formed) return { formed, cancellations: [], cancellingPlanets: [] };

  const cancellations: string[] = [];
  const cancellingPlanets: Planet[] = [];

  const moonHouseFromLagna = getHouseFromSign(moonSignIndex, chartData.ascendant.signIndex);
  if ([1, 4, 7, 10].includes(moonHouseFromLagna)) {
    cancellations.push(
      `Moon in an angle (house ${moonHouseFromLagna}) from the Lagna - cancellation applies`,
    );
  }

  if (later) {
    if (isAspectedByJupiter(chartData, moonSignIndex)) {
      cancellations.push('Moon aspected by Jupiter - cancellation applies');
      cancellingPlanets.push('Jupiter');
    }
    const venusConjunct = chartData.planets.some(
      (p) => p.planet === 'Venus' && p.signIndex === moonSignIndex,
    );
    if (venusConjunct) {
      cancellations.push('Moon conjunct Venus - cancellation applies');
      cancellingPlanets.push('Venus');
    }
  } else {
    const companions = chartData.planets.filter(
      (p) => COMPANION_PLANETS.includes(p.planet) && p.signIndex === moonSignIndex,
    );
    if (companions.length > 0) {
      cancellations.push(
        `Moon joined by ${companions.map((p) => p.planet).join(' and ')} - cancellation applies`,
      );
      cancellingPlanets.push(...companions.map((p) => p.planet));
    }
  }

  return { formed, cancellations, cancellingPlanets };
}

export function detectKemDrumaDosha(
  chartData: ChartData,
  options: { exemptions?: KemadrumaExemptions } = {},
): KemDrumaDosha {
  const none: KemDrumaDosha = {
    present: false,
    cancellations: [],
    severity: 'none',
    description: '',
  };

  const moon = chartData.planets.find((p) => p.planet === 'Moon');
  const exemptions = options.exemptions ?? getActiveProfile().kemadrumaExemptions;
  const assessment = assessKemadruma(chartData, exemptions);
  if (!moon || !assessment || !assessment.formed) return none;

  const { cancellations } = assessment;
  const present = cancellations.length === 0;

  // The text gives no strength for Kemadruma, so none is claimed: a flagged
  // chart is "moderate", never "severe" (owner's decision on DS3).
  const severity: KemDrumaDosha['severity'] = present ? 'moderate' : 'none';

  const description = present
    ? exemptions === 'later-tradition'
      ? `No planet besides the Sun, Rahu or Ketu stands in the 2nd or 12th from your Moon in ${moon.sign}, or in an angle from it. Later tradition calls this Kemadruma and reads it as a Moon with little support around it. It is one thing to weigh among many in the chart, not a verdict.`
      : `No planet besides the Sun stands in the 2nd or 12th from your Moon in ${moon.sign}. The Brihat Jataka calls this Kemadruma, and none of its exceptions apply: your Moon is not in an angle from the Lagna and no planet is with it. Tradition reads it as a Moon with little support around it. It is one thing to weigh among many in the chart, not a verdict.`
    : '';

  return {
    present,
    cancellations,
    severity,
    description,
  };
}
