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
