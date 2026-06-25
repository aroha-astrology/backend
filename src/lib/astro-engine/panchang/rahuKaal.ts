// @ts-nocheck
// =============================================================================
// Rahu Kaal, Gulika Kaal, and Yamaganda Kaal Calculations
// =============================================================================
// Divide the time between sunrise and sunset into 8 equal parts.
// The Rahu Kaal period for each day is determined by RAHU_KAAL_PERIODS.
// Gulika and Yamaganda follow similar patterns with different period indices.

import { RAHU_KAAL_PERIODS } from '@aroha-astrology/shared';

/**
 * Parse a time string "HH:MM" into total minutes from midnight.
 */
function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Format total minutes from midnight into "HH:MM".
 */
function formatTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.floor(totalMinutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Calculate a kaal period by dividing sunrise-to-sunset into 8 parts
 * and selecting the period at the given index (1-based).
 */
function calculateKaalPeriod(
  sunrise: string,
  sunset: string,
  periodIndex: number
): { start: string; end: string } {
  const sunriseMin = parseTime(sunrise);
  const sunsetMin = parseTime(sunset);
  const dayDuration = sunsetMin - sunriseMin;
  const partDuration = dayDuration / 8;

  const startMin = sunriseMin + (periodIndex - 1) * partDuration;
  const endMin = startMin + partDuration;

  return {
    start: formatTime(startMin),
    end: formatTime(endMin),
  };
}

/**
 * Calculate Rahu Kaal for a given day.
 *
 * @param sunrise - Sunrise time as "HH:MM"
 * @param sunset - Sunset time as "HH:MM"
 * @param dayOfWeek - Day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
 * @returns Start and end times of Rahu Kaal as "HH:MM"
 */
export function calculateRahuKaal(
  sunrise: string,
  sunset: string,
  dayOfWeek: number
): { start: string; end: string } {
  const periodIndex = RAHU_KAAL_PERIODS[dayOfWeek];
  return calculateKaalPeriod(sunrise, sunset, periodIndex);
}

// Gulika Kaal periods by day of week (0=Sunday)
// Sunday=7, Monday=6, Tuesday=5, Wednesday=4, Thursday=3, Friday=2, Saturday=1
const GULIKA_KAAL_PERIODS: Record<number, number> = {
  0: 7, // Sunday
  1: 6, // Monday
  2: 5, // Tuesday
  3: 4, // Wednesday
  4: 3, // Thursday
  5: 2, // Friday
  6: 1, // Saturday
};

/**
 * Calculate Gulika Kaal for a given day.
 *
 * @param sunrise - Sunrise time as "HH:MM"
 * @param sunset - Sunset time as "HH:MM"
 * @param dayOfWeek - Day of week (0=Sunday, ..., 6=Saturday)
 * @returns Start and end times of Gulika Kaal as "HH:MM"
 */
export function calculateGulikaKaal(
  sunrise: string,
  sunset: string,
  dayOfWeek: number
): { start: string; end: string } {
  const periodIndex = GULIKA_KAAL_PERIODS[dayOfWeek];
  return calculateKaalPeriod(sunrise, sunset, periodIndex);
}

// Yamaganda Kaal periods by day of week (0=Sunday)
// Sunday=5, Monday=4, Tuesday=3, Wednesday=2, Thursday=1, Friday=7, Saturday=6
const YAMAGANDA_KAAL_PERIODS: Record<number, number> = {
  0: 5, // Sunday
  1: 4, // Monday
  2: 3, // Tuesday
  3: 2, // Wednesday
  4: 1, // Thursday
  5: 7, // Friday
  6: 6, // Saturday
};

/**
 * Calculate Yamaganda Kaal for a given day.
 *
 * @param sunrise - Sunrise time as "HH:MM"
 * @param sunset - Sunset time as "HH:MM"
 * @param dayOfWeek - Day of week (0=Sunday, ..., 6=Saturday)
 * @returns Start and end times of Yamaganda Kaal as "HH:MM"
 */
export function calculateYamagandaKaal(
  sunrise: string,
  sunset: string,
  dayOfWeek: number
): { start: string; end: string } {
  const periodIndex = YAMAGANDA_KAAL_PERIODS[dayOfWeek];
  return calculateKaalPeriod(sunrise, sunset, periodIndex);
}

