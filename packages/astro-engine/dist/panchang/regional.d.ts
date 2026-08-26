import type { RegionId, RegionalMonth } from '@aroha-astrology/shared';
interface RegionalMonthArgs {
    isoDate: string;
    gregorianYear: number;
    sunSiderealLong: number;
    paksha: 'Shukla' | 'Krishna' | 'shukla' | 'krishna';
}
export declare function calculateRegionalMonths(args: RegionalMonthArgs): Record<RegionId, RegionalMonth>;
export {};
//# sourceMappingURL=regional.d.ts.map