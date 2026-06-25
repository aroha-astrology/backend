import type { DashakootaResult, ZodiacSign, ChartData } from '@jyotish-ai/shared';
/**
 * Computes all 10 Poruthams for South Indian (Dashakoota) marriage compatibility.
 *
 * @param nakshatraIndex1 - Boy's birth nakshatra index (0-26)
 * @param nakshatraIndex2 - Girl's birth nakshatra index (0-26)
 * @param moonSign1 - Boy's Moon sign
 * @param moonSign2 - Girl's Moon sign
 * @param _charts - Optional chart data (reserved for future use with divisional charts)
 * @returns Full DashakootaResult with all 10 porutham scores and total
 */
export declare function calculateDashakoota(nakshatraIndex1: number, nakshatraIndex2: number, moonSign1: ZodiacSign, moonSign2: ZodiacSign, _charts?: {
    boy?: ChartData;
    girl?: ChartData;
}): DashakootaResult;
//# sourceMappingURL=dashakoota.d.ts.map