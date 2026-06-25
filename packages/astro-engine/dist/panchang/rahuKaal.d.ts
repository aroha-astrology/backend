/**
 * Calculate Rahu Kaal for a given day.
 *
 * @param sunrise - Sunrise time as "HH:MM"
 * @param sunset - Sunset time as "HH:MM"
 * @param dayOfWeek - Day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
 * @returns Start and end times of Rahu Kaal as "HH:MM"
 */
export declare function calculateRahuKaal(sunrise: string, sunset: string, dayOfWeek: number): {
    start: string;
    end: string;
};
/**
 * Calculate Gulika Kaal for a given day.
 *
 * @param sunrise - Sunrise time as "HH:MM"
 * @param sunset - Sunset time as "HH:MM"
 * @param dayOfWeek - Day of week (0=Sunday, ..., 6=Saturday)
 * @returns Start and end times of Gulika Kaal as "HH:MM"
 */
export declare function calculateGulikaKaal(sunrise: string, sunset: string, dayOfWeek: number): {
    start: string;
    end: string;
};
/**
 * Calculate Yamaganda Kaal for a given day.
 *
 * @param sunrise - Sunrise time as "HH:MM"
 * @param sunset - Sunset time as "HH:MM"
 * @param dayOfWeek - Day of week (0=Sunday, ..., 6=Saturday)
 * @returns Start and end times of Yamaganda Kaal as "HH:MM"
 */
export declare function calculateYamagandaKaal(sunrise: string, sunset: string, dayOfWeek: number): {
    start: string;
    end: string;
};
//# sourceMappingURL=rahuKaal.d.ts.map