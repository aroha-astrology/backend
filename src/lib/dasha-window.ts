// =============================================================================
// Dasha Window Search — nearest future antardasha/pratyantardasha ruled by a
// given set of significator planets (e.g. 7th lord/Venus for marriage timing).
// Never fabricates: returns undefined if nothing matches within the lookahead.
// =============================================================================

import { buildSubPeriods } from './astro-engine/index.js';
import type { DashaPeriod, Planet } from '@aroha-astrology/shared';

export interface FavorableWindow {
  lord: string;
  level: 'antardasha' | 'pratyantardasha';
  withinMahadasha: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

const MS_PER_YEAR = 365.25 * 86_400_000;

/**
 * Scan the next `maxMahadashas` mahadashas (starting from the current one, if
 * still active) for the nearest antardasha or pratyantardasha whose lord is in
 * `significatorLords`. Sub-periods for non-active future mahadashas are
 * computed on demand via `buildSubPeriods(..., forceFullDepth: true)` — only
 * for mahadashas actually being inspected, not the whole 120-year tree.
 */
export function findFavorableWindow(
  dasha: Record<string, unknown> | null,
  significatorLords: string[],
  now: Date,
  maxMahadashas = 3,
): FavorableWindow | undefined {
  const v = (dasha?.vimshottari ?? {}) as Record<string, unknown>;
  const mahadashas = (v.mahadashas ?? []) as DashaPeriod[];
  const upcoming = mahadashas
    .filter((m) => new Date(m.endDate).getTime() > now.getTime())
    .slice(0, maxMahadashas);

  for (const maha of upcoming) {
    const mahaStart = new Date(maha.startDate);
    const mahaEnd = new Date(maha.endDate);
    const durationYears = (mahaEnd.getTime() - mahaStart.getTime()) / MS_PER_YEAR;

    const antardashas = buildSubPeriods(maha.planet, mahaStart, durationYears, 1, now, 2, true);

    // Pass 1: does any antardasha in this mahadasha's cycle match? Scan the
    // whole cycle before dropping to pratyantardasha depth — an antardasha
    // match always outranks a pratyantardasha match within the same
    // mahadasha, even if a matching pratyantardasha happens to fall
    // chronologically earlier (e.g. nested inside an earlier antardasha).
    for (const antar of antardashas) {
      if (new Date(antar.endDate).getTime() <= now.getTime()) continue;

      if (significatorLords.includes(antar.planet)) {
        return {
          lord: antar.planet,
          level: 'antardasha',
          withinMahadasha: maha.planet,
          startDate: new Date(antar.startDate).toISOString().slice(0, 10),
          endDate: new Date(antar.endDate).toISOString().slice(0, 10),
        };
      }
    }

    // Pass 2: no antardasha-level match in this mahadasha — check
    // pratyantardasha depth, in chronological order across all antardashas.
    for (const antar of antardashas) {
      for (const praty of antar.subPeriods) {
        if (new Date(praty.endDate).getTime() <= now.getTime()) continue;
        if (significatorLords.includes(praty.planet)) {
          return {
            lord: praty.planet,
            level: 'pratyantardasha',
            withinMahadasha: maha.planet,
            startDate: new Date(praty.startDate).toISOString().slice(0, 10),
            endDate: new Date(praty.endDate).toISOString().slice(0, 10),
          };
        }
      }
    }
  }

  return undefined;
}
