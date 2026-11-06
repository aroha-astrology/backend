// =============================================================================
// Tajika yogas in the Varsha chart: Ithasala, Ishrafa, Nakta, Yamaya, Kamboola, Radda
// =============================================================================
// Only the seven visible planets take part. Two planets are in aspect by SIGN (same sign, 3rd/11th,
// 4th/10th, 5th/9th or 7th from each other). Whether the aspect is applying or separating is read from
// the degrees inside the sign, and it counts only when the gap is inside the pair's orb (the
// mean of the two planets' orbs).
//
//  Ithasala  the faster planet is behind the slower one (smaller degree in its sign) and the
//            gap is inside the orb: the aspect is applying.
//  Ishrafa   the faster planet is ahead of the slower one (larger degree), inside the orb:
//            the aspect is separating.
//  Nakta     two planets with no Ithasala between them, and a third planet FASTER than both
//            that has an Ithasala with each of them (it carries the light).
//  Yamaya    the same, with a third planet SLOWER than both that each of them has an
//            Ithasala with (it collects the light).
//  Kamboola  an Ithasala between two planets, neither the Moon, while the Moon has an Ithasala
//            with one of them.
//  Radda     an Ithasala that is spoiled because one of its planets is retrograde, combust,
//            or in its sign of fall.
//
// SOURCES: no verse is cited, because none was opened and checked. These are the standard
// textbook definitions of the Tajika yogas as the project's plan lists them, and the orb values
// below are the usual deeptamsha figures. UNVERIFIED against JHora until the benchmark
// fixtures (backend/test/fixtures/varshik/) are recorded; the exact match is part of the
// sprint's "done when". Nothing here is claimed to match JHora yet.
// =============================================================================

import { PLANET_DEBILITATION, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { ChartData } from '@aroha-astrology/shared';

export type TajikaYogaKind = 'ithasala' | 'ishrafa' | 'nakta' | 'yamaya' | 'kamboola' | 'radda';

export type TajikaPlanet = 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn';

/** Deeptamsha (orb) of each planet, in degrees. */
export const DEEPTAMSHA: Record<TajikaPlanet, number> = {
  Sun: 15,
  Moon: 12,
  Mars: 8,
  Mercury: 7,
  Jupiter: 9,
  Venus: 7,
  Saturn: 9,
};

/** Fastest to slowest, the order that decides who is "behind" whom. */
export const SPEED_ORDER: TajikaPlanet[] = [
  'Moon',
  'Mercury',
  'Venus',
  'Sun',
  'Mars',
  'Jupiter',
  'Saturn',
];

/** Degrees from the Sun inside which a planet is combust. */
export const COMBUST_ORB: Partial<Record<TajikaPlanet, number>> = {
  Moon: 12,
  Mars: 17,
  Mercury: 14,
  Jupiter: 11,
  Venus: 10,
  Saturn: 15,
};

export interface TajikaYoga {
  kind: TajikaYogaKind;
  /** The planets forming it: [faster, slower] for a pair; [a, b, via] for Nakta/Yamaya; [a, b, Moon] for Kamboola. */
  planets: TajikaPlanet[];
  /** Gap in degrees inside the sign for a pair yoga; null for the three-planet yogas. */
  gapDeg: number | null;
  /** The Radda reason, when kind is 'radda'. */
  reason?: 'retrograde' | 'combust' | 'fall';
}

interface Pos {
  planet: TajikaPlanet;
  signIndex: number;
  degree: number;
  longitude: number;
  retrograde: boolean;
}

function positions(chart: ChartData): Pos[] {
  const out: Pos[] = [];
  for (const planet of SPEED_ORDER) {
    const p = chart.planets.find((x) => x.planet === planet);
    if (!p) continue;
    const lon = ((p.longitude % 360) + 360) % 360;
    out.push({
      planet,
      signIndex: Math.floor(lon / 30),
      degree: lon - Math.floor(lon / 30) * 30,
      longitude: lon,
      retrograde: planet !== 'Sun' && planet !== 'Moon' && p.isRetrograde === true,
    });
  }
  return out;
}

/** Same sign, or the 3rd, 4th, 5th, 7th, 9th, 10th or 11th sign from each other. */
function inAspect(a: Pos, b: Pos): boolean {
  const place = ((b.signIndex - a.signIndex + 12) % 12) + 1;
  return [1, 3, 4, 5, 7, 9, 10, 11].includes(place);
}

function orbOf(a: TajikaPlanet, b: TajikaPlanet): number {
  return (DEEPTAMSHA[a] + DEEPTAMSHA[b]) / 2;
}

/** Whether `fast` (the faster of the two) is applying (ithasala) or separating (ishrafa) to `slow`, with the gap; null if out of orb or not in aspect. */
function pairState(fast: Pos, slow: Pos): { kind: 'ithasala' | 'ishrafa'; gap: number } | null {
  if (!inAspect(fast, slow)) return null;
  const gap = Math.abs(slow.degree - fast.degree);
  if (gap > orbOf(fast.planet, slow.planet)) return null;
  return { kind: fast.degree <= slow.degree ? 'ithasala' : 'ishrafa', gap };
}

/** The pair ordered [faster, slower]. */
function ordered(a: Pos, b: Pos): [Pos, Pos] {
  return SPEED_ORDER.indexOf(a.planet) < SPEED_ORDER.indexOf(b.planet) ? [a, b] : [b, a];
}

const isIthasala = (a: Pos, b: Pos): boolean => {
  const [f, s] = ordered(a, b);
  return pairState(f, s)?.kind === 'ithasala';
};

function raddaReason(p: Pos, sun: Pos | undefined): TajikaYoga['reason'] | null {
  if (p.retrograde) return 'retrograde';
  if (sun && p.planet !== 'Sun') {
    const orb = COMBUST_ORB[p.planet];
    let sep = Math.abs(p.longitude - sun.longitude);
    if (sep > 180) sep = 360 - sep;
    if (orb !== undefined && sep <= orb) return 'combust';
  }
  const fall = PLANET_DEBILITATION[p.planet];
  if (fall && ZODIAC_SIGNS.indexOf(fall.sign) === p.signIndex) return 'fall';
  return null;
}

/** Every Tajika yoga between the seven planets of the Varsha chart. */
export function computeTajikaYogas(chart: ChartData): TajikaYoga[] {
  const all = positions(chart);
  const sun = all.find((p) => p.planet === 'Sun');
  const yogas: TajikaYoga[] = [];

  // Pair yogas: Ithasala and Ishrafa, and Radda on top of an Ithasala.
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const [fast, slow] = ordered(all[i]!, all[j]!);
      const state = pairState(fast, slow);
      if (!state) continue;
      yogas.push({ kind: state.kind, planets: [fast.planet, slow.planet], gapDeg: state.gap });
      if (state.kind === 'ithasala') {
        for (const p of [fast, slow]) {
          const reason = raddaReason(p, sun);
          if (reason) {
            yogas.push({
              kind: 'radda',
              planets: [fast.planet, slow.planet],
              gapDeg: state.gap,
              reason,
            });
            break;
          }
        }
      }
    }
  }

  const moon = all.find((p) => p.planet === 'Moon');

  // Kamboola: an Ithasala between two planets other than the Moon, with the Moon in Ithasala with one of them.
  if (moon) {
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!;
        const b = all[j]!;
        if (a.planet === 'Moon' || b.planet === 'Moon') continue;
        if (!isIthasala(a, b)) continue;
        if (isIthasala(moon, a) || isIthasala(moon, b)) {
          const [fast, slow] = ordered(a, b);
          yogas.push({ kind: 'kamboola', planets: [fast.planet, slow.planet, 'Moon'], gapDeg: null });
        }
      }
    }
  }

  // Nakta and Yamaya: a pair with no Ithasala of its own, joined by a third planet.
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const [fast, slow] = ordered(all[i]!, all[j]!);
      if (isIthasala(fast, slow)) continue;
      for (const via of all) {
        if (via.planet === fast.planet || via.planet === slow.planet) continue;
        const viaIdx = SPEED_ORDER.indexOf(via.planet);
        const fastIdx = SPEED_ORDER.indexOf(fast.planet);
        const slowIdx = SPEED_ORDER.indexOf(slow.planet);
        if (viaIdx < fastIdx && isIthasala(via, fast) && isIthasala(via, slow)) {
          yogas.push({ kind: 'nakta', planets: [fast.planet, slow.planet, via.planet], gapDeg: null });
        } else if (viaIdx > slowIdx && isIthasala(fast, via) && isIthasala(slow, via)) {
          yogas.push({ kind: 'yamaya', planets: [fast.planet, slow.planet, via.planet], gapDeg: null });
        }
      }
    }
  }

  return yogas;
}

/** The yogas that involve BOTH of two planets, e.g. the Lagna lord and the lord of the house asked about. */
export function yogasBetween(yogas: TajikaYoga[], a: string, b: string): TajikaYoga[] {
  return yogas.filter((y) => y.planets.includes(a as TajikaPlanet) && y.planets.includes(b as TajikaPlanet));
}
