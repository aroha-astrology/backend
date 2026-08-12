// @ts-nocheck
// =============================================================================
// Eclipse (Grahan) dates via Swiss Ephemeris
// =============================================================================
//
// IMPORTANT — do not use `SwissEph.sol_eclipse_when_glob()` / `.lun_eclipse_when()`
// (the convenience methods on the class itself,
// node_modules/swisseph-wasm/src/swisseph.js:1279, 1321). They are broken in
// the installed version (swisseph-wasm 0.0.5) the same way `rise_trans()` is
// broken — see this folder's rise-set.ts header for the full story. They call:
//   ccall('swe_sol_eclipse_when_glob', 'number',
//     ['number','number','number','number','pointer'],
//     [julianDayStart, flags, eclipseType, backward, resultPtr])
// — 5 arguments — against the REAL `swe_sol_eclipse_when_glob` C function,
// which takes 6:
//   swe_sol_eclipse_when_glob(tjd_start, ifl, ifltype, tret, backward, serr)
// `tret` (the output array) and `backward` are swapped in the wrapper, and
// `serr` is missing entirely. Verified directly: calling the class method
// always returns [0,0,0,0,0,0,0,0]; calling `swe_sol_eclipse_when_glob` /
// `swe_lun_eclipse_when` via `SweModule.ccall` with the correct 6-arg
// signature below returns the known 2026-08-12 total solar eclipse
// (Greenland/Iceland/Spain) and the known 2026-08-28 total lunar eclipse.
// Same bug class as rise_trans, same fix: bypass the class wrapper and call
// the C function directly, reusing the `getSwe()` singleton
// planetPositions.core.ts uses for swe.calc()/swe.julday()/etc.
//
// `tret[0]` is "time of maximum eclipse" for both functions per the Swiss
// Ephemeris programmer's docs — the rest of `tret` (contact times, etc.) is
// unused here; we only need the headline date.

import { dateToJulianDay, getSwe } from '../calculations/planetPositions.core';
import { jdToDate } from './rise-set';

const SEFLG_SWIEPH = 2;
const ECLIPSE_TYPE_ANY = 0;
const SEARCH_FORWARD = 0;

export interface NextEclipses {
  /** UTC instant of maximum solar eclipse — a global event, not location-specific. */
  solar: Date;
  /** UTC instant of maximum lunar eclipse — a global event, not location-specific. */
  lunar: Date;
}

/**
 * Shared malloc/ccall/free for both eclipse functions — same `tret[10]` /
 * `serr[256]` out-param shape for `swe_sol_eclipse_when_glob` and
 * `swe_lun_eclipse_when`.
 *
 * ponytail: eclipse TYPE (total/partial/annular/penumbral) is available in
 * the C return flag but discarded here — only the date is needed for chat
 * grounding today. Add via `sol_eclipse_how`/`lun_eclipse_how` at the
 * returned JD if a "what kind of eclipse" question shows up.
 */
async function eclipseMaxJd(cFunctionName: string, tjdStart: number): Promise<number | null> {
  const swe = await getSwe();
  const M = swe.SweModule;

  const tretPtr = M._malloc(10 * 8);
  const serrPtr = M._malloc(256);
  try {
    const retFlag = M.ccall(
      cFunctionName,
      'number',
      ['number', 'number', 'number', 'pointer', 'number', 'pointer'],
      [tjdStart, SEFLG_SWIEPH, ECLIPSE_TYPE_ANY, tretPtr, SEARCH_FORWARD, serrPtr],
    );
    if (retFlag < 0) return null;
    return M.HEAPF64[tretPtr >> 3];
  } finally {
    M._free(tretPtr);
    M._free(serrPtr);
  }
}

/**
 * Same malloc/ccall/free shape as `eclipseMaxJd` above, but for the
 * location-aware `swe_sol_eclipse_when_loc` / `swe_lun_eclipse_when_loc` —
 * the next eclipse of that kind actually visible from (latitude, longitude),
 * not just anywhere on Earth. Their JS wrapper
 * (node_modules/swisseph-wasm/src/swisseph.js) has the same bug class
 * documented in this file's header: the real C signature is
 *   swe_sol/lun_eclipse_when_loc(tjd_start, ifl, geopos[3], tret[10],
 *                                 attr[20], backward, serr)
 * — 7 params, 4 of them pointers (geopos, tret, attr, serr) — but the
 * wrapper passes longitude/latitude/altitude as three bare numbers instead
 * of a geopos array and provides only one output pointer, so every
 * downstream pointer arg lands misaligned. Bypassing it the same way.
 */
async function eclipseMaxJdLoc(
  cFunctionName: string,
  tjdStart: number,
  latitude: number,
  longitude: number,
): Promise<number | null> {
  const swe = await getSwe();
  const M = swe.SweModule;

  const geoposPtr = M._malloc(3 * 8);
  const tretPtr = M._malloc(10 * 8);
  const attrPtr = M._malloc(20 * 8);
  const serrPtr = M._malloc(256);
  try {
    M.HEAPF64[(geoposPtr >> 3) + 0] = longitude;
    M.HEAPF64[(geoposPtr >> 3) + 1] = latitude;
    M.HEAPF64[(geoposPtr >> 3) + 2] = 0; // altitude — sea level is close enough for "is it visible at all"

    const retFlag = M.ccall(
      cFunctionName,
      'number',
      ['number', 'number', 'pointer', 'pointer', 'pointer', 'number', 'pointer'],
      [tjdStart, SEFLG_SWIEPH, geoposPtr, tretPtr, attrPtr, SEARCH_FORWARD, serrPtr],
    );
    if (retFlag < 0) return null;
    return M.HEAPF64[tretPtr >> 3];
  } finally {
    M._free(geoposPtr);
    M._free(tretPtr);
    M._free(attrPtr);
    M._free(serrPtr);
  }
}

export interface LocalEclipses {
  /** UTC instant of the next solar eclipse actually visible from this location. */
  solar: Date;
  /** UTC instant of the next lunar eclipse actually visible from this location. */
  lunar: Date;
}

async function computeLocalEclipses(latitude: number, longitude: number): Promise<LocalEclipses> {
  const now = new Date();
  const startJd = await dateToJulianDay(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    0,
  );

  const [solarJd, lunarJd] = await Promise.all([
    eclipseMaxJdLoc('swe_sol_eclipse_when_loc', startJd, latitude, longitude),
    eclipseMaxJdLoc('swe_lun_eclipse_when_loc', startJd, latitude, longitude),
  ]);

  if (solarJd == null || lunarJd == null) {
    throw new Error('swisseph local eclipse search returned no result');
  }

  return { solar: jdToDate(solarJd), lunar: jdToDate(lunarJd) };
}

/**
 * One entry per rounded location (~11km — eclipse visibility bands are
 * hundreds of km wide, so this loses no meaningful precision while letting
 * every user in the same city share a cache entry), refreshed once per IST
 * day. Bounded by the number of distinct cities in use, not by call volume.
 */
const localCache = new Map<string, { day: string; value: Promise<LocalEclipses> }>();

/**
 * The next solar and next lunar eclipse actually visible from
 * (latitude, longitude) — unlike `nextEclipses` above, which is the next
 * eclipse anywhere on Earth. Same not-cached-on-failure contract: a
 * transient swisseph error doesn't poison the cache for the rest of the day.
 */
export function localEclipses(latitude: number, longitude: number): Promise<LocalEclipses> {
  const day = todayIstKey();
  const key = `${latitude.toFixed(1)},${longitude.toFixed(1)}`;
  const cached = localCache.get(key);
  if (cached && cached.day === day) return cached.value;

  const value = computeLocalEclipses(latitude, longitude).catch((err) => {
    if (localCache.get(key)?.value === value) localCache.delete(key);
    throw err;
  });
  localCache.set(key, { day, value });
  return value;
}

async function computeNextEclipses(): Promise<NextEclipses> {
  const now = new Date();
  const startJd = await dateToJulianDay(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    now.getUTCDate(),
    now.getUTCHours(),
    now.getUTCMinutes(),
    0,
  );

  const [solarJd, lunarJd] = await Promise.all([
    eclipseMaxJd('swe_sol_eclipse_when_glob', startJd),
    eclipseMaxJd('swe_lun_eclipse_when', startJd),
  ]);

  if (solarJd == null || lunarJd == null) {
    throw new Error('swisseph eclipse search returned no result');
  }

  return { solar: jdToDate(solarJd), lunar: jdToDate(lunarJd) };
}

/** IST calendar day, `en-CA` locale trick for a stable YYYY-MM-DD key — matches the idiom used for chat's `todayIST`. */
function todayIstKey(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

let cache: { day: string; value: Promise<NextEclipses> } | null = null;

/**
 * The next solar and next lunar eclipse from now, computed once per IST day
 * and memoized (module-level singleton, matches this module's process-wide
 * `getSwe()` engine) — the answer only changes when an eclipse passes, and
 * this is read on every chat turn. A failed computation is NOT cached — a
 * transient swisseph error shouldn't blank out eclipse facts for the rest
 * of the day; the next call just retries.
 */
export function nextEclipses(): Promise<NextEclipses> {
  const day = todayIstKey();
  if (!cache || cache.day !== day) {
    const value = computeNextEclipses().catch((err) => {
      if (cache?.value === value) cache = null;
      throw err;
    });
    cache = { day, value };
  }
  return cache.value;
}
