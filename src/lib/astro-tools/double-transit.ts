// =============================================================================
// Double-transit forward scan
// =============================================================================
// detectDoubleTransit() (transit.ts) is instantaneous — it answers "which
// houses are jointly aspected by Jupiter and Saturn RIGHT NOW". This module
// answers the forward-looking version: over a date range, WHEN is each house
// in that jointly-aspected state, and does that window line up with the
// running Dasha's own themes (the audit's "amplification" rule).
//
// Exact algorithm, no day-by-day scan: the set of houses Jupiter+Saturn
// jointly aspect only changes at a Jupiter or Saturn INGRESS (their aspect
// pattern is entirely a function of sign, not degree-within-sign). So the
// range is cut into intervals at each Jupiter/Saturn ingress moment (reusing
// the same ephemeris search transit-events.ts already uses for the pre-alert
// pipeline), detectDoubleTransit() is evaluated once per interval, and a
// house's window is just the maximal run of intervals where it appears.
// =============================================================================

import { findTransitEvents, jdFromDate } from './transit-events.js';
import { calculatePlanetPositions } from '../astro-engine/calculations/planetPositions.js';
import { detectDoubleTransit } from './transit.js';
import { DOMAIN_CONFIG, type Domain } from '../astro-engine/dasha-confidence.js';

export interface DoubleTransitWindow {
  /** House number (1-12) from natal Moon. */
  house: number;
  sign: string;
  signIndex: number;
  startDate: Date;
  endDate: Date;
}

/**
 * Finds every window in `[from, to)` during which a house (from natal Moon)
 * is jointly aspected by transiting Jupiter and Saturn.
 */
export async function findDoubleTransitWindows(
  from: Date,
  to: Date,
  natalMoonSignIdx: number,
): Promise<DoubleTransitWindow[]> {
  const allEvents = await findTransitEvents(from, to);
  const jupSatIngresses = allEvents
    .filter((e) => (e.planet === 'Jupiter' || e.planet === 'Saturn') && e.eventType === 'ingress')
    .sort((a, b) => a.exactAt.getTime() - b.exactAt.getTime());

  const boundaryTimes = Array.from(
    new Set([from, ...jupSatIngresses.map((e) => e.exactAt), to].map((d) => d.getTime())),
  )
    .sort((a, b) => a - b)
    .map((t) => new Date(t));

  const open = new Map<number, { sign: string; signIndex: number; startDate: Date }>();
  const windows: DoubleTransitWindow[] = [];

  for (let i = 0; i < boundaryTimes.length - 1; i++) {
    const intervalStart = boundaryTimes[i]!;
    const positions = await calculatePlanetPositions(jdFromDate(intervalStart));
    const jupiterSign = positions.find((p) => p.planet === 'Jupiter')?.signIndex ?? 0;
    const saturnSign = positions.find((p) => p.planet === 'Saturn')?.signIndex ?? 0;

    const active = detectDoubleTransit(jupiterSign, saturnSign, natalMoonSignIdx);
    const activeHouses = new Set(active.map((a) => a.house));

    for (const [house, w] of open) {
      if (!activeHouses.has(house)) {
        windows.push({
          house,
          sign: w.sign,
          signIndex: w.signIndex,
          startDate: w.startDate,
          endDate: intervalStart,
        });
        open.delete(house);
      }
    }
    for (const a of active) {
      if (!open.has(a.house)) {
        const signIndex = (natalMoonSignIdx + a.house - 1) % 12;
        open.set(a.house, { sign: a.sign, signIndex, startDate: intervalStart });
      }
    }
  }

  const finalBoundary = boundaryTimes[boundaryTimes.length - 1]!;
  for (const [house, w] of open) {
    windows.push({
      house,
      sign: w.sign,
      signIndex: w.signIndex,
      startDate: w.startDate,
      endDate: finalBoundary,
    });
  }

  return windows.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

// ---------------------------------------------------------------------------
// Amplification: does this window's house line up with the running Dasha?
// ---------------------------------------------------------------------------

export interface AmplifiedDoubleTransitWindow extends DoubleTransitWindow {
  /** This window's house, re-expressed from the Ascendant (DOMAIN_CONFIG's frame — see dasha-confidence.ts). */
  houseFromAsc: number;
  /** Domains whose natal/trigger houses (from Ascendant) this window's sign falls in. */
  domains: Domain[];
  /** True when an active Mahadasha/Antardasha lord is also a static significator of one of `domains` — the audit's "high-probability event window" flag. */
  dashaAligned: boolean;
}

/**
 * Flags which double-transit windows line up with domains DOMAIN_CONFIG
 * already tracks, and whether the currently running Dasha reinforces one of
 * them — reusing DOMAIN_CONFIG's chart-agnostic static metadata rather than
 * building a second parallel domain table (see dasha-confidence.ts's own
 * rationale for why that table exists).
 *
 * `activeDashaLords` should be the current Mahadasha/Antardasha planet
 * names — a window is `dashaAligned` when one of them is also one of a
 * matched domain's `staticKarakas` (e.g. an active Venus period during a
 * double-transit window that lands in the 'love' domain's houses).
 */
export function amplifyDoubleTransitWindows(
  windows: DoubleTransitWindow[],
  natalAscSignIdx: number,
  activeDashaLords: readonly string[],
): AmplifiedDoubleTransitWindow[] {
  const allDomains = Object.keys(DOMAIN_CONFIG) as Domain[];

  return windows.map((w) => {
    const houseFromAsc = ((w.signIndex - natalAscSignIdx + 12) % 12) + 1;
    const domains = allDomains.filter((d) => {
      const config = DOMAIN_CONFIG[d];
      return (
        config.triggerHouses.includes(houseFromAsc) || config.natalHouses.includes(houseFromAsc)
      );
    });
    const dashaAligned = domains.some((d) =>
      DOMAIN_CONFIG[d].staticKarakas.some((k) => activeDashaLords.includes(k)),
    );
    return { ...w, houseFromAsc, domains, dashaAligned };
  });
}
