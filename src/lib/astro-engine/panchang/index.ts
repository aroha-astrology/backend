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
import { calculateChoghadiya } from './choghadiya';
import { buildHoraSchedule } from './hora';
import { getMoonriseMoonset, getSunriseSunset } from './rise-set';
import { getTithiBoundary, getNakshatraBoundary } from './boundaries';
import { calculatePlanetPositions, dateToJulianDay } from '../calculations/planetPositions.core';

export { calculateTithi } from './tithi';
export { calculateNakshatra } from './nakshatra';
export { calculatePanchangYoga } from './yoga';
export { calculateKarana } from './karana';
export { calculateRahuKaal, calculateGulikaKaal, calculateYamagandaKaal } from './rahuKaal';
export { calculateChoghadiya } from './choghadiya';
export { calculateHora, buildHoraSchedule } from './hora';
export { calculateRegionalMonths } from './regional';
export { getMoonriseMoonset } from './rise-set';
export { getTithiBoundary, getNakshatraBoundary } from './boundaries';

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

  const solarNoonLocal = solarNoonLocalMinutes(dayOfYear, longitude, timezoneOffsetHours);

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

/** Local solar noon in minutes after local midnight (NOAA equation of time, 4 min per degree of longitude). */
function solarNoonLocalMinutes(dayOfYear: number, longitude: number, timezoneOffsetHours: number): number {
  const B = (360 / 365) * (dayOfYear - 81) * (Math.PI / 180);
  const equationOfTime = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const solarNoonUTC = 720 - 4 * longitude - equationOfTime; // in minutes from midnight UTC
  return solarNoonUTC + timezoneOffsetHours * 60;
}

/** Above this latitude a day can be too short or too long to cut Rahu Kaal and the other windows from. */
export const HIGH_LATITUDE_DEG = 55;
/** Day lengths (minutes) outside this range switch the windows to solar noon ± 6 h. */
export const MIN_USABLE_DAY_MIN = 4 * 60;
export const MAX_USABLE_DAY_MIN = 20 * 60;

/**
 * The sunrise and sunset the day windows (Rahu Kaal, Gulika, Yamaganda, Abhijit, Choghadiya, Hora)
 * are cut from. Normally the real ones. Above 55° latitude, when the day is under 4 h or over 20 h,
 * or the Sun does not rise or set at all, an 8-fold split of that day would give windows minutes long
 * or nearly a day long, so the windows use solar noon ± 6 h instead (`mode: 'solarNoon'`). Solar noon
 * is the midpoint of the real sunrise and sunset when both exist, else the NOAA estimate.
 */
export function dayWindowSunTimes(
  real: { sunrise: string; sunset: string } | undefined,
  date: Date,
  latitude: number,
  longitude: number,
  timezoneOffsetHours: number,
): { times: { sunrise: string; sunset: string } | undefined; mode: 'sunrise' | 'solarNoon' } {
  if (Math.abs(latitude) <= HIGH_LATITUDE_DEG) return { times: real, mode: 'sunrise' };

  let solarNoon: number;
  if (real) {
    const rise = parseTimeToMin(real.sunrise);
    const length = (((parseTimeToMin(real.sunset) - rise) % 1440) + 1440) % 1440;
    if (length >= MIN_USABLE_DAY_MIN && length <= MAX_USABLE_DAY_MIN) {
      return { times: real, mode: 'sunrise' };
    }
    solarNoon = rise + length / 2;
  } else {
    const start = new Date(date.getFullYear(), 0, 0);
    const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
    solarNoon = solarNoonLocalMinutes(dayOfYear, longitude, timezoneOffsetHours);
  }
  return {
    times: { sunrise: formatMinToTime(solarNoon - 360), sunset: formatMinToTime(solarNoon + 360) },
    mode: 'solarNoon',
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
  /** Real sunrise/sunset ("HH:MM" local) when the caller has them; see calculateFullPanchangAsync. */
  sunTimes?: { sunrise: string; sunset: string },
): PanchangData {
  const dayOfWeek = date.getDay(); // 0=Sunday

  // Rahu Kaal, Gulika, Yamaganda, Abhijit, Choghadiya and Hora are all cut
  // from these two times. The closed-form estimate is minutes off (no
  // refraction, rough declination), so it is only the fallback for the
  // synchronous callers that cannot wait for the ephemeris (audit item PN1).
  const { sunrise, sunset } =
    sunTimes ?? estimateSunriseSunset(date, latitude, longitude, timezoneOffsetHours);

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

  const choghadiyaAll = calculateChoghadiya(sunrise, sunset, dayOfWeek);
  const hora = buildHoraSchedule(sunrise, sunset, dayOfWeek);

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
    choghadiya: { day: choghadiyaAll.slice(0, 8), night: choghadiyaAll.slice(8, 16) },
    hora,
  };
}

/**
 * Calculates the full Panchang PLUS two additive data points that need a
 * real (not the NOAA-approximated) swisseph ephemeris lookup: moonrise/
 * moonset, and the end-time (+ next name) of the current tithi and
 * nakshatra. `calculateFullPanchang` above stays synchronous and unchanged
 * (its existing callers/tests are unaffected) — this wraps it and is what
 * `getPanchang` (astro/astro.service.ts) calls.
 *
 * Both new lookups are independent, real computations via `swe_rise_trans`
 * (rise-set.ts) and an angle-crossing bisection (boundaries.ts) — see those
 * modules for details, including a documented bug in `swisseph-wasm`'s own
 * `rise_trans()` convenience method that rise-set.ts works around.
 *
 * @param date - The date for which to calculate the panchang.
 * @param latitude - Geographic latitude.
 * @param longitude - Geographic longitude.
 * @param sunLong - Sidereal longitude of the Sun (0-360), for the same
 *   moment `calculateFullPanchang` was already given this for.
 * @param moonLong - Sidereal longitude of the Moon (0-360), ditto.
 * @param timezoneOffsetHours - Civil UTC offset in hours (e.g. 5.5 for IST).
 * @returns Complete PanchangData, including moonriseTime/moonsetTime and
 *   tithi.endsAt/tithi.nextName/nakshatra.endsAt/nakshatra.nextName.
 */
export async function calculateFullPanchangAsync(
  date: Date,
  latitude: number,
  longitude: number,
  sunLong: number,
  moonLong: number,
  timezoneOffsetHours: number,
  /**
   * UT Julian day the Sun and Moon longitudes were read at; the end-time
   * searches start from it so "ends at" belongs to the limb actually shown.
   * Defaults to local noon of `date` for callers that pass noon longitudes.
   */
  referenceJd?: number,
): Promise<PanchangData> {
  const sunTimes = await getLocalSunTimes(date, latitude, longitude, timezoneOffsetHours);
  const windows = dayWindowSunTimes(sunTimes, date, latitude, longitude, timezoneOffsetHours);

  const windowed = calculateFullPanchang(
    date,
    latitude,
    longitude,
    sunLong,
    moonLong,
    timezoneOffsetHours,
    windows.times,
  );
  // Sunrise and sunset themselves stay the real ones even when the windows use solar noon.
  const shownSun =
    windows.mode === 'solarNoon'
      ? (sunTimes ?? estimateSunriseSunset(date, latitude, longitude, timezoneOffsetHours))
      : undefined;
  const base: PanchangData = shownSun
    ? { ...windowed, sunriseTime: shownSun.sunrise, sunsetTime: shownSun.sunset, dayTimesMode: windows.mode }
    : { ...windowed, dayTimesMode: windows.mode };

  const jdRef = referenceJd ?? (await localNoonJd(date, timezoneOffsetHours));

  const [moonRiseSet, tithiBoundary, nakshatraBoundary] = await Promise.all([
    getMoonriseMoonset(date, latitude, longitude, timezoneOffsetHours),
    getTithiBoundary(jdRef, timezoneOffsetHours),
    getNakshatraBoundary(jdRef, timezoneOffsetHours),
  ]);

  return {
    ...base,
    moonriseTime: moonRiseSet.moonrise ?? undefined,
    moonsetTime: moonRiseSet.moonset ?? undefined,
    moonriseNextDay: moonRiseSet.moonriseNextDay,
    moonsetNextDay: moonRiseSet.moonsetNextDay,
    tithi: {
      ...base.tithi,
      endsAt: tithiBoundary.endsAt,
      endsOn: tithiBoundary.endsOn,
      nextName: tithiBoundary.nextName,
    },
    nakshatra: {
      ...base.nakshatra,
      endsAt: nakshatraBoundary.endsAt,
      endsOn: nakshatraBoundary.endsOn,
      nextName: nakshatraBoundary.nextName,
    },
  };
}

function localNoonJd(date: Date, timezoneOffsetHours: number): Promise<number> {
  return dateToJulianDay(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    12,
    0,
    timezoneOffsetHours,
  );
}

/**
 * The moment a civil day's tithi, nakshatra, yoga and karana are read at:
 * the real (ephemeris) sunrise at the place, the udaya convention drikpanchang
 * and printed panchangs use. Until 2026-10 Aroha read them at local noon
 * (engine audit PN4), which on days whose tithi changed between sunrise and
 * noon showed the next day's tithi. Local noon remains only where the Sun
 * does not rise that day.
 */
export async function panchangReferenceJd(
  date: Date,
  latitude: number,
  longitude: number,
  timezoneOffsetHours: number,
): Promise<number> {
  const { sunrise } = await getSunriseSunset(date, latitude, longitude, timezoneOffsetHours);
  if (sunrise) return 2440587.5 + sunrise.getTime() / 86_400_000;
  return localNoonJd(date, timezoneOffsetHours);
}

/**
 * The full Panchang for one civil day at one place: reads the Sun and Moon at
 * `panchangReferenceJd` and hands everything to calculateFullPanchangAsync.
 * This is what getPanchang (astro.service.ts) serves to every screen.
 */
export async function calculateDayPanchang(
  date: Date,
  latitude: number,
  longitude: number,
  timezoneOffsetHours: number,
): Promise<PanchangData> {
  const jd = await panchangReferenceJd(date, latitude, longitude, timezoneOffsetHours);
  const planets = await calculatePlanetPositions(jd);
  const sunLong = planets.find((p) => p.planet === 'Sun')?.longitude ?? 0;
  const moonLong = planets.find((p) => p.planet === 'Moon')?.longitude ?? 0;
  return calculateFullPanchangAsync(
    date,
    latitude,
    longitude,
    sunLong,
    moonLong,
    timezoneOffsetHours,
    jd,
  );
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

/**
 * The real Swiss Ephemeris sunrise and sunset for a place and civil day, as
 * local "HH:MM". Undefined only where the Sun does not rise or set that day;
 * `calculateFullPanchang` then falls back to its estimate.
 */
export async function getLocalSunTimes(
  date: Date,
  latitude: number,
  longitude: number,
  timezoneOffsetHours: number,
): Promise<{ sunrise: string; sunset: string } | undefined> {
  const real = await getSunriseSunset(date, latitude, longitude, timezoneOffsetHours);
  if (!real.sunrise || !real.sunset) return undefined;
  return {
    sunrise: localClock(real.sunrise, timezoneOffsetHours),
    sunset: localClock(real.sunset, timezoneOffsetHours),
  };
}

/** Local "HH:MM" of an instant, rounded to the minute. */
function localClock(instant: Date, timezoneOffsetHours: number): string {
  const local = new Date(instant.getTime() + timezoneOffsetHours * 3_600_000 + 30_000);
  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`;
}
