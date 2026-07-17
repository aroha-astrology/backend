// =============================================================================
// Dasha Window Search — nearest future antardasha/pratyantardasha ruled by a
// given set of significator planets (e.g. 7th lord/Venus for marriage timing).
// Never fabricates: returns undefined if nothing matches within the lookahead.
// =============================================================================

import { buildSubPeriods } from './astro-engine/index.js';
import type { DashaPeriod } from '@aroha-astrology/shared';

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
/**
 * Scan the next `maxMahadashas` mahadashas for EVERY antardasha/
 * pratyantardasha window ruled by a significator (not just the first match) —
 * the basis for ranking "the 2-3 strongest windows" rather than always
 * returning whichever happens to come chronologically first. Capped at
 * `maxWindows` to bound cost on a chart with many matching sub-periods.
 *
 * `sharedSubPeriods`, if provided, lets a caller iterating many domains over
 * the same dasha reuse one already-built sub-period tree per mahadasha
 * instead of rebuilding it (an expensive `forceFullDepth` computation) once
 * per domain — see dasha-confidence.ts's `buildSharedDashaTree`.
 */
export function findFavorableWindows(
  dasha: Record<string, unknown> | null,
  significatorLords: string[],
  now: Date,
  maxMahadashas = 3,
  maxWindows = 8,
  sharedSubPeriods?: Map<string, ReturnType<typeof buildSubPeriods>>,
): FavorableWindow[] {
  const v = (dasha?.vimshottari ?? {}) as Record<string, unknown>;
  const mahadashas = (v.mahadashas ?? []) as DashaPeriod[];
  const upcoming = mahadashas
    .filter((m) => new Date(m.endDate).getTime() > now.getTime())
    .slice(0, maxMahadashas);

  const windows: FavorableWindow[] = [];

  for (const maha of upcoming) {
    const mahaStart = new Date(maha.startDate);
    const mahaEnd = new Date(maha.endDate);
    const durationYears = (mahaEnd.getTime() - mahaStart.getTime()) / MS_PER_YEAR;

    const antardashas =
      sharedSubPeriods?.get(maha.planet) ??
      buildSubPeriods(maha.planet, mahaStart, durationYears, 1, now, 2, true);

    for (const antar of antardashas) {
      if (
        new Date(antar.endDate).getTime() > now.getTime() &&
        significatorLords.includes(antar.planet)
      ) {
        windows.push({
          lord: antar.planet,
          level: 'antardasha',
          withinMahadasha: maha.planet,
          startDate: new Date(antar.startDate).toISOString().slice(0, 10),
          endDate: new Date(antar.endDate).toISOString().slice(0, 10),
        });
      }

      for (const praty of antar.subPeriods) {
        if (
          new Date(praty.endDate).getTime() > now.getTime() &&
          significatorLords.includes(praty.planet)
        ) {
          windows.push({
            lord: praty.planet,
            level: 'pratyantardasha',
            withinMahadasha: maha.planet,
            startDate: new Date(praty.startDate).toISOString().slice(0, 10),
            endDate: new Date(praty.endDate).toISOString().slice(0, 10),
          });
        }
      }
    }
  }

  // Sort antardasha-level matches before ANY pratyantardasha-level match,
  // chronologically within each tier, THEN truncate to maxWindows. This
  // order matters: pratyantardasha sub-blips recur roughly every ~9 months
  // and can easily produce more than maxWindows candidates before a single,
  // classically much more significant antardasha-level match is even
  // reached chronologically (verified against a real synthetic dasha — a
  // naive chronological-then-truncate approach silently dropped every
  // antardasha-level match in favor of 8 earlier pratyantardasha ones). Do
  // NOT collapse this to a chronological-only sort — that reintroduces
  // exactly the bug this comment describes and the tier is not merely a
  // tiebreak.
  return windows
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === 'antardasha' ? -1 : 1;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    })
    .slice(0, maxWindows);
}

/**
 * Pre-builds the antardasha/pratyantardasha sub-period tree for each upcoming
 * mahadasha ONCE, for a caller that scores many domains against the same
 * dasha in a single request (chat-grounding.ts now scores 14 domains, not 3
 * — without this, `findFavorableWindows`'s `forceFullDepth` sub-period build,
 * the expensive part, would repeat once per domain instead of once per
 * request). Pass the result as `findFavorableWindows`'s `sharedSubPeriods`.
 */
export function buildSharedDashaTree(
  dasha: Record<string, unknown> | null,
  now: Date,
  maxMahadashas = 3,
): Map<string, ReturnType<typeof buildSubPeriods>> {
  const v = (dasha?.vimshottari ?? {}) as Record<string, unknown>;
  const mahadashas = (v.mahadashas ?? []) as DashaPeriod[];
  const upcoming = mahadashas
    .filter((m) => new Date(m.endDate).getTime() > now.getTime())
    .slice(0, maxMahadashas);

  const tree = new Map<string, ReturnType<typeof buildSubPeriods>>();
  for (const maha of upcoming) {
    const mahaStart = new Date(maha.startDate);
    const mahaEnd = new Date(maha.endDate);
    const durationYears = (mahaEnd.getTime() - mahaStart.getTime()) / MS_PER_YEAR;
    tree.set(maha.planet, buildSubPeriods(maha.planet, mahaStart, durationYears, 1, now, 2, true));
  }
  return tree;
}
