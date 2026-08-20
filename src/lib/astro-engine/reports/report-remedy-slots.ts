// =============================================================================
// Report Lal Kitab remedy slots — for the 4 flagship (₹99) report types whose
// "Remedies" section needs its own short, report-relevant planet subset
// =============================================================================
// Reuses the Lal Kitab engine (getLalKitabRemedies, lalkitab/remedies.ts)
// wholesale — no new remedy database, no gemstone/stone content anywhere.
// Gemstones are sold exclusively through the dedicated paid gemstone feature
// (modules/gemstone/); no report may recommend or name a stone.
//
// This module only decides WHICH planets are relevant to a given report
// type's own life domain (unchanged from the retired gemstone-slot version —
// same house-lord resolvers, same fixed planets), then looks up each one's
// own natal-house Lal Kitab remedy. The standalone `remedies` report already
// covers all 9 classical planets natively (reports/remedies.ts) so it has no
// slot list here — injecting this would just duplicate its own content.
// =============================================================================

import { getLalKitabRemedies } from '../lalkitab/remedies.js';
import { getHouseLord, getPlanetPosition } from './chart-facts.js';
import type { ReportKey } from '../../../config/reports.js';
import type { Planet } from '@aroha-astrology/shared';

export interface ReportRemedyEntry {
  planet: string;
  house: number;
  remedies: string[];
  totke: string[];
}

type PlanetSlot = {
  /** A fixed planet name, or a resolver that reads the relevant house-lord off the chart —
   * skipped entirely (never a guessed fallback) if the lord can't be determined. */
  planet: string | ((chart: Record<string, unknown> | null) => string | undefined);
};

/** Per-report planet slots — see this module's doc comment for the reasoning behind each
 * report's own set (marriage: Venus/Jupiter/7th-lord/4th-lord; true_love: Venus/Moon/5th-lord;
 * kundli_milan: Venus/Jupiter/7th-lord; wealth: 2nd-lord/11th-lord/Jupiter/Mercury). */
const REPORT_REMEDY_SLOTS: Partial<Record<ReportKey, PlanetSlot[]>> = {
  marriage: [
    { planet: 'Venus' },
    { planet: 'Jupiter' },
    { planet: (chart) => getHouseLord(7, chart) },
    { planet: (chart) => getHouseLord(4, chart) },
  ],
  true_love: [
    { planet: 'Venus' },
    { planet: 'Moon' },
    { planet: (chart) => getHouseLord(5, chart) },
  ],
  kundli_milan: [
    { planet: 'Venus' },
    { planet: 'Jupiter' },
    { planet: (chart) => getHouseLord(7, chart) },
  ],
  wealth: [
    { planet: (chart) => getHouseLord(2, chart) },
    { planet: (chart) => getHouseLord(11, chart) },
    { planet: 'Jupiter' },
    { planet: 'Mercury' },
  ],
};

/** `true` for exactly the 4 flagship report types this module covers. Every other report type
 * (including the standalone `remedies` report, which covers all 9 planets itself, and
 * `match_report`, a deliberate product decision — it has its own separate classical-remedies
 * prose section instead) gets no `planetRemedies` field from this module. */
export function reportHasRemedySlots(reportKey: string): boolean {
  return reportKey in REPORT_REMEDY_SLOTS;
}

/**
 * Builds the Lal Kitab remedy list for a report type that has slots (see
 * `reportHasRemedySlots`) — `[]` for any other report key, never throws. Slots whose planet
 * resolver can't determine a lord (chart missing house data) are skipped rather than guessed; a
 * planet resolved by two different slots (e.g. Venus also happening to rule the 7th house)
 * appears only once.
 */
export function buildReportRemedies(
  reportKey: string,
  chart: Record<string, unknown> | null,
): ReportRemedyEntry[] {
  const slots = REPORT_REMEDY_SLOTS[reportKey as ReportKey];
  if (!slots) return [];

  const seen = new Set<string>();
  const entries: ReportRemedyEntry[] = [];

  for (const slot of slots) {
    const planet = typeof slot.planet === 'function' ? slot.planet(chart) : slot.planet;
    if (!planet || seen.has(planet)) continue;
    seen.add(planet);

    const pos = getPlanetPosition(planet, chart);
    if (typeof pos?.house !== 'number') continue;

    const { remedies, totke } = getLalKitabRemedies(planet as Planet, pos.house);
    if (remedies.length > 0) {
      entries.push({ planet, house: pos.house, remedies, totke });
    }
  }

  return entries;
}
