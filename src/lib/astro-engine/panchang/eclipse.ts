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
// Ephemeris programmer's docs. Since Varshik C5 (2026-11-09) the TYPE and
// MAGNITUDE are kept too (from the C return flag and *_how), and the local
// circumstances (contacts, visibility, Sutak) come from *_when_loc, all
// through the same direct-ccall bypass. One module for chat, Calendar,
// Decide and every report (fix-once).

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
  /** The same two eclipses with their type and magnitude (C5). */
  solarEvent: EclipseEvent;
  lunarEvent: EclipseEvent;
}

/** One global eclipse search result: the C return flag and the 10 tret values. */
interface GlobalHit {
  flag: number;
  tret: number[];
}

/**
 * Shared malloc/ccall/free for both eclipse functions — same `tret[10]` /
 * `serr[256]` out-param shape for `swe_sol_eclipse_when_glob` and
 * `swe_lun_eclipse_when`. Returns the C return flag (eclipse type bits) and tret.
 */
async function eclipseGlobal(cFunctionName: string, tjdStart: number): Promise<GlobalHit | null> {
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
    const tret = Array.from({ length: 10 }, (_, i) => M.HEAPF64[(tretPtr >> 3) + i]);
    return { flag: retFlag, tret };
  } finally {
    M._free(tretPtr);
    M._free(serrPtr);
  }
}

async function eclipseMaxJd(cFunctionName: string, tjdStart: number): Promise<number | null> {
  const hit = await eclipseGlobal(cFunctionName, tjdStart);
  return hit ? hit.tret[0] : null;
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

  const [solarHit, lunarHit] = await Promise.all([
    eclipseGlobal('swe_sol_eclipse_when_glob', startJd),
    eclipseGlobal('swe_lun_eclipse_when', startJd),
  ]);

  if (solarHit == null || lunarHit == null) {
    throw new Error('swisseph eclipse search returned no result');
  }

  const [solarEvent, lunarEvent] = await Promise.all([
    describeGlobal('solar', solarHit),
    describeGlobal('lunar', lunarHit),
  ]);
  return { solar: solarEvent.at, lunar: lunarEvent.at, solarEvent, lunarEvent };
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

// -----------------------------------------------------------------------------
// Type, magnitude, local circumstances, Grahan class and Sutak (Varshik C5)
// -----------------------------------------------------------------------------
// Swiss Ephemeris return-flag bits (swephexp.h).
const SE_ECL_TOTAL = 4;
const SE_ECL_ANNULAR = 8;
const SE_ECL_PARTIAL = 16;
const SE_ECL_ANNULAR_TOTAL = 32;
const SE_ECL_PENUMBRAL = 64;
const SE_ECL_VISIBLE = 128;

export type EclipseSubtype = 'total' | 'annular' | 'hybrid' | 'partial' | 'penumbral';

export interface EclipseEvent {
  kind: 'solar' | 'lunar';
  /** UTC instant of maximum eclipse (a global event). */
  at: Date;
  /** Total, annular, hybrid (annular-total), partial, or penumbral (lunar only). */
  subtype: EclipseSubtype;
  /**
   * Solar: the eclipse magnitude at greatest eclipse (fraction of the Sun's diameter covered; above
   * 1 for a total). Lunar: the UMBRAL magnitude (0 or below for a penumbral eclipse).
   */
  magnitude: number;
  /** Lunar only: the penumbral magnitude. */
  penumbralMagnitude?: number;
  /** First and last contact anywhere on Earth (lunar: the penumbral contacts P1 and P4). */
  startsAt: Date;
  endsAt: Date;
}

function subtypeOf(flag: number): EclipseSubtype {
  if (flag & SE_ECL_ANNULAR_TOTAL) return 'hybrid';
  if (flag & SE_ECL_TOTAL) return 'total';
  if (flag & SE_ECL_ANNULAR) return 'annular';
  if (flag & SE_ECL_PARTIAL) return 'partial';
  if (flag & SE_ECL_PENUMBRAL) return 'penumbral';
  return 'partial';
}

const jdOf = (d: Date) => d.getTime() / 86_400_000 + 2440587.5;

/** swe_sol_eclipse_where (tjd, ifl, geopos[10] out, attr[20], serr) or swe_lun_eclipse_how (tjd, ifl, geopos[3] in, attr[20], serr). */
async function eclipseAttr(
  cFunctionName: 'swe_sol_eclipse_where' | 'swe_lun_eclipse_how',
  tjd: number,
  geo: [number, number] = [0, 0],
): Promise<{ flag: number; attr: number[] } | null> {
  const swe = await getSwe();
  const M = swe.SweModule;
  const geoposPtr = M._malloc(10 * 8);
  const attrPtr = M._malloc(20 * 8);
  const serrPtr = M._malloc(256);
  try {
    M.HEAPF64[(geoposPtr >> 3) + 0] = geo[0];
    M.HEAPF64[(geoposPtr >> 3) + 1] = geo[1];
    M.HEAPF64[(geoposPtr >> 3) + 2] = 0;
    const flag = M.ccall(
      cFunctionName,
      'number',
      ['number', 'number', 'pointer', 'pointer', 'pointer'],
      [tjd, SEFLG_SWIEPH, geoposPtr, attrPtr, serrPtr],
    );
    if (flag < 0) return null;
    return { flag, attr: Array.from({ length: 11 }, (_, i) => M.HEAPF64[(attrPtr >> 3) + i]) };
  } finally {
    M._free(geoposPtr);
    M._free(attrPtr);
    M._free(serrPtr);
  }
}

async function describeGlobal(kind: 'solar' | 'lunar', hit: GlobalHit): Promise<EclipseEvent> {
  const maxJd = hit.tret[0]!;
  const subtype = subtypeOf(hit.flag);
  if (kind === 'solar') {
    const where = await eclipseAttr('swe_sol_eclipse_where', maxJd);
    return {
      kind,
      at: jdToDate(maxJd),
      subtype,
      magnitude: where ? where.attr[8]! : NaN,
      startsAt: jdToDate(hit.tret[2]!),
      endsAt: jdToDate(hit.tret[3]!),
    };
  }
  const how = await eclipseAttr('swe_lun_eclipse_how', maxJd);
  return {
    kind,
    at: jdToDate(maxJd),
    subtype,
    magnitude: how ? how.attr[0]! : NaN,
    penumbralMagnitude: how ? how.attr[1]! : undefined,
    startsAt: jdToDate(hit.tret[6]!),
    endsAt: jdToDate(hit.tret[7]!),
  };
}

/**
 * Every solar and lunar eclipse whose maximum falls in `[from, to)`, in time
 * order, with its type and magnitude: the Calendar's, Decide's and the
 * reports' eclipse source. Walks forward with the same swe_*_eclipse_when
 * search `nextEclipses()` uses, one eclipse at a time.
 */
export async function eclipsesBetween(from: Date, to: Date): Promise<EclipseEvent[]> {
  const out: EclipseEvent[] = [];
  const endMs = to.getTime();
  for (const [kind, fn] of [
    ['solar', 'swe_sol_eclipse_when_glob'],
    ['lunar', 'swe_lun_eclipse_when'],
  ] as const) {
    let cursor = await dateToJulianDay(
      from.getUTCFullYear(),
      from.getUTCMonth() + 1,
      from.getUTCDate(),
      from.getUTCHours(),
      from.getUTCMinutes(),
      0,
    );
    // Eclipses of one kind are at least ~5 months apart; a year never holds more than a handful.
    for (let i = 0; i < 8; i++) {
      const hit = await eclipseGlobal(fn, cursor);
      if (!hit) break;
      const jd = hit.tret[0]!;
      const at = jdToDate(jd);
      if (at.getTime() >= endMs) break;
      if (at.getTime() >= from.getTime()) out.push(await describeGlobal(kind, hit));
      cursor = jd + 1;
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export interface EclipsePlace {
  /** Shown to the reader, e.g. "Delhi". */
  name: string;
  lat: number;
  lon: number;
}

/** The India-wide summary: five major cities spread north, west, east and south. */
export const INDIA_ECLIPSE_CITIES: EclipsePlace[] = [
  { name: 'Delhi', lat: 28.6139, lon: 77.209 },
  { name: 'Mumbai', lat: 19.076, lon: 72.8777 },
  { name: 'Kolkata', lat: 22.5726, lon: 88.3639 },
  { name: 'Chennai', lat: 13.0827, lon: 80.2707 },
  { name: 'Bengaluru', lat: 12.9716, lon: 77.5946 },
];

export interface LocalEclipse {
  place: EclipsePlace;
  /** Some part of the eclipse is seen here (lunar: the umbral, naked-eye part, with the Moon up). */
  visible: boolean;
  /** Visible start and end here: contacts clipped to rise and set. Null when not visible. */
  fromAt: Date | null;
  toAt: Date | null;
  /** Solar: the magnitude seen here (fraction of the Sun's diameter covered). Lunar: the umbral magnitude. */
  magnitude: number | null;
  /** Solar: the fraction of the Sun's disc covered at local maximum. */
  obscuration: number | null;
}

/**
 * The local circumstances of ONE eclipse (found by eclipsesBetween) at one place. Runs the
 * location-aware search from a day before the global maximum; a hit whose maximum is more than
 * half a day from the global one is a different eclipse, so this one is not seen there.
 * Lunar: only the umbral phase counts as seen (a penumbral shading is not visible to the naked eye),
 * and the times are the umbral contacts clipped to moonrise and moonset.
 */
export async function localEclipseAt(e: EclipseEvent, place: EclipsePlace): Promise<LocalEclipse> {
  const none: LocalEclipse = { place, visible: false, fromAt: null, toAt: null, magnitude: null, obscuration: null };
  if (e.kind === 'lunar' && e.subtype === 'penumbral') return none;

  const swe = await getSwe();
  const M = swe.SweModule;
  const maxJd = jdOf(e.at);
  const fn = e.kind === 'solar' ? 'swe_sol_eclipse_when_loc' : 'swe_lun_eclipse_when_loc';
  const geoposPtr = M._malloc(3 * 8);
  const tretPtr = M._malloc(10 * 8);
  const attrPtr = M._malloc(20 * 8);
  const serrPtr = M._malloc(256);
  let t: number[];
  let attr: number[];
  try {
    M.HEAPF64[(geoposPtr >> 3) + 0] = place.lon;
    M.HEAPF64[(geoposPtr >> 3) + 1] = place.lat;
    M.HEAPF64[(geoposPtr >> 3) + 2] = 0;
    const flag = M.ccall(
      fn,
      'number',
      ['number', 'number', 'pointer', 'pointer', 'pointer', 'number', 'pointer'],
      [maxJd - 1, SEFLG_SWIEPH, geoposPtr, tretPtr, attrPtr, SEARCH_FORWARD, serrPtr],
    );
    if (flag < 0 || !(flag & SE_ECL_VISIBLE)) return none;
    t = Array.from({ length: 10 }, (_, i) => M.HEAPF64[(tretPtr >> 3) + i]);
    attr = Array.from({ length: 11 }, (_, i) => M.HEAPF64[(attrPtr >> 3) + i]);
  } finally {
    M._free(geoposPtr);
    M._free(tretPtr);
    M._free(attrPtr);
    M._free(serrPtr);
  }
  if (Math.abs(t[0]! - maxJd) > 0.5) return none;

  if (e.kind === 'solar') {
    // tret: 1 first contact, 4 fourth contact, 5 sunrise, 6 sunset (set only when inside the eclipse).
    let from = t[1]!;
    let to = t[4]!;
    if (t[5]! > from && t[5]! < to) from = t[5]!;
    if (t[6]! > from && t[6]! < to) to = t[6]!;
    return { place, visible: true, fromAt: jdToDate(from), toAt: jdToDate(to), magnitude: attr[0]!, obscuration: attr[2]! };
  }
  // Lunar: 2/3 umbral (partial) begin/end, 8 moonrise, 9 moonset (set only when inside the eclipse).
  if (!(t[2]! > 0)) return none;
  let from = t[2]!;
  let to = t[3]!;
  if (t[8]! > from && t[8]! < to) from = t[8]!;
  if (t[9]! > from && t[9]! < to) to = t[9]!;
  if (!(to > from)) return none;
  // The Moon must be up during the umbral part: its altitude at the clipped midpoint.
  const how = await eclipseAttr('swe_lun_eclipse_how', (from + to) / 2, [place.lon, place.lat]);
  if (how && how.attr[5]! < 0) return none;
  return { place, visible: true, fromAt: jdToDate(from), toAt: jdToDate(to), magnitude: e.magnitude, obscuration: null };
}

/** Grahan (umbral and seen), Upachchaya (penumbral: no Sutak, many Panchangs omit it), or not visible. */
export type EclipseClass = 'grahan' | 'upachchaya' | 'not_visible';

/** Sutak before local first contact: solar 12 hours (4 prahar), lunar 9 hours (3 prahar). */
export const SUTAK_HOURS = { solar: 12, lunar: 9 } as const;

export interface ClassifiedEclipse extends EclipseEvent {
  class: EclipseClass;
  /** 'reader' = the reader's own current location; 'india' = the five-city summary. */
  scope: 'reader' | 'india';
  /** One row per place looked at (one for the reader, five for India). */
  local: LocalEclipse[];
  /** Grahan only: when Sutak starts (local first contact minus 12 or 9 hours) and ends (local last contact), per visible place. */
  sutak: Array<{ place: string; fromAt: Date; toAt: Date }>;
  /** Only a Grahan may act as a personal trigger in scoring or text; Upachchaya and unseen eclipses never do. */
  personalTrigger: boolean;
}

/**
 * Classifies an eclipse for the places given. A penumbral lunar eclipse is Upachchaya when the Moon
 * is above the horizon at one of the places at maximum, else not visible; a solar or umbral lunar
 * eclipse is a Grahan when it is seen at one of the places. Never pass the birth place here: an
 * eclipse is seen where the reader lives now.
 */
export async function classifyEclipse(
  e: EclipseEvent,
  places: EclipsePlace[],
  scope: 'reader' | 'india',
): Promise<ClassifiedEclipse> {
  let local = await Promise.all(places.map((p) => localEclipseAt(e, p)));
  let klass: EclipseClass;
  if (e.subtype === 'penumbral') {
    // Upachchaya: only a faint shading, so "visible" here means the Moon is above the horizon at
    // maximum, and the times are the penumbral contacts. It never earns Sutak (below).
    const up = await Promise.all(
      places.map(async (p) => {
        const how = await eclipseAttr('swe_lun_eclipse_how', jdOf(e.at), [p.lon, p.lat]);
        return how ? how.attr[5]! > 0 : false;
      }),
    );
    local = places.map((place, i) =>
      up[i]
        ? { place, visible: true, fromAt: e.startsAt, toAt: e.endsAt, magnitude: e.penumbralMagnitude ?? null, obscuration: null }
        : local[i]!,
    );
    klass = up.some(Boolean) ? 'upachchaya' : 'not_visible';
  } else {
    klass = local.some((l) => l.visible) ? 'grahan' : 'not_visible';
  }
  const sutak =
    klass === 'grahan'
      ? local
          .filter((l) => l.visible && l.fromAt && l.toAt)
          .map((l) => ({
            place: l.place.name,
            fromAt: new Date(l.fromAt!.getTime() - SUTAK_HOURS[e.kind] * 3_600_000),
            toAt: l.toAt!,
          }))
      : [];
  return { ...e, class: klass, scope, local, sutak, personalTrigger: klass === 'grahan' };
}
