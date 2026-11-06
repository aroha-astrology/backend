// =============================================================================
// Saham activation windows — when a transiting planet sits on a Saham point
// =============================================================================
// For each Saham and each triggering planet (transiting Sun, Mars, Mercury, Venus, the Year
// Lord and the Muntha lord) the module finds every stretch of time the planet is within
// `orbDeg` of the Saham point, and the STRENGTH of that stretch:
//
//     strength = (integral over the stretch of proximity, in days) x lord bonus
//     proximity = 1 - |distance| / orb        (1 on the point, 0 at the edge of the orb)
//
// The strength is already "how long, and how close, the planet stayed": a slow planet, a
// station, or a retrograde triple pass spends more time in the orb and so scores more. It is
// NOT divided by the planet's speed, which would count that a second time.
//
// The lord bonus (SAHAM_WINDOW_CONFIG.lordBonus, starting at 1.35) applies when the transiting
// planet is the lord of the sign the Saham is in.
//
// NOT BUILT, and OFF: the extra bonus for an applying Tajika aspect between the transiting
// planet and the Saham lord's transit position (config.ithasalaWithSahamLord.enabled stays
// false until it has been checked against examples).
// =============================================================================

import type { Ayanamsa } from '@aroha-astrology/shared';
import { jdFromDate } from '../../astro-tools/transit-events.js';
import { calculatePlanetPositions } from '../calculations/planetPositions.js';
import type { SahamResult } from './sahams.js';

export const SAHAM_WINDOW_CONFIG = {
  /** Degrees either side of the Saham point that count as "active". */
  orbDeg: 3,
  /** Multiplier when the transiting planet rules the sign the Saham is in. */
  lordBonus: 1.35,
  /** Sampling step in days (a Moon trigger uses the finer step). */
  stepDays: 0.25,
  fastStepDays: 1 / 24,
  /** Off until checked against examples; nothing reads it yet. */
  ithasalaWithSahamLord: { enabled: false, multiplier: 1.2 },
} as const;

/** The planets that trigger a Saham in every year. */
export const FIXED_TRIGGERS = ['Sun', 'Mars', 'Mercury', 'Venus'] as const;

export type TriggerRole = 'Sun' | 'Mars' | 'Mercury' | 'Venus' | 'Year Lord' | 'Muntha lord';

export interface SahamTrigger {
  planet: string;
  roles: TriggerRole[];
}

/** The trigger list: the four fixed planets plus the Year Lord and the Muntha lord, merged if they coincide. */
export function buildTriggers(yearLord: string, munthaLord: string): SahamTrigger[] {
  const byPlanet = new Map<string, TriggerRole[]>();
  const add = (planet: string, role: TriggerRole) => {
    byPlanet.set(planet, [...(byPlanet.get(planet) ?? []), role]);
  };
  for (const p of FIXED_TRIGGERS) add(p, p);
  add(yearLord, 'Year Lord');
  add(munthaLord, 'Muntha lord');
  return [...byPlanet.entries()].map(([planet, roles]) => ({ planet, roles }));
}

export interface ProximityWindow {
  startMs: number;
  endMs: number;
  /** Times the planet is exactly on the point (the signed distance crosses zero). */
  exactMs: number[];
  /** Integral of proximity over the window, in days. */
  integralDays: number;
}

/** Signed difference a - b in degrees, in (-180, 180]. */
function signedDiff(a: number, b: number): number {
  return ((((a - b + 540) % 360) + 360) % 360) - 180;
}

const MS_PER_DAY = 86_400_000;

/**
 * Pure: the in-orb windows of one planet against one point, from samples of its signed
 * distance. Distance is treated as straight between samples; a zero crossing inside a step is
 * placed by linear interpolation so the peak (proximity 1) is not cut off.
 */
export function proximityWindows(
  timesMs: number[],
  distances: number[],
  orbDeg: number,
): ProximityWindow[] {
  const windows: ProximityWindow[] = [];
  let open: ProximityWindow | null = null;

  const prox = (d: number) => 1 - Math.abs(d) / orbDeg;

  /** One piece of a step with no sign change in the distance. */
  const piece = (aMs: number, aD: number, bMs: number, bD: number) => {
    const pa = prox(aD);
    const pb = prox(bD);
    const days = (bMs - aMs) / MS_PER_DAY;
    if (pa >= 0 && pb >= 0) {
      if (!open) open = { startMs: aMs, endMs: bMs, exactMs: [], integralDays: 0 };
      open.integralDays += ((pa + pb) / 2) * days;
      open.endMs = bMs;
    } else if (pa >= 0 && pb < 0) {
      const f = pa / (pa - pb);
      if (!open) open = { startMs: aMs, endMs: aMs, exactMs: [], integralDays: 0 };
      open.integralDays += (pa * f * days) / 2;
      open.endMs = aMs + f * (bMs - aMs);
      windows.push(open);
      open = null;
    } else if (pa < 0 && pb >= 0) {
      const f = pb / (pb - pa);
      open = {
        startMs: bMs - f * (bMs - aMs),
        endMs: bMs,
        exactMs: [],
        integralDays: (pb * f * days) / 2,
      };
    }
  };

  for (let i = 0; i < timesMs.length - 1; i++) {
    const t0 = timesMs[i]!;
    const t1 = timesMs[i + 1]!;
    const d0 = distances[i]!;
    const d1 = distances[i + 1]!;
    // A sign flip across the far side of the zodiac (|d| near 180) is not a crossing.
    const crosses = d0 * d1 < 0 && Math.abs(d0) + Math.abs(d1) < 180;
    if (crosses) {
      const tz = t0 + ((t1 - t0) * Math.abs(d0)) / (Math.abs(d0) + Math.abs(d1));
      piece(t0, d0, tz, 0);
      // The exact pass belongs to the window that is open at that moment.
      if (open) (open as ProximityWindow).exactMs.push(tz);
      piece(tz, 0, t1, d1);
    } else {
      // The very first sample can sit exactly on the point.
      piece(t0, d0, t1, d1);
      if (i === 0 && d0 === 0 && open) (open as ProximityWindow).exactMs.push(t0);
      // A sample that lands exactly on the point is an exact pass too.
      if (d1 === 0 && open) (open as ProximityWindow).exactMs.push(t1);
    }
  }
  if (open) windows.push(open);
  return windows;
}

export interface SahamWindow {
  saham: string;
  planet: string;
  roles: TriggerRole[];
  startMs: number;
  endMs: number;
  exactMs: number[];
  integralDays: number;
  lordBonusApplied: boolean;
  /** integralDays x lord bonus. */
  strength: number;
}

export type PositionsAt = (jd: number) => Promise<Record<string, number>>;

export function ephemerisPositions(ayanamsa: Ayanamsa = 'lahiri'): PositionsAt {
  return async (jd) => {
    const positions = await calculatePlanetPositions(jd, ayanamsa);
    return Object.fromEntries(positions.map((p) => [p.planet, p.longitude]));
  };
}

export interface SahamWindowArgs {
  sahams: SahamResult[];
  yearLord: string;
  munthaLord: string;
  fromMs: number;
  toMs: number;
  orbDeg?: number;
  lordBonus?: number;
  stepDays?: number;
  /** Planet longitudes at a Julian day; defaults to the ephemeris. Injectable for tests. */
  positionsAt?: PositionsAt;
  ayanamsa?: Ayanamsa;
}

/** Every activation window of every Saham between `fromMs` and `toMs`, in start order. */
export async function computeSahamWindows(args: SahamWindowArgs): Promise<SahamWindow[]> {
  const cfg = SAHAM_WINDOW_CONFIG;
  const orb = args.orbDeg ?? cfg.orbDeg;
  const bonus = args.lordBonus ?? cfg.lordBonus;
  const triggers = buildTriggers(args.yearLord, args.munthaLord);
  const positionsAt = args.positionsAt ?? ephemerisPositions(args.ayanamsa);

  const step =
    args.stepDays ??
    (triggers.some((t) => t.planet === 'Moon') ? cfg.fastStepDays : cfg.stepDays);
  const stepMs = step * MS_PER_DAY;

  const timesMs: number[] = [];
  for (let t = args.fromMs; t < args.toMs; t += stepMs) timesMs.push(t);
  timesMs.push(args.toMs);

  // One ephemeris call per sample serves every planet and every Saham.
  const samples: Array<Record<string, number>> = [];
  for (const t of timesMs) samples.push(await positionsAt(jdFromDate(new Date(t))));

  const out: SahamWindow[] = [];
  for (const saham of args.sahams) {
    for (const trigger of triggers) {
      const distances = samples.map((s) => signedDiff(s[trigger.planet] ?? NaN, saham.longitude));
      if (distances.some((d) => Number.isNaN(d))) continue;
      const isLord = saham.lord === trigger.planet;
      for (const w of proximityWindows(timesMs, distances, orb)) {
        out.push({
          saham: saham.name,
          planet: trigger.planet,
          roles: trigger.roles,
          startMs: w.startMs,
          endMs: w.endMs,
          exactMs: w.exactMs,
          integralDays: w.integralDays,
          lordBonusApplied: isLord,
          strength: w.integralDays * (isLord ? bonus : 1),
        });
      }
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}
