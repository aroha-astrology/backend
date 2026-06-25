import type { AshtakootaResult, ZodiacSign } from '@jyotish-ai/shared';
/**
 * Computes all 8 Kootas for Ashtakoota marriage compatibility.
 *
 * Indices: nakshatraIndex1/2 are 0-26 (Ashwini=0 to Revati=26).
 * moonSign1/2 are boy's and girl's Moon signs respectively.
 *
 * @param nakshatraIndex1 - Boy's birth nakshatra index (0-26)
 * @param nakshatraIndex2 - Girl's birth nakshatra index (0-26)
 * @param moonSign1 - Boy's Moon sign
 * @param moonSign2 - Girl's Moon sign
 * @returns Full AshtakootaResult with all 8 koota scores and total
 */
export declare function calculateAshtakoota(nakshatraIndex1: number, nakshatraIndex2: number, moonSign1: ZodiacSign, moonSign2: ZodiacSign): AshtakootaResult;
//# sourceMappingURL=ashtakoota.d.ts.map