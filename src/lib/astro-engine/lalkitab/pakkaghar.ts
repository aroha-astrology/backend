// @ts-nocheck
// =============================================================================
// Lal Kitab Pakka Ghar (Permanent House) Analysis
// =============================================================================
// Each planet has a permanent (pakka) house. When a planet sits in its pakka
// ghar it gives strong results. Displacement modifies effects.

import type { LalKitabChart, Planet } from '@aroha-astrology/shared';
import { LALKITAB_PAKKA_GHAR } from '@aroha-astrology/shared';

export interface PakkaGharResult {
  planet: Planet;
  pakkaGhar: number;
  currentHouse: number;
  isInPakkaGhar: boolean;
  effect: string;
}

/**
 * Analyze each planet's placement relative to its Pakka Ghar.
 *
 * Pakka Ghar assignments:
 *   Sun=1, Moon=4, Mars=3, Mercury=7, Jupiter=2,
 *   Venus=7, Saturn=8, Rahu=12, Ketu=6
 */
export function analyzePakkaGhar(lkChart: LalKitabChart): PakkaGharResult[] {
  const results: PakkaGharResult[] = [];

  // Gather a planet->house mapping from the chart
  const planetHouseMap: Partial<Record<Planet, number>> = {};
  for (const house of lkChart.houses) {
    for (const planet of house.planets) {
      planetHouseMap[planet] = house.house;
    }
  }

  const planets: Planet[] = [
    'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu',
  ];

  for (const planet of planets) {
    const pakkaGhar = LALKITAB_PAKKA_GHAR[planet];
    const currentHouse = planetHouseMap[planet];
    if (currentHouse === undefined) continue;

    const isInPakkaGhar = currentHouse === pakkaGhar;
    const effect = describeEffect(planet, pakkaGhar, currentHouse);

    results.push({
      planet,
      pakkaGhar,
      currentHouse,
      isInPakkaGhar,
      effect,
    });
  }

  return results;
}

/**
 * Describe the effect of a planet based on its displacement from Pakka Ghar.
 */
function describeEffect(planet: Planet, pakkaGhar: number, currentHouse: number): string {
  if (currentHouse === pakkaGhar) {
    return `${planet} is in its Pakka Ghar (house ${pakkaGhar}). It gives its full natural results with confidence and strength.`;
  }

  // Calculate angular distance (houses away)
  const distance = ((currentHouse - pakkaGhar + 12) % 12) || 12;

  // Kendra (1, 4, 7, 10 from pakka ghar) - reasonably well placed
  const kendraOffsets = [1, 4, 7, 10];
  // Trikona (1, 5, 9 from pakka ghar) - supportive
  const trikonaOffsets = [1, 5, 9];
  // Dusthana (6, 8, 12 from pakka ghar) - weakened
  const dusthanaOffsets = [6, 8, 12];

  const relativeHouse = ((currentHouse - pakkaGhar + 12) % 12) + 1;

  if (kendraOffsets.includes(relativeHouse)) {
    return `${planet} is in a kendra position relative to its Pakka Ghar. It retains reasonable strength but acts through the affairs of house ${currentHouse}.`;
  }
  if (trikonaOffsets.includes(relativeHouse)) {
    return `${planet} is in a trikona position relative to its Pakka Ghar. It gains supportive energy and its results flow with some fortune through house ${currentHouse}.`;
  }
  if (dusthanaOffsets.includes(relativeHouse)) {
    return `${planet} is in a dusthana position relative to its Pakka Ghar. Its natural significations are weakened or obstructed in house ${currentHouse}. Remedies may be needed.`;
  }

  // Houses 2, 3, 11 from pakka ghar - moderate effects
  if (relativeHouse === 2 || relativeHouse === 11) {
    return `${planet} is adjacent to a kendra from its Pakka Ghar. It gives moderate results through house ${currentHouse}, with some support from neighboring influences.`;
  }
  if (relativeHouse === 3) {
    return `${planet} is in the 3rd from its Pakka Ghar. It gives its results through personal effort and courage in house ${currentHouse}.`;
  }

  return `${planet} is displaced from its Pakka Ghar (house ${pakkaGhar}) to house ${currentHouse}. Its natural results are modified by the significations of the current house.`;
}

