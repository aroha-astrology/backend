// =============================================================================
// Jaimini Special Points — Arudha Lagna, Upapada Lagna, Karakamsha
// =============================================================================
// Deliberately NOT included here: Varshaphala/Tajika (a full parallel system —
// Muntha, Varshesh, Tajika aspects/yogas, Patyayini/Mudda Dasha — each with its
// own rule set) and Prashna (cast for the moment a question is asked, not
// derivable from birth data at all). Shipping partial/guessed rules for either
// into a live chat-grounding path would be exactly the kind of fabricated
// specificity this module exists to avoid; they need their own dedicated,
// separately-verified effort.
//
// All formulas below are the standard Jaimini/BPHS rules, verified against
// published worked examples before being encoded (see each function's doc).
// =============================================================================

import { ZODIAC_SIGNS, SIGN_LORDS } from '@aroha-astrology/shared';
import type { Planet } from '@aroha-astrology/shared';
import { calculateD9 } from './divisionalCharts.js';

interface PlanetLongitude {
  planet: string;
  longitude: number;
}

/**
 * Jaimini sign lordship — identical rule to `jaiminiSignLord` in
 * `astro-engine/dashas/chara.ts` (Chara Dasha), re-derived here for the loose
 * `{planet, longitude}[]` shape chat-grounding.ts already uses (vs. chara.ts's
 * strict `ChartData`). Keep both in sync if the rule ever changes: standard
 * sign lords apply everywhere EXCEPT Scorpio (Mars vs. Ketu) and Aquarius
 * (Saturn vs. Rahu), where Jaimini uses whichever of the pair sits at a higher
 * degree within its sign — falling back to the traditional lord if the
 * comparison planet isn't present in the input.
 */
function jaiminiSignLord(signIndex: number, planets: PlanetLongitude[]): string {
  const sign = ZODIAC_SIGNS[signIndex]!;
  const degreeOf = (name: string): number | undefined =>
    planets.find((p) => p.planet === name)?.longitude !== undefined
      ? planets.find((p) => p.planet === name)!.longitude % 30
      : undefined;

  if (sign === 'Scorpio') {
    const mars = degreeOf('Mars');
    const ketu = degreeOf('Ketu');
    if (mars != null && ketu != null) return ketu > mars ? 'Ketu' : 'Mars';
    return 'Mars';
  }
  if (sign === 'Aquarius') {
    const saturn = degreeOf('Saturn');
    const rahu = degreeOf('Rahu');
    if (saturn != null && rahu != null) return rahu > saturn ? 'Rahu' : 'Saturn';
    return 'Saturn';
  }
  return SIGN_LORDS[sign];
}

/**
 * Arudha Pada of a given house — the "reflection" of that house, per Jaimini/
 * BPHS: count the distance from the house to its lord, then count that same
 * distance again from the lord. If the result would fall in the 1st or 7th
 * house from the source house (an Arudha can never be identical to or
 * directly opposite its source), it is displaced to the 10th/4th from the
 * source house instead.
 *
 * Verified against two published worked examples (Leo Lagna, Sun in Leo):
 * raw result = Leo itself (the 1st-from-house case) -> displaced to Taurus
 * (10th from Leo); and the 7th-from-house case -> displaced to Scorpio (4th
 * from Leo). Both check out exactly against this implementation.
 *
 * @param houseSignIndex 0-11 sign index of the house whose Arudha to compute.
 * @param planets natal planet longitudes (0-360).
 */
export function calculateArudhaPada(houseSignIndex: number, planets: PlanetLongitude[]): number {
  const lord = jaiminiSignLord(houseSignIndex, planets);
  const lordPos = planets.find((p) => p.planet === lord);
  // Fallback should not occur for the 7 classical grahas + Rahu/Ketu on any
  // real chart, but never throw on incomplete input — hold the house's own
  // sign, which the exception rule below will then correctly displace.
  const lordSignIndex = lordPos != null ? Math.floor(lordPos.longitude / 30) : houseSignIndex;

  const distance = (((lordSignIndex - houseSignIndex) % 12) + 12) % 12;
  const raw = (lordSignIndex + distance) % 12;
  const offsetFromHouse = (((raw - houseSignIndex) % 12) + 12) % 12;

  if (offsetFromHouse === 0) return (houseSignIndex + 9) % 12; // 1st from house -> 10th from house
  if (offsetFromHouse === 6) return (houseSignIndex + 3) % 12; // 7th from house -> 4th from house
  return raw;
}

/** Arudha Lagna (AL) — the Arudha Pada of the 1st house (the Ascendant). */
export function calculateArudhaLagna(ascSignIndex: number, planets: PlanetLongitude[]): number {
  return calculateArudhaPada(ascSignIndex, planets);
}

/**
 * Upapada Lagna (UL) — the Arudha Pada of the 12th house, using the same
 * general Jaimini exception rule as Arudha Lagna. Some later texts describe
 * additional UL-specific prohibited houses beyond the standard 1st/7th
 * exception; those are NOT applied here — this is the standard/generic
 * Arudha-of-12th-house method, not the union of every variant tradition.
 */
export function calculateUpapadaLagna(ascSignIndex: number, planets: PlanetLongitude[]): number {
  const twelfthHouseSignIndex = (ascSignIndex + 11) % 12;
  return calculateArudhaPada(twelfthHouseSignIndex, planets);
}

/** The seven classical Chara Karaka candidates (Rahu/Ketu excluded — the
 * standard 7-graha Atmakaraka convention; some traditions use an 8-planet
 * version including Rahu, which this does not implement). */
const ATMAKARAKA_CANDIDATES = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

/**
 * Atmakaraka — the planet with the highest degree within its own sign (0-30)
 * among the seven classical grahas. The "soul significator" in Jaimini
 * astrology.
 */
export function calculateAtmakaraka(planets: PlanetLongitude[]): string | null {
  let best: string | null = null;
  let bestDegree = -1;
  for (const name of ATMAKARAKA_CANDIDATES) {
    const pos = planets.find((p) => p.planet === name);
    if (!pos) continue;
    const degree = pos.longitude % 30;
    if (degree > bestDegree) {
      bestDegree = degree;
      best = name;
    }
  }
  return best;
}

/**
 * Karakamsha — the Navamsa (D9) sign occupied by the Atmakaraka. Traditionally
 * treated as its own Ascendant for reading the soul's ultimate direction and
 * spiritual/career purpose.
 */
export function calculateKarakamshaSignIndex(planets: PlanetLongitude[]): number | null {
  const atmakaraka = calculateAtmakaraka(planets);
  if (!atmakaraka) return null;
  const pos = planets.find((p) => p.planet === atmakaraka);
  if (!pos) return null;
  return calculateD9(pos.longitude);
}
