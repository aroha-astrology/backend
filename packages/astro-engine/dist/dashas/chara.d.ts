import type { ZodiacSign, ChartData, CharaDasha } from '@jyotish-ai/shared';
/**
 * Calculate the Chara (Jaimini) Dasha.
 *
 * This is a sign-based dasha system originating from Maharishi Jaimini.
 * The dasha sequence starts from the ascendant sign and progresses
 * forward (for odd ascendants) or backward (for even ascendants)
 * through all 12 signs.
 *
 * Each sign's period length depends on the distance between the sign
 * and its Jaimini lord's position in the chart.
 *
 * The full sequence of 12 signs is repeated as many times as needed
 * to cover 120 years from birth.
 *
 * @param ascendantSign  The ascendant (lagna) sign.
 * @param chartData      Full chart data with planet positions.
 * @returns              A `CharaDasha` object.
 */
export declare function calculateCharaDasha(ascendantSign: ZodiacSign, chartData: ChartData): CharaDasha;
//# sourceMappingURL=chara.d.ts.map