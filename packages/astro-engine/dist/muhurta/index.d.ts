import type { MuhurtaType, MuhurtaResult } from '@jyotish-ai/shared';
/**
 * Find the best muhurta windows for a given activity type within a date range.
 *
 * Evaluates each day at multiple time slots (every 2 hours from sunrise)
 * and scores them based on tithi, nakshatra, yoga, lagna, weekday,
 * and rahu kaal avoidance.
 *
 * @param type - Type of activity (marriage, griha_pravesh, etc.)
 * @param startDate - Start of search range
 * @param endDate - End of search range
 * @param lat - Latitude
 * @param lng - Longitude
 * @param tz - Timezone string (e.g., "Asia/Kolkata") -- used for display only
 * @returns Array of MuhurtaResult sorted by score descending
 */
export declare function findBestMuhurta(type: MuhurtaType, startDate: Date, endDate: Date, lat: number, lng: number, _tz: string): MuhurtaResult[];
//# sourceMappingURL=index.d.ts.map