// =============================================================================
// Varshik C3: the daily star signals the scorer reads (pure, no ephemeris)
// =============================================================================
// nakshatra-transits.ts (C1) already writes, for each planet and day, the star, the Tara, the special
// tara, the house and verdict from the natal Moon, the bindus and the kakshya. This file turns those
// rows into -1..+1 signals, once per context, so scoreDay only does look-ups:
//   gochar    from the verdict (good / relieved / blocked / hard)
//   moorti    the metal of the planet's last sign change (needs ctx.stars.moorti; 0 before the first one in the year)
//   tara      the Navatara of the planet's star from the birth star
//   special   the special tara number (0 = none) and whether the star holds a natal planet
//   starLord  the natal role of the star's lord (the caller supplies the lord's natal signal)
//   kakshya   +1 / -1 for a bindu from the kakshya lord, 0 when the planet has no BAV
// Constants: config/varshik-weights.ts (VARSHIK_C3). No death wording in any output.
// =============================================================================

import { NAKSHATRA_LORDS } from '@aroha-astrology/shared';
import { VARSHIK_C3 as C } from '../../../config/varshik-weights.js';
import type { VarshikContext } from './varshik-context.js';
import { dailyStarRows, natalStarMap, type DailyStarRow } from './nakshatra-transits.js';

export interface StarSignals {
  gochar: Record<string, number[]>;
  moorti: Record<string, number[]>;
  tara: Record<string, number[]>;
  special: Record<string, number[]>;
  /** True on days the planet stands in the star of a natal planet or the Lagna. */
  natalHit: Record<string, boolean[]>;
  /** The star lord of each day (name), so the caller can look its natal signal up. */
  starLord: Record<string, string[]>;
  kakshya: Record<string, number[]>;
}

const VERDICT_KEY: Record<string, string> = { g: 'good', b: 'blocked', r: 'relieved', h: 'hard', '-': 'none' };

const cache = new WeakMap<VarshikContext, Record<string, DailyStarRow>>();
/** The daily rows of a context, worked out once. */
export function dailyRowsOf(ctx: VarshikContext): Record<string, DailyStarRow> {
  let rows = cache.get(ctx);
  if (!rows) {
    rows = dailyStarRows(ctx);
    cache.set(ctx, rows);
  }
  return rows;
}

/** Moorti value on each day for one planet: the last sign change at or before the day's midday. */
export function moortiSeries(ctx: VarshikContext, planet: string): number[] {
  const events = (ctx.stars?.moorti ?? []).filter((m) => m.planet === planet).sort((a, b) => a.atMs - b.atMs);
  return ctx.days.map((d) => {
    let v = 0;
    for (const e of events) {
      if (e.atMs <= d.atMs) v = C.moortiValue[e.moorti] ?? 0;
      else break;
    }
    return v;
  });
}

export function buildStarSignals(ctx: VarshikContext): StarSignals {
  const rows = dailyRowsOf(ctx);
  const natalStars = Object.values(natalStarMap(ctx.natal));
  const out: StarSignals = { gochar: {}, moorti: {}, tara: {}, special: {}, natalHit: {}, starLord: {}, kakshya: {} };
  for (const p of C.starPlanets) {
    const r = rows[p];
    if (!r) continue;
    out.gochar[p] = r.verdict.map((v) => C.gochar[VERDICT_KEY[v] ?? 'none'] ?? 0);
    out.tara[p] = r.tara.map((t) => C.taraValue[t] ?? 0);
    out.special[p] = r.special;
    out.natalHit[p] = r.nak.map((n) => natalStars.includes(n));
    out.starLord[p] = r.nak.map((n) => NAKSHATRA_LORDS[n]!);
    out.kakshya[p] = r.kakshya.map((k) => (k < 0 ? 0 : k === 1 ? 1 : -1));
    out.moorti[p] = C.moortiPlanets.includes(p) ? moortiSeries(ctx, p) : r.nak.map(() => 0);
  }
  return out;
}
