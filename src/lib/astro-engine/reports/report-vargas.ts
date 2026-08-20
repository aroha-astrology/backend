// =============================================================================
// Report divisional-chart (varga) facts — shared helper for report scoring
// =============================================================================
// Every report type read the D1 (Rasi) chart only — no report ever cited a
// divisional chart, even though the classical significations these reports
// already narrate (marriage, career, wealth, health, progeny...) are each
// governed by their own varga (D9, D10, D2, D6/D30...), and the AI chat
// feature already surfaces all 24 for the same user's chart (see
// chat-grounding.ts's divisionalChartFacts/VARGA_LABELS). A report's own
// narrative could contradict what chat told the same user about the same
// chart's Navamsa/Dashamsha/etc. simply because the report never looked.
//
// Computes only the specific varga(s) a report domain needs, via
// DIVISIONAL_CALCULATORS directly — not calculateAllDivisionalChartsWithLagna,
// which always computes the full 24 (right for chat's comprehensive grounding,
// wasteful for a report that needs one or two).
// =============================================================================

import { ZODIAC_SIGNS, type DivisionalChart } from '@aroha-astrology/shared';
import { DIVISIONAL_CALCULATORS } from '../charts/divisionalCharts.js';

export interface ReportVarga {
  /** e.g. "D9" */
  key: DivisionalChart;
  /** This varga's own Lagna (ascendant) sign — the natal ascendant longitude run through the same
   * fractional-division rule as the planets, same basis chat-grounding.ts's divisionalChartFacts
   * uses for its Lagna line. */
  lagna: string;
  /** Sign each natal planet falls in within this varga, keyed by planet name. */
  planets: Record<string, string>;
}

/**
 * Computes the requested varga(s) for one chart. Called with the primary person's own chart for
 * every report type, and additionally with the partner's chart for kundli_milan/match_report (see
 * those generators) — this only ever computes ONE chart's vargas per call, the caller decides
 * whose chart and which keys.
 *
 * Returns `[]` (never throws) when the chart lacks planet longitudes or an ascendant sign index —
 * same degrade-gracefully contract as the rest of this report engine (a missing varga fact is
 * fine, an invented one is not).
 */
export function computeReportVargas(
  chart: Record<string, unknown> | null,
  keys: DivisionalChart[],
): ReportVarga[] {
  const rawPlanets = (chart?.planets ?? []) as Array<Record<string, unknown>>;
  const asc = chart?.ascendant as Record<string, unknown> | undefined;
  const ascSignIndex = asc?.signIndex != null ? Number(asc.signIndex) : null;
  if (ascSignIndex == null) return [];

  const withLongitude = rawPlanets
    .filter((p) => p.planet != null && p.longitude != null)
    .map((p) => ({ planet: String(p.planet), longitude: Number(p.longitude) }));
  if (withLongitude.length === 0) return [];

  const ascLongitude = ascSignIndex * 30 + Number(asc?.degree ?? 0);

  return keys.map((key) => {
    const calc = DIVISIONAL_CALCULATORS[key];
    const planets: Record<string, string> = {};
    for (const p of withLongitude) {
      // calc() always returns a 0-11 sign index (fractional-division arithmetic, never
      // out of range) — same guaranteed-valid-index basis as this engine's other `]!` uses
      // (e.g. report-archetype.ts, report-remedy-slots.ts).
      planets[p.planet] = ZODIAC_SIGNS[calc(p.longitude)]!;
    }
    return {
      key,
      lagna: ZODIAC_SIGNS[calc(ascLongitude)]!,
      planets,
    };
  });
}

/** One-line narrative-prompt rendering of a single varga — "D9: Lagna Aries | Sun-Leo Moon-...". */
export function formatReportVarga(varga: ReportVarga): string {
  const placements = Object.entries(varga.planets)
    .map(([planet, sign]) => `${planet}-${sign}`)
    .join(' ');
  return `${varga.key}: Lagna ${varga.lagna} | ${placements}`;
}
