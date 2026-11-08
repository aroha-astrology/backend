// =============================================================================
// The ten Tajika yogas that tajika-yogas.ts does not have
// =============================================================================
// Iqbal, Induvara, Manau, Gairi-Kamboola, Khallasara, Duhphali-kuttha, Dutthottha-davira, Tambira,
// Kuttha, Durupha. Source: M.S. Mehta, Annual Horoscope (Varshaphala): Effective Predictive
// Techniques, ch. VIII "Tajak Yogas" (yogas 1, 2, 7, 9, 10, 12, 13, 14, 15, 16 of his list of sixteen).
// The yogas that ask a question use Mehta's two actors: the Lagnesh (lord of the Varsha Lagna) and
// the Karyesh (lord of the house the question is about; 7th for marriage, 10th for work, ...).
// They use the same deeptamsha orbs and the same Tajika aspect (no aspect at 2/12 or 6/8) as
// tajika-yogas.ts, so Ithasala here is that file's Ithasala.
//
// What each one means in this file (Mehta's words in quotes):
//  Iqbal     "all the planets are in kendras and panapharas"; "the lagna lord should be strong"
//            (strong = Panchavargi bala of 10 or more, Mehta's 'Pooran').
//  Induvara  "all the planets are located in apoklima houses 3, 6, 9 and 12".
//  Manau     an Ithasala whose faster planet is conjunct, or in square or opposition to, Mars or
//            Saturn (a malefic that is not one of the two). "The malefic planet spoils the good effect".
//  Gairi-Kamboola  Lagnesh and Karyesh in Ithasala, and a strong third planet (own sign or exalted)
//            in Ithasala with one of them. Mehta's other form (an unqualified Moon about to enter the
//            next sign) is NOT built.
//  Khallasara  Lagnesh and Karyesh in Ithasala, and an unqualified Moon (neither exalted nor in its
//            own sign) that is neither conjunct nor in aspect with either.
//  Duhphali-kuttha  Two planets in Ithasala; the slower is exalted or in its own sign, the faster
//            is neither, and is not retrograde or combust.
//  Dutthottha-davira  Lagnesh and Karyesh both weak and not in Ithasala with each other, and one of
//            them in Ithasala with a strong third planet (own sign or exalted). Weak = Panchavargi bala
//            under 5, or in the sign of fall.
//  Tambira   A fast planet, well placed (not in an enemy's or its fall sign), at 29 degrees or more of
//            its sign, with a slower planet that it would be in Ithasala with once it enters the next
//            sign. ("Thambisa" in the book; "Rashi-anta".)
//  Kuttha    A planet in the Lagna, aspected by a planet in its own sign or exaltation that stands in a
//            kendra or trikona (4, 5, 7, 9, 10) from the Lagna.
//  Durupha   Lagnesh and Karyesh both in 6, 8 or 12, both weak (retrograde, combust, in the sign of
//            fall or an enemy's sign; Mehta's own example is two retrograde planets), and in Ithasala.
// Fixtures: test/fixtures/mehta/mehta-yogas.json (his drawn examples). Mehta gives no orb for Manau's
// "within the deeptamsha range" clause beyond the same rule; it is read as the same mean orb.
// =============================================================================

import type { ChartData, Planet } from '@aroha-astrology/shared';
import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import { signDignity } from '../rules/dignity.js';
import { panchavargiBala } from './tajika.js';
import { COMBUST_ORB, DEEPTAMSHA, SPEED_ORDER, computeTajikaYogas, type TajikaPlanet } from './tajika-yogas.js';

export type ExtraYogaKind =
  | 'iqbal' | 'induvara' | 'manau' | 'gairi-kamboola' | 'khallasara'
  | 'duhphali-kuttha' | 'dutthottha-davira' | 'tambira' | 'kuttha' | 'durupha';

export interface ExtraYoga {
  kind: ExtraYogaKind;
  planets: TajikaPlanet[];
  /** Iqbal only: whether the Lagna lord is strong (Mehta: "the essential condition"). */
  lagneshStrong?: boolean;
  /** A reason in plain words for the facts. */
  reason?: string;
}

interface P {
  planet: TajikaPlanet;
  sign: number;
  deg: number;
  lon: number;
  retro: boolean;
  house: number;
}

const WEAK_BELOW = 5;
const STRONG_FROM = 10;

function pos(chart: ChartData): P[] {
  const out: P[] = [];
  for (const planet of SPEED_ORDER) {
    const p = chart.planets.find((x) => x.planet === planet);
    if (!p) continue;
    const lon = ((p.longitude % 360) + 360) % 360;
    const sign = Math.floor(lon / 30);
    out.push({
      planet,
      sign,
      deg: lon - sign * 30,
      lon,
      retro: planet !== 'Sun' && planet !== 'Moon' && p.isRetrograde === true,
      house: ((sign - chart.ascendant.signIndex + 12) % 12) + 1,
    });
  }
  return out;
}

const aspects = (a: P, b: P) => [1, 3, 4, 5, 7, 9, 10, 11].includes(((b.sign - a.sign + 12) % 12) + 1);
const dignity = (p: P) => signDignity(p.planet as Planet, p.sign);
const strongSign = (p: P) => ['own', 'exalted'].includes(dignity(p));
const combust = (p: P, sun: P | undefined) => {
  if (!sun || p.planet === 'Sun') return false;
  let sep = Math.abs(p.lon - sun.lon);
  if (sep > 180) sep = 360 - sep;
  const orb = COMBUST_ORB[p.planet];
  return orb !== undefined && sep <= orb;
};
const orbOf = (a: TajikaPlanet, b: TajikaPlanet) => (DEEPTAMSHA[a] + DEEPTAMSHA[b]) / 2;
const sameSet = (y: { planets: TajikaPlanet[] }, a: TajikaPlanet, b: TajikaPlanet) =>
  y.planets.includes(a) && y.planets.includes(b);

/**
 * The extra yogas of a Varsha chart. `karyeshHouse` is the house (2 to 12) the question is about;
 * without it only the chart-wide yogas (Iqbal, Induvara, Kuttha, Tambira, Manau) are looked for.
 */
export function computeExtraTajikaYogas(chart: ChartData, karyeshHouse: number | null = null): ExtraYoga[] {
  const all = pos(chart);
  const sun = all.find((p) => p.planet === 'Sun');
  const byName = (n: string) => all.find((p) => p.planet === n);
  const base = computeTajikaYogas(chart);
  const ithasalas = base.filter((y) => y.kind === 'ithasala');
  const isIthasala = (a: TajikaPlanet, b: TajikaPlanet) => ithasalas.some((y) => sameSet(y, a, b));
  const out: ExtraYoga[] = [];

  const ascSign = chart.ascendant.signIndex;
  const lagneshName = SIGN_LORDS[ZODIAC_SIGNS[ascSign]!] as TajikaPlanet;
  const lagnesh = byName(lagneshName);
  const lagneshBala = panchavargiBala(lagneshName as Planet, chart).vimsopaka;

  // Iqbal and Induvara: all seven planets by house type.
  if (all.length === 7) {
    if (all.every((p) => [1, 2, 4, 5, 7, 8, 10, 11].includes(p.house))) {
      out.push({
        kind: 'iqbal',
        planets: all.map((p) => p.planet),
        lagneshStrong: lagneshBala >= STRONG_FROM,
        reason: 'every planet is in a kendra or a panaphara',
      });
    }
    if (all.every((p) => [3, 6, 9, 12].includes(p.house))) {
      out.push({ kind: 'induvara', planets: all.map((p) => p.planet), reason: 'every planet is in an apoklima house' });
    }
  }

  // Kuttha: a planet in the Lagna, aspected by a strong planet standing in a kendra or trikona.
  const inLagna = all.filter((p) => p.house === 1);
  if (inLagna.length) {
    for (const s of all) {
      if (!strongSign(s) || ![4, 5, 7, 9, 10].includes(s.house)) continue;
      const target = inLagna.find((p) => p.planet !== s.planet);
      if (target) out.push({ kind: 'kuttha', planets: [s.planet, target.planet], reason: `${s.planet} in its own or exalted sign aspects ${target.planet} in the Lagna` });
    }
  }

  // Manau: an Ithasala whose faster planet is hit by Mars or Saturn.
  for (const y of ithasalas) {
    const fast = byName(y.planets[0]!)!;
    for (const mal of [byName('Mars'), byName('Saturn')]) {
      if (!mal || y.planets.includes(mal.planet)) continue;
      const place = ((fast.sign - mal.sign + 12) % 12) + 1; // fast counted from the malefic
      if ([1, 4, 7, 10].includes(place)) {
        out.push({ kind: 'manau', planets: [y.planets[0]!, y.planets[1]!, mal.planet], reason: `${mal.planet} spoils the Ithasala by conjunction, square or opposition` });
        break;
      }
    }
  }

  // Tambira: a fast, well-placed planet at 29 degrees or more, about to be in Ithasala in the next sign.
  for (const fast of all) {
    if (fast.deg < 29 || ['enemy', 'debilitated'].includes(dignity(fast))) continue;
    const next: P = { ...fast, sign: (fast.sign + 1) % 12, deg: 0 };
    for (const slow of all) {
      if (SPEED_ORDER.indexOf(slow.planet) <= SPEED_ORDER.indexOf(fast.planet)) continue;
      if (aspects(fast, slow) || !aspects(next, slow)) continue; // no aspect yet, but there will be
      if (slow.deg <= orbOf(fast.planet, slow.planet)) {
        out.push({ kind: 'tambira', planets: [fast.planet, slow.planet], reason: `${fast.planet} is about to leave its sign and then forms an Ithasala with ${slow.planet}` });
      }
    }
  }

  // Duhphali-kuttha is about any Ithasala pair.
  for (const y of ithasalas) {
    const fast = byName(y.planets[0]!)!;
    const slow = byName(y.planets[1]!)!;
    if (strongSign(slow) && !strongSign(fast) && !fast.retro && !combust(fast, sun)) {
      out.push({ kind: 'duhphali-kuttha', planets: [fast.planet, slow.planet], reason: `${slow.planet} is strong, ${fast.planet} is not weakened by retrogression or combustion` });
    }
  }

  // The rest ask about the Lagnesh and the Karyesh.
  if (karyeshHouse && karyeshHouse >= 2 && karyeshHouse <= 12 && lagnesh) {
    const karyeshName = SIGN_LORDS[ZODIAC_SIGNS[(ascSign + karyeshHouse - 1) % 12]!] as TajikaPlanet;
    const karyesh = byName(karyeshName);
    if (karyesh && karyeshName !== lagneshName) {
      const pair = [lagneshName, karyeshName] as TajikaPlanet[];
      const pairIthasala = isIthasala(lagneshName, karyeshName);
      const moon = byName('Moon');
      const weak = (p: P) =>
        panchavargiBala(p.planet as Planet, chart).vimsopaka < WEAK_BELOW || dignity(p) === 'debilitated';

      if (pairIthasala) {
        // Gairi-Kamboola: a strong third planet in Ithasala with one of them.
        for (const third of all) {
          if (pair.includes(third.planet) || !strongSign(third)) continue;
          if (isIthasala(third.planet, lagneshName) || isIthasala(third.planet, karyeshName)) {
            out.push({ kind: 'gairi-kamboola', planets: [...pair, third.planet], reason: 'the work is done with a third person\'s help' });
          }
        }
        // Khallasara: an unqualified Moon, neither with nor looking at either.
        if (moon && !pair.includes('Moon') && !strongSign(moon)) {
          const touches = [lagnesh, karyesh].some((p) => p.sign === moon.sign || aspects(moon, p));
          if (!touches) out.push({ kind: 'khallasara', planets: [...pair, 'Moon'], reason: 'the Moon is unqualified and keeps away from both' });
        }
      }

      if (!pairIthasala && weak(lagnesh) && weak(karyesh)) {
        for (const third of all) {
          if (pair.includes(third.planet) || !strongSign(third)) continue;
          if (isIthasala(third.planet, lagneshName) || isIthasala(third.planet, karyeshName)) {
            out.push({ kind: 'dutthottha-davira', planets: [...pair, third.planet], reason: 'both are weak, a strong third planet carries them' });
          }
        }
      }

      if (pairIthasala && [lagnesh, karyesh].every((p) => [6, 8, 12].includes(p.house))) {
        const bad = (p: P) => p.retro || combust(p, sun) || ['debilitated', 'enemy'].includes(dignity(p));
        if (bad(lagnesh) && bad(karyesh)) out.push({ kind: 'durupha', planets: pair, reason: 'both are weak and in 6, 8 or 12' });
      }
    }
  }

  return out;
}
