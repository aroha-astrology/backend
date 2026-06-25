import type { LalKitabChart, Planet } from '@jyotish-ai/shared';
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
export declare function analyzePakkaGhar(lkChart: LalKitabChart): PakkaGharResult[];
//# sourceMappingURL=pakkaghar.d.ts.map