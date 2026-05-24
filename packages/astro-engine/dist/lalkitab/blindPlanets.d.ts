import type { LalKitabChart, BlindPlanet } from '@jyotish-ai/shared';
/**
 * Detect blind and half-blind planets in a Lal Kitab chart.
 *
 * A planet is blind when both adjacent houses (house-1 and house+1, wrapping
 * 12 to 1) are empty. It is half-blind when exactly one adjacent house has
 * planets.
 */
export declare function detectBlindPlanets(lkChart: LalKitabChart): BlindPlanet[];
//# sourceMappingURL=blindPlanets.d.ts.map