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
// Convention: standard visible rise/set — upper limb of the disc, with
// standard atmospheric refraction (no SE_BIT_* flags set). This is the
// conventional definition used by most public rise/set sources (distinct
// from the Hindu-specific SE_BIT_HINDU_RISING convention — geocentric,
// disc-center, no refraction — which some Panchang engines use specifically
// for sunrise-anchored tithi/nakshatra bookkeeping; this codebase's sunrise/
// sunset already comes from a separate NOAA approximation untouched by this
// change, so there is no existing swisseph-based sunrise convention to match
// here — the standard definition is the reasonable, well-documented default
// for a directly-displayed "moonrise"/"moonset" data point).

import { dateToJulianDay, getSwe } from '../calculations/planetPositions.core';

const SE_SUN = 0;
const SE_MOON = 1;
const SEFLG_SWIEPH = 2;
const SE_CALC_RISE = 1;
const SE_CALC_SET = 2;

export interface MoonRiseSet {
  /** Local HH:mm moonrise, or null if the Moon does not rise within this civil day. */
  moonrise: string | null;
  /** Local HH:mm moonset, or null if the Moon does not set within this civil day. */
  moonset: string | null;
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
 * Compute local-time moonrise and moonset for the civil day `date` falls on,
 * at (latitude, longitude). Moonrise and moonset are searched independently,
 * each starting from that day's local midnight — because the Moon rises
 * ~50 minutes later each day, roughly once a month a given civil day has no
 * moonrise (the previous day's rise is still "current" past midnight) or no
 * moonset (this day's rise doesn't set until after the next midnight). Those
 * are legitimate, real astronomical conditions, not errors — this returns
 * `null` for whichever side is absent rather than fabricating a time, and
 * never throws (any unexpected swisseph failure is treated the same way).
 *
 * @param date - Calendar date to compute for (only the Y/M/D are used — the
 *   time-of-day component of `date` is ignored; the search always starts at
 *   that date's local midnight).
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

    const [riseJd, setJd] = await Promise.all([
      riseTransUt(dayStartUt, longitude, latitude, 0, SE_CALC_RISE),
      riseTransUt(dayStartUt, longitude, latitude, 0, SE_CALC_SET),
    ]);

    return {
      moonrise: withinCivilDay(riseJd, dayStartUt)
        ? jdToLocalHHmm(swe, riseJd as number, timezoneOffsetHours)
        : null,
      moonset: withinCivilDay(setJd, dayStartUt)
        ? jdToLocalHHmm(swe, setJd as number, timezoneOffsetHours)
        : null,
    };
  } catch {
    // Never throw — moonrise/moonset is an additive data point; any
    // unexpected failure degrades to "unavailable today", not a broken page.
    return { moonrise: null, moonset: null };
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
