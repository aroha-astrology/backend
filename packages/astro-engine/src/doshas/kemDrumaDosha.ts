import type { ChartData, KemDrumaDosha, Planet } from '@aroha-astrology/shared';

/**
 * Kemdrum Dosha Detection
 *
 * Kemdrum Yoga (Dosha) occurs when:
 * - No planet (excluding Sun, Rahu, Ketu) is in the 2nd or 12th house from Moon
 * - AND no planet (excluding Sun, Rahu, Ketu) is in a Kendra (1, 4, 7, 10) from Moon
 *
 * Cancellations:
 * 1. Moon in a Kendra from Lagna (houses 1, 4, 7, 10)
 * 2. Moon aspected by Jupiter
 * 3. Moon conjunct Venus (same sign)
 */

/** Planets considered for Kemdrum: exclude Sun, Rahu, Ketu (shadowy/luminaries). */
const KEMDRUM_PLANETS: Planet[] = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

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

export function detectKemDrumaDosha(chartData: ChartData): KemDrumaDosha {
  const moon = chartData.planets.find((p) => p.planet === 'Moon');

  if (!moon) {
    return {
      present: false,
      cancellations: [],
      severity: 'none',
    };
  }

  const moonSignIndex = moon.signIndex;

  // Check if any qualifying planet is in 2nd or 12th from Moon
  const hasAdjacentPlanet = chartData.planets.some((p) => {
    if (!KEMDRUM_PLANETS.includes(p.planet)) return false;
    const house = getHouseFromSign(p.signIndex, moonSignIndex);
    return house === 2 || house === 12;
  });

  // Check if any qualifying planet is in Kendra from Moon
  const hasKendraPlanet = chartData.planets.some((p) => {
    if (!KEMDRUM_PLANETS.includes(p.planet)) return false;
    const house = getHouseFromSign(p.signIndex, moonSignIndex);
    return [1, 4, 7, 10].includes(house);
  });

  // Kemdrum applies only if BOTH conditions fail
  const rawPresent = !hasAdjacentPlanet && !hasKendraPlanet;

  if (!rawPresent) {
    return {
      present: false,
      cancellations: [],
      severity: 'none',
    };
  }

  // Check cancellations
  const cancellations: string[] = [];
  const lagnaSignIndex = chartData.ascendant.signIndex;

  // 1. Moon in Kendra from Lagna
  const moonHouseFromLagna = getHouseFromSign(moonSignIndex, lagnaSignIndex);
  if ([1, 4, 7, 10].includes(moonHouseFromLagna)) {
    cancellations.push(
      `Moon in Kendra (house ${moonHouseFromLagna}) from Lagna - cancellation applies`
    );
  }

  // 2. Moon aspected by Jupiter
  if (isAspectedByJupiter(chartData, moonSignIndex)) {
    cancellations.push('Moon aspected by Jupiter - cancellation applies');
  }

  // 3. Moon conjunct Venus (same sign)
  const venusConjunct = chartData.planets.some(
    (p) => p.planet === 'Venus' && p.signIndex === moonSignIndex
  );
  if (venusConjunct) {
    cancellations.push('Moon conjunct Venus - cancellation applies');
  }

  const isCancelled = cancellations.length > 0;
  const present = !isCancelled;

  let severity: KemDrumaDosha['severity'] = 'none';
  if (present) {
    severity = 'severe'; // Kemdrum without cancellation is severe
  }

  return {
    present,
    cancellations,
    severity,
  };
}
