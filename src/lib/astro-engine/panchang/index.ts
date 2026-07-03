// @ts-nocheck
// =============================================================================
// Panchang Module - Barrel Export & Full Panchang Calculator
// =============================================================================

import type { PanchangData } from '@aroha-astrology/shared';

import { calculateTithi } from './tithi';
import { calculateNakshatra } from './nakshatra';
import { calculatePanchangYoga } from './yoga';
import { calculateKarana } from './karana';
import { calculateRahuKaal, calculateGulikaKaal, calculateYamagandaKaal } from './rahuKaal';
import { calculateRegionalMonths } from './regional';

export { calculateTithi } from './tithi';
export { calculateNakshatra } from './nakshatra';
export { calculatePanchangYoga } from './yoga';
export { calculateKarana } from './karana';
export { calculateRahuKaal, calculateGulikaKaal, calculateYamagandaKaal } from './rahuKaal';
export { calculateChoghadiya } from './choghadiya';
export { calculateHora } from './hora';
export { calculateRegionalMonths } from './regional';

// Weekday names
const WEEKDAY_NAMES = [
  'Ravivaar',
  'Somvaar',
  'Mangalvaar',
  'Budhvaar',
  'Guruvaar',
  'Shukravaar',
  'Shanivaar',
];

/**
 * Estimate sunrise and sunset for a given date and location using a simplified
 * deterministic algorithm (no external API needed).
 *
 * Uses the NOAA solar equations for sunrise/sunset based on latitude, longitude,
 * and day of year. Returns times in the local timezone derived from longitude.
 */
function estimateSunriseSunset(
  date: Date,
  latitude: number,
  longitude: number,
  timezoneOffsetHours: number,
): { sunrise: string; sunset: string } {
  // Day of year
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  // Solar declination (approximate)
  const declination = -23.45 * Math.cos((360 / 365) * (dayOfYear + 10) * (Math.PI / 180));
  const declinationRad = declination * (Math.PI / 180);
  const latRad = latitude * (Math.PI / 180);

  // Hour angle for sunrise/sunset
  let cosHourAngle = -Math.tan(latRad) * Math.tan(declinationRad);
  // Clamp for extreme latitudes (midnight sun / polar night)
  cosHourAngle = Math.max(-1, Math.min(1, cosHourAngle));
  const hourAngle = Math.acos(cosHourAngle) * (180 / Math.PI);

  // Solar noon in minutes from midnight (UTC)
  // Equation of time approximation
  const B = (360 / 365) * (dayOfYear - 81) * (Math.PI / 180);
  const equationOfTime = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

  // Solar noon in local time (offset by longitude, 4 min per degree)
  const solarNoonUTC = 720 - 4 * longitude - equationOfTime; // in minutes from midnight UTC
  const solarNoonLocal = solarNoonUTC + timezoneOffsetHours * 60;

  // Sunrise and sunset
  const sunriseMin = solarNoonLocal - (hourAngle / 360) * 24 * 60;
  const sunsetMin = solarNoonLocal + (hourAngle / 360) * 24 * 60;

  const formatTime = (mins: number): string => {
    let m = Math.round(mins);
    if (m < 0) m += 24 * 60;
    if (m >= 24 * 60) m -= 24 * 60;
    const h = Math.floor(m / 60);
    const min = m % 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  };

  return {
    sunrise: formatTime(sunriseMin),
    sunset: formatTime(sunsetMin),
  };
}

/**
 * Calculate the full Panchang for a given date and location.
 *
 * @param date - The date for which to calculate the panchang
 * @param latitude - Geographic latitude
 * @param longitude - Geographic longitude
 * @param sunLong - Sidereal longitude of the Sun (0-360)
 * @param moonLong - Sidereal longitude of the Moon (0-360)
 * @param timezoneOffsetHours - Civil UTC offset in hours for `date`'s locale
 *   (e.g. 5.5 for IST). Longitude alone cannot recover this — India's +5:30
 *   is a political choice anchored to 82.5°E, not the local solar meridian,
 *   so a longitude-derived guess is off by up to ~45min at the country's
 *   eastern/western edges.
 * @returns Complete PanchangData
 */
export function calculateFullPanchang(
  date: Date,
  latitude: number,
  longitude: number,
  sunLong: number,
  moonLong: number,
  timezoneOffsetHours: number,
): PanchangData {
  const dayOfWeek = date.getDay(); // 0=Sunday

  // Estimate sunrise and sunset
  const { sunrise, sunset } = estimateSunriseSunset(date, latitude, longitude, timezoneOffsetHours);

  // Calculate the five limbs (pancha-anga)
  const tithi = calculateTithi(moonLong, sunLong);
  const nakshatra = calculateNakshatra(moonLong);
  const yoga = calculatePanchangYoga(sunLong, moonLong);
  const karana = calculateKarana(moonLong, sunLong);

  // Calculate inauspicious periods
  const rahuKaal = calculateRahuKaal(sunrise, sunset, dayOfWeek);
  const gulikaKaal = calculateGulikaKaal(sunrise, sunset, dayOfWeek);
  const yamagandaKaal = calculateYamagandaKaal(sunrise, sunset, dayOfWeek);

  // Abhijit Muhurta: the 8th muhurta of the day (midday, approximately)
  // Divide day into 15 muhurtas. Abhijit = around the 8th muhurta (local noon).
  const sunriseMin = parseTimeToMin(sunrise);
  const sunsetMin = parseTimeToMin(sunset);
  const dayDuration = sunsetMin - sunriseMin;
  const muhurtaDuration = dayDuration / 15;
  const abhijitStart = sunriseMin + 7 * muhurtaDuration;
  const abhijitEnd = abhijitStart + muhurtaDuration;

  const isoDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const regionalMonths = calculateRegionalMonths({
    isoDate,
    gregorianYear: date.getFullYear(),
    sunSiderealLong: sunLong,
    paksha: tithi.paksha,
  });

  return {
    tithi,
    nakshatra,
    yoga,
    karana,
    vara: WEEKDAY_NAMES[dayOfWeek],
    rahuKaal,
    gulikaKaal,
    yamagandaKaal,
    abhijitMuhurta: {
      start: formatMinToTime(abhijitStart),
      end: formatMinToTime(abhijitEnd),
    },
    sunriseTime: sunrise,
    sunsetTime: sunset,
    regionalMonths,
  };
}

function parseTimeToMin(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatMinToTime(totalMinutes: number): string {
  let mins = Math.round(totalMinutes);
  if (mins < 0) mins += 24 * 60;
  if (mins >= 24 * 60) mins -= 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
