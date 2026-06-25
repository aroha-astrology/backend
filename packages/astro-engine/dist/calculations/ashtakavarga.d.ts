import type { Planet, ChartData, BhinnaAshtakavarga, SarvaAshtakavarga, AshtakavargaData } from '@jyotish-ai/shared';
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
export declare function calculateBhinnaAshtakavarga(chartData: ChartData): BhinnaAshtakavarga[];
/**
 * Calculate Sarva (cumulative) Ashtakavarga by summing all Bhinna tables.
 *
 * The Sarva Ashtakavarga sums the bindus of all 7 planets for each sign.
 * The classical total should be 337.
 *
 * @param bhinnaData - Array of BhinnaAshtakavarga from calculateBhinnaAshtakavarga
 * @returns SarvaAshtakavarga with 12 sign totals and grand total
 */
export declare function calculateSarvaAshtakavarga(bhinnaData: BhinnaAshtakavarga[]): SarvaAshtakavarga;
/**
 * Calculate complete Ashtakavarga data (both Bhinna and Sarva).
 *
 * @param chartData - Complete chart data
 * @returns AshtakavargaData with bhinna and sarva
 */
export declare function calculateAshtakavarga(chartData: ChartData): AshtakavargaData;
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
export declare function getBindusForPlanetInSign(bhinnaData: BhinnaAshtakavarga[], planet: Planet, signIndex: number): number;
/**
 * Determine if a sign is strong or weak in Sarva Ashtakavarga.
 * Average is 337/12 ≈ 28.08 per sign.
 * Signs above average are considered strong.
 *
 * @param sarva - Sarva Ashtakavarga data
 * @param signIndex - The sign index (0-11)
 * @returns 'strong' if above average, 'weak' if below, 'average' if within 1 point
 */
export declare function evaluateSignStrength(sarva: SarvaAshtakavarga, signIndex: number): 'strong' | 'weak' | 'average';
//# sourceMappingURL=ashtakavarga.d.ts.map