// =============================================================================
// KP (Krishnamurti Paddhati) — star lord and sub lord
// =============================================================================
// Parashari reads the chart; KP times it. The whole system rests on one idea:
// subdivide each nakshatra by the Vimshottari proportions, and the SUB LORD of
// a point decides whether the thing it promises actually happens. Two people
// with the same sign, same house and same nakshatra can have different sub
// lords and completely different outcomes — which is exactly the resolution
// Parashari alone cannot give.
//
// Nothing in this engine had it: one incidental `subLord` hit across the whole
// codebase before this file.
//
// The maths is deterministic and needs no new ephemeris data — a nakshatra
// spans 13°20', and each of the 9 lords owns a slice of it proportional to its
// Vimshottari years (Ketu 7, Venus 20, Sun 6, ... total 120).
// =============================================================================

import { VIMSHOTTARI_ORDER, VIMSHOTTARI_YEARS, NAKSHATRA_LORDS } from '@aroha-astrology/shared';

const NAKSHATRA_SPAN = 360 / 27; // 13 deg 20 min
const TOTAL_YEARS = 120;

export interface KpLords {
  /** The nakshatra (star) lord — the Vimshottari dasha lord of that nakshatra. */
  starLord: string;
  /** The sub lord — KP's primary decider of whether a promise fructifies. */
  subLord: string;
  /** The sub-sub lord, used for fine event timing. */
  subSubLord: string;
  nakshatraIndex: number;
}

function norm360(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Walk the Vimshottari sequence across a span, returning the lord whose slice
 * contains `offset` plus how far into that lord's own slice we landed.
 *
 * Shared by every KP level: the sub division of a nakshatra and the sub-sub
 * division of a sub obey exactly the same proportional rule, just over a
 * smaller span. Writing it once is what keeps the levels consistent.
 */
function lordAtOffset(
  startLordIndex: number,
  span: number,
  offset: number,
): { lord: string; lordIndex: number; offsetIntoLord: number; lordSpan: number } {
  let cursor = 0;
  for (let i = 0; i < VIMSHOTTARI_ORDER.length; i++) {
    const idx = (startLordIndex + i) % VIMSHOTTARI_ORDER.length;
    const lord = VIMSHOTTARI_ORDER[idx]!;
    const lordSpan = (VIMSHOTTARI_YEARS[lord] / TOTAL_YEARS) * span;
    if (offset < cursor + lordSpan || i === VIMSHOTTARI_ORDER.length - 1) {
      return { lord, lordIndex: idx, offsetIntoLord: offset - cursor, lordSpan };
    }
    cursor += lordSpan;
  }
  // Unreachable: the loop always returns on its final iteration.
  const lord = VIMSHOTTARI_ORDER[startLordIndex]!;
  return { lord, lordIndex: startLordIndex, offsetIntoLord: 0, lordSpan: span };
}

/**
 * Star lord, sub lord and sub-sub lord for any sidereal longitude.
 *
 * The star lord is the nakshatra's own Vimshottari lord. The sub lord is found
 * by dividing the nakshatra into 9 slices in Vimshottari proportion STARTING
 * FROM the star lord, and the sub-sub lord by repeating that inside the sub.
 */
export function kpLordsFor(longitude: number): KpLords {
  const lon = norm360(longitude);
  const nakshatraIndex = Math.min(Math.floor(lon / NAKSHATRA_SPAN), 26);
  const starLord = NAKSHATRA_LORDS[nakshatraIndex]!;
  const startIndex = VIMSHOTTARI_ORDER.indexOf(starLord);

  const offsetInNakshatra = lon - nakshatraIndex * NAKSHATRA_SPAN;

  const sub = lordAtOffset(startIndex, NAKSHATRA_SPAN, offsetInNakshatra);
  const subSub = lordAtOffset(sub.lordIndex, sub.lordSpan, sub.offsetIntoLord);

  return {
    starLord: String(starLord),
    subLord: String(sub.lord),
    subSubLord: String(subSub.lord),
    nakshatraIndex,
  };
}

export interface KpPlanetLords extends KpLords {
  planet: string;
}

/** KP lords for every planet in a chart. */
export function kpLordsForPlanets(
  planets: Array<{ planet: string; longitude?: number }>,
): KpPlanetLords[] {
  const out: KpPlanetLords[] = [];
  for (const p of planets) {
    const lon = Number(p.longitude ?? NaN);
    if (!Number.isFinite(lon)) continue;
    out.push({ planet: p.planet, ...kpLordsFor(lon) });
  }
  return out;
}

/**
 * The cuspal sub lord of each of the 12 house cusps — KP's answer to "will this
 * area of life deliver?".
 *
 * Takes explicit cusp longitudes. Under whole-sign these are sign boundaries,
 * which is NOT what KP intends (it is a Placidus system), so the caller decides
 * what to pass: the honest options are real Placidus cusps or the equal-bhava
 * cusps derived from the Lagna degree. Passing sign boundaries would produce
 * confident nonsense, so this function never invents them itself.
 */
export function cuspalSubLords(cuspLongitudes: number[]): Array<{ house: number } & KpLords> {
  return cuspLongitudes.slice(0, 12).map((lon, i) => ({ house: i + 1, ...kpLordsFor(lon) }));
}
