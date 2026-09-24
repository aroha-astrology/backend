// =============================================================================
// Dasha periods inside a date range
// =============================================================================
// The stored Vimshottari tree (kundlis.dasha_data.vimshottari) only carries
// sub-periods for the branch that was active when the kundli was generated —
// see calculateVimshottariDasha. Calendar, timeline and decision features need
// antar/pratyantar periods for ANY window, past or future, so this rebuilds
// them from each mahadasha's own stored [startDate, endDate) span — the same
// way monthly-dasha-context.ts's computeFreshAntardashas does, so these dates
// always agree with what the Kundli page shows.
// =============================================================================

import type { Planet } from '@aroha-astrology/shared';
import { buildSubPeriods } from './vimshottari.js';

const MS_PER_YEAR = 365.25 * 86_400_000;

export type DashaSpanLevel = 'mahadasha' | 'antardasha' | 'pratyantardasha';

export interface DashaSpan {
  level: DashaSpanLevel;
  planet: Planet;
  startDate: Date;
  endDate: Date;
  /** The lord chain from the mahadasha down to this period, e.g. ['Mercury', 'Venus']. */
  lords: Planet[];
}

/** A mahadasha as stored in jsonb: dates come back as ISO strings, not Dates. */
export interface StoredMahadasha {
  planet: Planet | string;
  startDate: Date | string;
  endDate: Date | string;
}

const LEVELS: DashaSpanLevel[] = ['mahadasha', 'antardasha', 'pratyantardasha'];

function overlaps(start: Date, end: Date, from: Date, to: Date): boolean {
  return start.getTime() < to.getTime() && end.getTime() > from.getTime();
}

/**
 * Every period at `depth` (1 = antardasha, 2 = pratyantardasha; 0 = the
 * mahadashas themselves) that overlaps `[from, to)`, in chronological order.
 * Periods are returned whole — one that started before `from` keeps its real
 * start date — so callers can say "this period began on …".
 */
export function dashaPeriodsInRange(
  mahadashas: readonly StoredMahadasha[],
  from: Date,
  to: Date,
  depth: 0 | 1 | 2 = 1,
): DashaSpan[] {
  const out: DashaSpan[] = [];

  for (const md of mahadashas) {
    const start = new Date(md.startDate);
    const end = new Date(md.endDate);
    if (!overlaps(start, end, from, to)) continue;
    const planet = md.planet as Planet;
    walk(planet, start, end, 0, [planet]);
  }
  return out;

  function walk(planet: Planet, start: Date, end: Date, level: number, lords: Planet[]): void {
    if (level === depth) {
      out.push({ level: LEVELS[level]!, planet, startDate: start, endDate: end, lords });
      return;
    }
    const years = (end.getTime() - start.getTime()) / MS_PER_YEAR;
    // currentDate only drives isActive flags, which nothing here reads.
    const children = buildSubPeriods(planet, start, years, level + 1, start, level + 1);
    for (const child of children) {
      const childStart = new Date(child.startDate);
      const childEnd = new Date(child.endDate);
      if (!overlaps(childStart, childEnd, from, to)) continue;
      walk(child.planet, childStart, childEnd, level + 1, [...lords, child.planet]);
    }
  }
}
