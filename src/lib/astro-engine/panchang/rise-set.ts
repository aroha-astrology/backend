// @ts-nocheck
// =============================================================================
// Moonrise / Moonset via Swiss Ephemeris (swe_rise_trans)
// =============================================================================
//
// IMPORTANT — do not use `SwissEph.rise_trans()` (the convenience method on
// the class itself, node_modules/swisseph-wasm/src/swisseph.js:1498). It is
// broken in the installed version (swisseph-wasm 0.0.5): it calls
//   ccall('swe_rise_trans', 'number',
//     ['number','number','number','number','number','number','pointer'],
//     [julianDay, planet, longitude, latitude, altitude, flags, resultPtr])
// — only 7 arguments — against the REAL `swe_rise_trans` C function, which
// takes 10:
//   swe_rise_trans(tjd_ut, ipl, starname, epheflag, rsmi, geopos[3],
//                   atpress, attemp, tret[10], serr)
// Calling a WASM export with fewer JS arguments than its type arity silently
// coerces the missing trailing parameters (ToInt32(undefined) = 0 for i32,
// ToNumber(undefined) = NaN for f64) — so with the 7-arg call, `longitude`
// lands in the `starname` pointer slot, `latitude` in `epheflag`, `altitude`
// in `rsmi` (i.e. rsmi=0 — no rise/set/transit bit set at all), the caller's
// own `flags` value lands in the `geopos` pointer slot, and `tret` ends up
// NULL (never even passed) — so the function returns retFlag=0 without ever
// writing a result. Verified directly: calling the 6-arg wrapper always
// returns [0,0,0,0]; calling `swe_rise_trans` via `SweModule.ccall` with the
// correct 10-arg signature below returns a Julian day matching known
// sunrise/sunset times for Delhi to within a minute, and matches an
// independently-verified tithi-boundary bisection (see boundaries.ts) to
// within a minute of a third-party reference. This module bypasses the
// broken wrapper and calls `swe_rise_trans` directly against `SweModule`,
// reusing the same `getSwe()` singleton planetPositions.core.ts uses for
// swe.calc()/swe.julday()/etc.
//
// Convention (moonrise/moonset): Drik Panchang's. The Moon rises and sets when
// the CENTRE of its disc crosses the horizon, without refraction, and the day
// runs from sunrise: the moonrise and moonset shown are the first ones after
// that day's sunrise, flagged when they fall after midnight. Checked against
// Drik for New Delhi on 20 Oct, 25 Oct and 3 Nov 2026 (a waxing, a full and a
// waning Moon), to the minute. The old convention (upper limb with refraction,
// searched from midnight) ran ~4 minutes early and, after midnight, showed the
// PREVIOUS night's moonset (00:29 where Drik shows 01:22 the next morning).
// Sunrise/sunset below keep the standard upper limb with refraction.

import { dateToJulianDay, getSwe } from '../calculations/planetPositions.core';

const SE_SUN = 0;
const SE_MOON = 1;
const SEFLG_SWIEPH = 2;
const SE_CALC_RISE = 1;
const SE_CALC_SET = 2;
const SE_BIT_DISC_CENTER = 256;
const SE_BIT_NO_REFRACTION = 512;
/** Drik Panchang's moonrise: the disc's centre on the horizon, no refraction. */
const MOON_RISE_SET_BITS = SE_BIT_DISC_CENTER | SE_BIT_NO_REFRACTION;

export interface MoonRiseSet {
  /** Local HH:mm of the first moonrise after this day's sunrise, or null if none before the next. */
  moonrise: string | null;
  /** Local HH:mm of the first moonset after this day's sunrise, or null if none before the next. */
  moonset: string | null;
  /** The moonrise falls after midnight, on the next calendar date. */
  moonriseNextDay: boolean;
  /** The moonset falls after midnight, on the next calendar date. */
  moonsetNextDay: boolean;
}

/**
 * Low-level `swe_rise_trans` call using the REAL Swiss Ephemeris C signature
 * (see the module header for why `SwissEph.rise_trans()` can't be used).
 *
 * @returns The found event's Julian day (UT), or null if swisseph reported
 *   an error (retFlag < 0) — e.g. no crossing found in the internal search
 *   window it uses, which for the Moon at Indian latitudes only happens when
 *   the true event falls outside the ~30h window we constrain below.
 */
async function riseTransUt(
  tjdUt: number,
  longitude: number,
  latitude: number,
  altitudeMeters: number,
  rsmi: number,
  planet: number = SE_MOON,
): Promise<number | null> {
  const swe = await getSwe();
  const M = swe.SweModule;

  const geoposPtr = M._malloc(3 * 8);
  const tretPtr = M._malloc(10 * 8);
  const serrPtr = M._malloc(256);

  try {
    M.HEAPF64[(geoposPtr >> 3) + 0] = longitude;
    M.HEAPF64[(geoposPtr >> 3) + 1] = latitude;
    M.HEAPF64[(geoposPtr >> 3) + 2] = altitudeMeters;

    const retFlag = M.ccall(
      'swe_rise_trans',
      'number',
      [
        'number', // tjd_ut
        'number', // ipl
        'number', // starname (0 = NULL -> use `ipl`, not a fixed star)
        'number', // epheflag
        'number', // rsmi
        'pointer', // geopos[3] (lon, lat, alt)
        'number', // atpress (0 -> swisseph derives standard pressure from altitude)
        'number', // attemp (0 -> standard atmospheric temperature)
        'pointer', // tret[10] (out)
        'pointer', // serr (out, unused)
      ],
      [tjdUt, planet, 0, SEFLG_SWIEPH, rsmi, geoposPtr, 0, 0, tretPtr, serrPtr],
    );

    if (retFlag < 0) return null;
    return M.HEAPF64[tretPtr >> 3];
  } finally {
    M._free(geoposPtr);
    M._free(tretPtr);
    M._free(serrPtr);
  }
}

/** True if `jd` (UT) falls within [dayStartUt, dayStartUt + 1) — i.e. the same civil day the search started from. */
function withinCivilDay(jd: number | null, dayStartUt: number): boolean {
  return jd !== null && jd >= dayStartUt && jd < dayStartUt + 1;
}

/** Converts a UT Julian day into a local "HH:mm" string for the given civil UTC offset. */
function jdToLocalHHmm(swe: any, jdUt: number, timezoneOffsetHours: number): string {
  const rev = swe.revjul(jdUt, 1); // Gregorian calendar; { year, month, day, hour } in UT
  const localHour = (((rev.hour + timezoneOffsetHours) % 24) + 24) % 24;
  let h = Math.floor(localHour);
  let m = Math.round((localHour - h) * 60);
  if (m === 60) {
    m = 0;
    h = (h + 1) % 24;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Compute local-time moonrise and moonset for the panchang day `date` falls
 * on, at (latitude, longitude): the first of each after that day's sunrise
 * (the Hindu day runs sunrise to sunrise), as Drik Panchang shows them. Either
 * can fall after midnight (flagged *NextDay), and either can be missing: the
 * Moon rises ~50 minutes later each day, so about once a month a day has no
 * moonrise or no moonset before the next sunrise. That is real, not an error —
 * this returns `null` for the absent side rather than fabricating a time, and
 * never throws (any unexpected swisseph failure is treated the same way).
 * Where the Sun does not rise (polar), the day starts at local midnight.
 *
 * @param date - Calendar date to compute for (only the Y/M/D are used — the
 *   time-of-day component of `date` is ignored).
 * @param latitude - Geographic latitude.
 * @param longitude - Geographic longitude.
 * @param timezoneOffsetHours - Civil UTC offset in hours (e.g. 5.5 for IST) —
 *   see calculateFullPanchang's doc comment in index.ts for why this can't be
 *   derived from longitude alone.
 */
export async function getMoonriseMoonset(
  date: Date,
  latitude: number,
  longitude: number,
  timezoneOffsetHours: number,
): Promise<MoonRiseSet> {
  try {
    const swe = await getSwe();

    // Julian day (UT) of this civil day's local midnight.
    const dayStartUt = await dateToJulianDay(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      0,
      0,
      timezoneOffsetHours,
    );

    const sunriseJd = await riseTransUt(dayStartUt, longitude, latitude, 0, SE_CALC_RISE, SE_SUN);
    const from = withinCivilDay(sunriseJd, dayStartUt) ? (sunriseJd as number) : dayStartUt;

    const [riseJd, setJd] = await Promise.all([
      riseTransUt(from, longitude, latitude, 0, SE_CALC_RISE | MOON_RISE_SET_BITS),
      riseTransUt(from, longitude, latitude, 0, SE_CALC_SET | MOON_RISE_SET_BITS),
    ]);
    // Before the next sunrise, i.e. within this panchang day.
    const inDay = (jd: number | null): jd is number => jd !== null && jd >= from && jd < from + 1;

    return {
      moonrise: inDay(riseJd) ? jdToLocalHHmm(swe, riseJd, timezoneOffsetHours) : null,
      moonset: inDay(setJd) ? jdToLocalHHmm(swe, setJd, timezoneOffsetHours) : null,
      moonriseNextDay: inDay(riseJd) && riseJd >= dayStartUt + 1,
      moonsetNextDay: inDay(setJd) && setJd >= dayStartUt + 1,
    };
  } catch {
    // Never throw — moonrise/moonset is an additive data point; any
    // unexpected failure degrades to "unavailable today", not a broken page.
    return { moonrise: null, moonset: null, moonriseNextDay: false, moonsetNextDay: false };
  }
}

export interface SunTimes {
  sunrise: Date | null;
  sunset: Date | null;
}

/** UT Julian day -> JS Date (UTC instant). 2440587.5 = the Unix epoch as a JD. */
export function jdToDate(jdUt: number): Date {
  return new Date((jdUt - 2440587.5) * 86_400_000);
}

/**
 * Real swisseph-derived sunrise/sunset as precise UTC instants (not display
 * strings — see getMoonriseMoonset for that) for the civil day `date` falls
 * on. Needed wherever a downstream calculation must interpolate WITHIN the
 * sunrise-to-sunset span (e.g. Pancha Pakshi Yama boundaries,
 * panchapakshi/yamas.ts) rather than just display a time-of-day.
 *
 * Deliberately NOT the NOAA closed-form approximation in panchang/index.ts's
 * `estimateSunriseSunset` — that function is a documented, separate
 * approximation used elsewhere in the Panchang pipeline; anything that needs
 * sub-day precision derived FROM the sunrise/sunset instant should use this
 * swisseph path instead, the same way moonrise/moonset already does.
 */
export async function getSunriseSunset(
  date: Date,
  latitude: number,
  longitude: number,
  timezoneOffsetHours: number,
): Promise<SunTimes> {
  try {
    const dayStartUt = await dateToJulianDay(
      date.getFullYear(),
      date.getMonth() + 1,
      date.getDate(),
      0,
      0,
      timezoneOffsetHours,
    );

    const [riseJd, setJd] = await Promise.all([
      riseTransUt(dayStartUt, longitude, latitude, 0, SE_CALC_RISE, SE_SUN),
      riseTransUt(dayStartUt, longitude, latitude, 0, SE_CALC_SET, SE_SUN),
    ]);

    return {
      sunrise: withinCivilDay(riseJd, dayStartUt) ? jdToDate(riseJd as number) : null,
      sunset: withinCivilDay(setJd, dayStartUt) ? jdToDate(setJd as number) : null,
    };
  } catch {
    return { sunrise: null, sunset: null };
  }
}
