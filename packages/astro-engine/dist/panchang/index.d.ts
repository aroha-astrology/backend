import type { PanchangData } from '@jyotish-ai/shared';
export { calculateTithi } from './tithi';
export { calculateNakshatra } from './nakshatra';
export { calculatePanchangYoga } from './yoga';
export { calculateKarana } from './karana';
export { calculateRahuKaal, calculateGulikaKaal, calculateYamagandaKaal } from './rahuKaal';
export { calculateChoghadiya } from './choghadiya';
export { calculateHora } from './hora';
export { calculateRegionalMonths } from './regional';
/**
 * Calculate the full Panchang for a given date and location.
 *
 * @param date - The date for which to calculate the panchang
 * @param latitude - Geographic latitude
 * @param longitude - Geographic longitude
 * @param sunLong - Sidereal longitude of the Sun (0-360)
 * @param moonLong - Sidereal longitude of the Moon (0-360)
 * @returns Complete PanchangData
 */
export declare function calculateFullPanchang(date: Date, latitude: number, longitude: number, sunLong: number, moonLong: number): PanchangData;
//# sourceMappingURL=index.d.ts.map