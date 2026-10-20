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
 * All 24 horas of one day, in order: twelve equal parts of the daylight span
 * (sunrise to sunset) and twelve equal parts of the night. The first belongs
 * to the weekday lord and the rest follow HORA_ORDER without a break at
 * sunset. A fixed 60-minute hora (the old calculateHora, removed) is only right
 * at the equinox (audit item PN2).
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
