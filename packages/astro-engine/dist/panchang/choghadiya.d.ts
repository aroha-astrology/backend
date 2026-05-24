import type { Choghadiya } from '@jyotish-ai/shared';
/**
 * Calculate all 16 Choghadiya periods (8 day + 8 night) for a given day.
 *
 * @param sunrise - Sunrise time as "HH:MM"
 * @param sunset - Sunset time as "HH:MM"
 * @param dayOfWeek - Day of week (0=Sunday, ..., 6=Saturday)
 * @returns Array of 16 Choghadiya periods (8 day followed by 8 night)
 */
export declare function calculateChoghadiya(sunrise: string, sunset: string, dayOfWeek: number): Choghadiya[];
//# sourceMappingURL=choghadiya.d.ts.map