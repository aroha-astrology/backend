// @ts-nocheck
// =============================================================================
// Planetary Hora Calculation
// =============================================================================
// Each hour of the day is ruled by a planet. The first hora after sunrise
// belongs to the weekday lord. Subsequent horas cycle through the Chaldean
// order: Sun, Venus, Mercury, Moon, Saturn, Jupiter, Mars.

import type { Hora, Planet } from '@aroha-astrology/shared';

// Chaldean order of planets for hora cycling
const HORA_ORDER: Planet[] = ['Sun', 'Venus', 'Mercury', 'Moon', 'Saturn', 'Jupiter', 'Mars'];

// Weekday lords (0=Sunday)
const WEEKDAY_LORDS: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

// Benefic hora planets
const BENEFIC_HORA_PLANETS = new Set<Planet>(['Jupiter', 'Venus', 'Mercury', 'Moon']);

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
  let mins = totalMinutes;
  if (mins < 0) mins += 24 * 60;
  if (mins >= 24 * 60) mins -= 24 * 60;
  const h = Math.floor(mins / 60);
  const m = Math.floor(mins % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Calculate the current planetary hora.
 *
 * The day is divided into 24 horas (not necessarily 60 minutes each).
 * Day horas: sunrise to sunset divided into 12 equal parts.
 * Night horas: sunset to next sunrise divided into 12 equal parts.
 * The first hora of the day belongs to the weekday lord, then cycles
 * through the Chaldean order.
 *
 * @param sunrise - Sunrise time as "HH:MM"
 * @param currentTime - Current time as "HH:MM"
 * @param dayOfWeek - Day of week (0=Sunday, ..., 6=Saturday)
 * @returns Hora object with ruling planet, time range, and auspiciousness
 */
export function calculateHora(sunrise: string, currentTime: string, dayOfWeek: number): Hora {
  const sunriseMin = parseTime(sunrise);
  const currentMin = parseTime(currentTime);

  // Assume sunset is approximately 12 hours after sunrise for hora calculation
  // (actual sunset would be passed if available, but hora traditionally uses
  // 12 equal day horas and 12 equal night horas based on actual day/night length)
  // For simplicity and determinism, we calculate based on 24 horas from sunrise.
  // Day = 12 horas, Night = 12 horas. Using average 1 hora = 60 min for now.
  // A more precise version would accept sunset as well.

  // Calculate minutes elapsed since sunrise
  let elapsed = currentMin - sunriseMin;
  if (elapsed < 0) elapsed += 24 * 60; // past midnight, wrap around

  // Each hora = 60 minutes (24 horas in a day)
  const horaIndex = Math.floor(elapsed / 60) % 24;

  // Find the starting planet (weekday lord)
  const weekdayLord = WEEKDAY_LORDS[dayOfWeek];
  const startIdx = HORA_ORDER.indexOf(weekdayLord);

  // Current hora planet
  const planetIdx = (startIdx + horaIndex) % 7;
  const planet = HORA_ORDER[planetIdx];

  // Hora start and end times
  const horaStartMin = sunriseMin + horaIndex * 60;
  const horaEndMin = horaStartMin + 60;

  return {
    planet,
    startTime: formatTime(horaStartMin),
    endTime: formatTime(horaEndMin),
    isAuspicious: BENEFIC_HORA_PLANETS.has(planet),
  };
}

/**
 * All 24 horas of one day, in order: twelve equal parts of the daylight span
 * (sunrise to sunset) and twelve equal parts of the night. The first belongs
 * to the weekday lord and the rest follow HORA_ORDER without a break at
 * sunset. `calculateHora` above uses a fixed 60 minutes instead, which is
 * only right at the equinox (audit item PN2).
 *
 * @param sunrise - "HH:MM" local
 * @param sunset - "HH:MM" local
 * @param dayOfWeek - 0=Sunday .. 6=Saturday, of the day that begins at `sunrise`
 */
export function buildHoraSchedule(sunrise: string, sunset: string, dayOfWeek: number): Hora[] {
  const sunriseMin = parseTime(sunrise);
  const dayLength = (((parseTime(sunset) - sunriseMin) % 1440) + 1440) % 1440;
  const dayHora = dayLength / 12;
  const nightHora = (1440 - dayLength) / 12;
  const startIdx = HORA_ORDER.indexOf(WEEKDAY_LORDS[dayOfWeek]);
  const at = (i: number) =>
    i <= 12 ? sunriseMin + i * dayHora : sunriseMin + dayLength + (i - 12) * nightHora;
  const clock = (mins: number) => {
    const m = ((Math.round(mins) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  };

  return Array.from({ length: 24 }, (_, i) => {
    const planet = HORA_ORDER[(startIdx + i) % 7];
    return {
      planet,
      startTime: clock(at(i)),
      endTime: clock(at(i + 1)),
      isAuspicious: BENEFIC_HORA_PLANETS.has(planet),
    };
  });
}
