// =============================================================================
// Metrologist Agent - Ephemeris computation via the astro-engine
// =============================================================================

import { logger } from '../../logger.js';
import {
  dateToJulianDay,
  calculatePlanetPositions,
  calculateHouses,
  calculateChart,
  calculateVimshottariDasha,
} from '../../astro-engine/index.js';
import type { BirthRecord, SwarmState } from '../state.js';

// =============================================================================
// Timezone string to UTC offset hours
// =============================================================================

/**
 * Convert a timezone string (e.g. "Asia/Kolkata", "+05:30", "5.5") to a
 * numeric UTC offset in hours.
 */
function timezoneToOffset(tz: string): number {
  // Try numeric first
  const numeric = parseFloat(tz);
  if (!Number.isNaN(numeric)) return numeric;

  // Try +HH:MM / -HH:MM
  const hhmm = /^([+-])(\d{1,2}):(\d{2})$/.exec(tz);
  if (hhmm) {
    const sign = hhmm[1] === '-' ? -1 : 1;
    return sign * (parseInt(hhmm[2] ?? '0', 10) + parseInt(hhmm[3] ?? '0', 10) / 60);
  }

  // Common IANA timezone offset table (best-effort, no full tz database)
  const KNOWN_OFFSETS: Record<string, number> = {
    'Asia/Kolkata': 5.5,
    'Asia/Calcutta': 5.5,
    'Asia/Colombo': 5.5,
    'Asia/Kathmandu': 5.75,
    'Asia/Dhaka': 6,
    'Asia/Bangkok': 7,
    'Asia/Singapore': 8,
    'Asia/Shanghai': 8,
    'Asia/Tokyo': 9,
    'Asia/Dubai': 4,
    'Europe/London': 0,
    'Europe/Paris': 1,
    'Europe/Berlin': 1,
    'America/New_York': -5,
    'America/Chicago': -6,
    'America/Denver': -7,
    'America/Los_Angeles': -8,
    'Pacific/Auckland': 12,
    UTC: 0,
  };

  if (tz in KNOWN_OFFSETS) return KNOWN_OFFSETS[tz] ?? 5.5;

  // Fallback: assume IST
  logger.warn({ tz }, 'Unknown timezone, defaulting to +5.5 (IST)');
  return 5.5;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Convert a BirthRecord to a UTC Date, extracting year/month/day/hour/minute
 * and the timezone offset.
 */
function parseBirthRecord(record: BirthRecord): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  tzOffset: number;
  lat: number;
  lng: number;
} {
  // date: "YYYY-MM-DD"
  const dateParts = record.date.split('-').map(Number);
  const year = dateParts[0] ?? 2000;
  const month = dateParts[1] ?? 1;
  const day = dateParts[2] ?? 1;
  // time: "HH:MM" or "HH:MM:SS"
  const timeParts = record.time.split(':').map(Number);
  const hour = timeParts[0] ?? 12;
  const minute = timeParts[1] ?? 0;
  const tzOffset = timezoneToOffset(record.timezone);

  return {
    year,
    month,
    day,
    hour,
    minute,
    tzOffset,
    lat: record.latitude,
    lng: record.longitude,
  };
}

/**
 * Compute full metrology for a birth record:
 * Julian day, planet positions, houses, chart, and Vimshottari dasha.
 */
export async function computeMetrology(
  record: BirthRecord,
): Promise<Record<string, unknown>> {
  const { year, month, day, hour, minute, tzOffset, lat, lng } = parseBirthRecord(record);

  // Julian day
  const jd = await dateToJulianDay(year, month, day, hour, minute, tzOffset);

  // Planet positions
  const planets = await calculatePlanetPositions(jd);

  // Houses
  const houses = await calculateHouses(jd, lat, lng);

  // Full chart (includes ascendant)
  const chart = await calculateChart(year, month, day, hour, minute, tzOffset, lat, lng);

  // Moon longitude for Vimshottari dasha
  const moon = planets.find((p) => p.planet === 'Moon');
  const moonLongitude = moon?.longitude ?? 0;

  // Birth date as Date object for dasha calculation
  const birthDate = new Date(year, month - 1, day, hour, minute);
  const dasha = calculateVimshottariDasha(moonLongitude, birthDate);

  return {
    julianDay: jd,
    planets,
    houses,
    chart,
    dasha,
  };
}

/**
 * Metrologist pipeline node: extracts birthRecord from state,
 * computes metrology, and returns the partial state update.
 */
export async function metrologistNode(
  state: SwarmState,
): Promise<Partial<SwarmState>> {
  logger.debug({ requestId: state.requestId }, 'metrologist: enter');

  if (!state.birthRecord) {
    return {
      errors: ['metrologist: no birth record available'],
    };
  }

  try {
    const metrology = await computeMetrology(state.birthRecord);
    return { metrology };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, requestId: state.requestId }, 'metrologist: computation failed');
    return {
      errors: [`metrologist: ${message}`],
    };
  }
}
