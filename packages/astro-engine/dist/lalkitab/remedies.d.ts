import type { Planet } from '@jyotish-ai/shared';
/**
 * Get Lal Kitab remedies and totke for a planet in a specific house.
 *
 * Returns remedies (general corrective actions) and totke (specific practical
 * rituals) for each of the 108 planet-house combinations.
 */
export declare function getLalKitabRemedies(planet: Planet, house: number): {
    remedies: string[];
    totke: string[];
};
//# sourceMappingURL=remedies.d.ts.map