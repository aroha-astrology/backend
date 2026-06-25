// @ts-nocheck
// =============================================================================
// Lal Kitab Blind Planet Detection
// =============================================================================
// A planet is "blind" (dormant) when no planets occupy the two adjacent houses.
// A planet is "half-blind" when only one adjacent house has planets.
// Adjacent houses wrap: house 1's previous is house 12, house 12's next is house 1.

import type { LalKitabChart, BlindPlanet, Planet } from '@aroha-astrology/shared';

/**
 * Detect blind and half-blind planets in a Lal Kitab chart.
 *
 * A planet is blind when both adjacent houses (house-1 and house+1, wrapping
 * 12 to 1) are empty. It is half-blind when exactly one adjacent house has
 * planets.
 */
export function detectBlindPlanets(lkChart: LalKitabChart): BlindPlanet[] {
  const results: BlindPlanet[] = [];

  // Build a quick lookup: house number -> list of planets
  const housePlanets: Record<number, Planet[]> = {};
  for (const house of lkChart.houses) {
    housePlanets[house.house] = house.planets;
  }

  /**
   * Get the previous house number with wrapping (1 -> 12).
   */
  function prevHouse(h: number): number {
    return h === 1 ? 12 : h - 1;
  }

  /**
   * Get the next house number with wrapping (12 -> 1).
   */
  function nextHouse(h: number): number {
    return h === 12 ? 1 : h + 1;
  }

  for (const house of lkChart.houses) {
    for (const planet of house.planets) {
      const hNum = house.house;
      const prev = prevHouse(hNum);
      const next = nextHouse(hNum);

      const prevOccupied = housePlanets[prev].length > 0;
      const nextOccupied = housePlanets[next].length > 0;

      const isBlind = !prevOccupied && !nextOccupied;
      const isHalfBlind = !isBlind && (!prevOccupied || !nextOccupied);

      let reason: string;
      if (isBlind) {
        reason = `${planet} in house ${hNum} is blind: both adjacent houses (${prev} and ${next}) are empty. The planet cannot express its energy and its significations remain dormant.`;
      } else if (isHalfBlind) {
        const emptyAdj = !prevOccupied ? prev : next;
        const occupiedAdj = prevOccupied ? prev : next;
        reason = `${planet} in house ${hNum} is half-blind: house ${emptyAdj} is empty while house ${occupiedAdj} has planets. The planet gives partial results.`;
      } else {
        reason = `${planet} in house ${hNum} is active: both adjacent houses (${prev} and ${next}) have planets. The planet can fully express its energy.`;
      }

      results.push({
        planet,
        house: hNum,
        isBlind,
        isHalfBlind,
        reason,
      });
    }
  }

  return results;
}

