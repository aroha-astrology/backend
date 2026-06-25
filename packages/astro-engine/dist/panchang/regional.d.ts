import type { RegionId, RegionalMonth } from '@jyotish-ai/shared';
interface RegionalMonthArgs {
    isoDate: string;
    gregorianYear: number;
    sunSiderealLong: number;
    paksha: 'Shukla' | 'Krishna' | 'shukla' | 'krishna';
}
/**
 * Compute the lunar/solar month + era year as understood by each of the four
 * regional Panchang traditions.
 *
 * @returns A record keyed by RegionId.
 */
export declare function calculateRegionalMonths(args: RegionalMonthArgs): Record<RegionId, RegionalMonth>;
export {};
//# sourceMappingURL=regional.d.ts.map