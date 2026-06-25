// @ts-nocheck
// =============================================================================
// Lal Kitab Chart Construction
// =============================================================================
// In Lal Kitab, Aries is ALWAYS the 1st house. Planets are placed by house
// number derived from their sign position (Aries=1, Taurus=2, ... Pisces=12).

import type { ChartData, LalKitabChart, Planet, ZodiacSign } from '@aroha-astrology/shared';
import { ZODIAC_SIGNS, LALKITAB_PAKKA_GHAR } from '@aroha-astrology/shared';

/**
 * Create a Lal Kitab chart from standard Vedic chart data.
 *
 * Lal Kitab fixes Aries as the 1st house. A planet's house number equals
 * its sign index + 1 (Aries=1 ... Pisces=12), regardless of the ascendant.
 */
export function createLalKitabChart(chartData: ChartData): LalKitabChart {
  // Initialize 12 houses with fixed signs (Aries=house 1, Taurus=house 2, etc.)
  const houses: { house: number; planets: Planet[]; sign: ZodiacSign }[] = [];
  for (let i = 0; i < 12; i++) {
    houses.push({
      house: i + 1,
      sign: ZODIAC_SIGNS[i],
      planets: [],
    });
  }

  // Place each planet in the house corresponding to its sign index
  // In Lal Kitab: sign index 0 (Aries) = house 1, sign index 1 (Taurus) = house 2, etc.
  for (const planet of chartData.planets) {
    const houseNumber = planet.signIndex + 1; // 1-based
    houses[houseNumber - 1].planets.push(planet.planet);
  }

  return {
    houses,
    pakkaGhar: { ...LALKITAB_PAKKA_GHAR },
  };
}

