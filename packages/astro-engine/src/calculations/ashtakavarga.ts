// =============================================================================
// Ashtakavarga System - Benefic Point Calculations
// =============================================================================
// Each of 7 planets + Ascendant contributes benefic points (bindus) to each
// of the 7 planets across 12 signs. The classical rules define specific houses
// from each contributor where a planet receives a benefic point.
// =============================================================================

import type {
  Planet,
  ChartData,
  PlanetPosition,
  BhinnaAshtakavarga,
  SarvaAshtakavarga,
  AshtakavargaData,
} from '@aroha-astrology/shared';

import { ZODIAC_SIGNS, SIGN_LORDS } from '@aroha-astrology/shared';

// =============================================================================
// Constants: Classical Benefic Point Rules
// =============================================================================

/**
 * The 7 planets in Ashtakavarga (Rahu/Ketu excluded as primary planets,
 * but Ascendant contributes as the 8th contributor).
 */
const AV_PLANETS: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

/**
 * Classical Ashtakavarga benefic point tables.
 * For each planet, the houses from each contributor where a bindu is given.
 * Key: target planet. Value: Record of contributor -> array of house offsets (1-12).
 * "Asc" represents the ascendant as a contributor.
 *
 * These are the standard Parashari rules from Brihat Parashara Hora Shastra.
 */
const BENEFIC_POINTS: Record<string, Record<string, number[]>> = {
  // Sun's Ashtakavarga: houses from each contributor where Sun gets a bindu
  Sun: {
    Sun: [1, 2, 4, 7, 8, 9, 10, 11],
    Moon: [3, 6, 10, 11],
    Mars: [1, 2, 4, 7, 8, 9, 10, 11],
    Mercury: [3, 5, 6, 9, 10, 11, 12],
    Jupiter: [5, 6, 9, 11],
    Venus: [6, 7, 12],
    Saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    Asc: [3, 4, 6, 10, 11, 12],
  },

  // Moon's Ashtakavarga
  Moon: {
    Sun: [3, 6, 7, 8, 10, 11],
    Moon: [1, 3, 6, 7, 10, 11],
    Mars: [2, 3, 5, 6, 9, 10, 11],
    Mercury: [1, 3, 4, 5, 7, 8, 10, 11],
    Jupiter: [1, 4, 7, 8, 10, 11, 12],
    Venus: [3, 4, 5, 7, 9, 10, 11],
    Saturn: [3, 5, 6, 11],
    Asc: [3, 6, 10, 11],
  },

  // Mars's Ashtakavarga
  Mars: {
    Sun: [3, 5, 6, 10, 11],
    Moon: [3, 6, 11],
    Mars: [1, 2, 4, 7, 8, 10, 11],
    Mercury: [3, 5, 6, 11],
    Jupiter: [6, 10, 11, 12],
    Venus: [6, 8, 11, 12],
    Saturn: [1, 4, 7, 8, 9, 10, 11],
    Asc: [1, 3, 6, 10, 11],
  },

  // Mercury's Ashtakavarga
  Mercury: {
    Sun: [5, 6, 9, 11, 12],
    Moon: [2, 4, 6, 8, 10, 11],
    Mars: [1, 2, 4, 7, 8, 9, 10, 11],
    Mercury: [1, 3, 5, 6, 9, 10, 11, 12],
    Jupiter: [6, 8, 11, 12],
    Venus: [1, 2, 3, 4, 5, 8, 9, 11],
    Saturn: [1, 2, 4, 7, 8, 9, 10, 11],
    Asc: [1, 2, 4, 6, 8, 10, 11],
  },

  // Jupiter's Ashtakavarga
  Jupiter: {
    Sun: [1, 2, 3, 4, 7, 8, 9, 10, 11],
    Moon: [2, 5, 7, 9, 11],
    Mars: [1, 2, 4, 7, 8, 10, 11],
    Mercury: [1, 2, 4, 5, 6, 9, 10, 11],
    Jupiter: [1, 2, 3, 4, 7, 8, 10, 11],
    Venus: [2, 5, 6, 9, 10, 11],
    Saturn: [3, 5, 6, 12],
    Asc: [1, 2, 4, 5, 6, 7, 9, 10, 11],
  },

  // Venus's Ashtakavarga
  Venus: {
    Sun: [8, 11, 12],
    Moon: [1, 2, 3, 4, 5, 8, 9, 11, 12],
    Mars: [3, 5, 6, 9, 11, 12],
    Mercury: [3, 5, 6, 9, 11],
    Jupiter: [5, 8, 9, 10, 11],
    Venus: [1, 2, 3, 4, 5, 8, 9, 10, 11],
    Saturn: [3, 4, 5, 8, 9, 10, 11],
    Asc: [1, 2, 3, 4, 5, 8, 9, 11],
  },

  // Saturn's Ashtakavarga
  Saturn: {
    Sun: [1, 2, 4, 7, 8, 9, 10, 11],
    Moon: [3, 6, 11],
    Mars: [3, 5, 6, 10, 11, 12],
    Mercury: [6, 8, 9, 10, 11, 12],
    Jupiter: [5, 6, 11, 12],
    Venus: [6, 11, 12],
    Saturn: [3, 5, 6, 11],
    Asc: [1, 3, 4, 6, 10, 11],
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get the sign index (0-11) a planet occupies in the chart.
 */
function getPlanetSignIndex(chartData: ChartData, planet: Planet): number {
  const pos = chartData.planets.find((p) => p.planet === planet);
  if (!pos) return 0;
  return pos.signIndex;
}

/**
 * Get the ascendant sign index (0-11).
 */
function getAscSignIndex(chartData: ChartData): number {
  return chartData.ascendant.signIndex;
}

/**
 * Given a starting sign index and a house offset (1-12), return the target sign index.
 * House 1 = the starting sign itself.
 */
function houseToSignIndex(startSignIndex: number, houseOffset: number): number {
  return (startSignIndex + houseOffset - 1) % 12;
}

// =============================================================================
// Core Ashtakavarga Functions
// =============================================================================

/**
 * Calculate Bhinna (individual) Ashtakavarga for all 7 planets.
 *
 * For each target planet, we iterate through all 8 contributors (7 planets + Ascendant).
 * For each contributor, we look up which houses from the contributor give a bindu
 * to the target planet, then map those houses to actual sign indices based on
 * the contributor's sign position.
 *
 * @param chartData - Complete chart data with planet positions
 * @returns Array of BhinnaAshtakavarga, one per planet
 */
export function calculateBhinnaAshtakavarga(chartData: ChartData): BhinnaAshtakavarga[] {
  const results: BhinnaAshtakavarga[] = [];

  for (const targetPlanet of AV_PLANETS) {
    // Initialize bindu count for each of the 12 signs
    const bindus = new Array<number>(12).fill(0);
    const rules = BENEFIC_POINTS[targetPlanet];
    if (!rules) continue;

    // Process each contributor
    for (const contributor of [...AV_PLANETS, 'Asc'] as const) {
      const contributorHouses = rules[contributor];
      if (!contributorHouses) continue;

      // Determine the contributor's sign index
      let contributorSignIndex: number;
      if (contributor === 'Asc') {
        contributorSignIndex = getAscSignIndex(chartData);
      } else {
        contributorSignIndex = getPlanetSignIndex(chartData, contributor);
      }

      // For each house that gives a bindu, find the target sign and increment
      for (const houseOffset of contributorHouses) {
        const targetSignIndex = houseToSignIndex(contributorSignIndex, houseOffset);
        bindus[targetSignIndex] += 1;
      }
    }

    const total = bindus.reduce((sum, b) => sum + b, 0);

    results.push({
      planet: targetPlanet,
      bindus,
      total,
    });
  }

  return results;
}

/**
 * Calculate Sarva (cumulative) Ashtakavarga by summing all Bhinna tables.
 *
 * The Sarva Ashtakavarga sums the bindus of all 7 planets for each sign.
 * The classical total should be 337.
 *
 * @param bhinnaData - Array of BhinnaAshtakavarga from calculateBhinnaAshtakavarga
 * @returns SarvaAshtakavarga with 12 sign totals and grand total
 */
export function calculateSarvaAshtakavarga(
  bhinnaData: BhinnaAshtakavarga[]
): SarvaAshtakavarga {
  const sarvaBindus = new Array<number>(12).fill(0);

  for (const bhinna of bhinnaData) {
    for (let i = 0; i < 12; i++) {
      sarvaBindus[i] += bhinna.bindus[i];
    }
  }

  const total = sarvaBindus.reduce((sum, b) => sum + b, 0);

  return {
    bindus: sarvaBindus,
    total,
  };
}

/**
 * Calculate complete Ashtakavarga data (both Bhinna and Sarva).
 *
 * @param chartData - Complete chart data
 * @returns AshtakavargaData with bhinna and sarva
 */
export function calculateAshtakavarga(chartData: ChartData): AshtakavargaData {
  const bhinna = calculateBhinnaAshtakavarga(chartData);
  const sarva = calculateSarvaAshtakavarga(bhinna);

  return {
    bhinna,
    sarva,
  };
}

/**
 * Get the Ashtakavarga bindu count for a specific planet in a specific sign.
 * Useful for transit analysis - a planet transiting a sign with more bindus
 * gives better results.
 *
 * @param bhinnaData - Bhinna Ashtakavarga data
 * @param planet - The planet to check
 * @param signIndex - The sign index (0-11)
 * @returns Number of bindus (0-8)
 */
export function getBindusForPlanetInSign(
  bhinnaData: BhinnaAshtakavarga[],
  planet: Planet,
  signIndex: number
): number {
  const planetData = bhinnaData.find((b) => b.planet === planet);
  if (!planetData) return 0;
  return planetData.bindus[signIndex] || 0;
}

/**
 * Determine if a sign is strong or weak in Sarva Ashtakavarga.
 * Average is 337/12 ≈ 28.08 per sign.
 * Signs above average are considered strong.
 *
 * @param sarva - Sarva Ashtakavarga data
 * @param signIndex - The sign index (0-11)
 * @returns 'strong' if above average, 'weak' if below, 'average' if within 1 point
 */
export function evaluateSignStrength(
  sarva: SarvaAshtakavarga,
  signIndex: number
): 'strong' | 'weak' | 'average' {
  const average = sarva.total / 12;
  const bindus = sarva.bindus[signIndex];

  if (bindus > average + 1) return 'strong';
  if (bindus < average - 1) return 'weak';
  return 'average';
}
