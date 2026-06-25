import type { Ayanamsa, HouseSystem, PlanetPosition, HouseData, AscendantData, ChartData } from '@jyotish-ai/shared';
/**
 * Convert a date/time with timezone offset to a Julian Day number.
 */
export declare function dateToJulianDay(year: number, month: number, day: number, hour: number, min: number, timezone: number): Promise<number>;
/**
 * Calculate sidereal positions of all 9 Vedic planets.
 */
export declare function calculatePlanetPositions(jd: number, ayanamsa?: Ayanamsa): Promise<PlanetPosition[]>;
/**
 * Calculate house cusps for a given time and geographic location.
 */
export declare function calculateHouses(jd: number, lat: number, lng: number, system?: HouseSystem, ayanamsa?: Ayanamsa): Promise<HouseData[]>;
/**
 * Calculate the ascendant (lagna) position.
 */
export declare function calculateAscendant(jd: number, lat: number, lng: number, ayanamsa?: Ayanamsa): Promise<AscendantData>;
/**
 * Generate a complete chart with planets, houses, and ascendant.
 */
export declare function calculateChart(year: number, month: number, day: number, hour: number, min: number, timezone: number, lat: number, lng: number, ayanamsa?: Ayanamsa, houseSystem?: HouseSystem): Promise<ChartData>;
//# sourceMappingURL=planetPositions.d.ts.map