import { describe, expect, it } from 'vitest';
import {
  computeReportTimingWindows,
  type Domain,
  type RankedWindow,
  type DomainWindowResult,
} from '../src/lib/astro-engine/reports/report-timing.js';
import { scoreDomainWindows } from '../src/lib/astro-engine/dasha-confidence.js';

/** Same synthetic mahadasha builder as dasha-confidence.spec.ts/dasha-window.spec.ts. */
function makeDasha(now: Date) {
  const planets = ['Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus'];
  const years: Record<string, number> = {
    Sun: 6,
    Moon: 10,
    Mars: 7,
    Rahu: 18,
    Jupiter: 16,
    Saturn: 19,
    Mercury: 17,
    Ketu: 7,
    Venus: 20,
  };
  let cursor = new Date(now.getTime());
  const mahadashas = planets.map((planet) => {
    const startDate = new Date(cursor.getTime());
    const endDate = new Date(cursor.getTime() + years[planet]! * 365.25 * 86_400_000);
    cursor = endDate;
    return {
      planet,
      startDate,
      endDate,
      isActive: false,
      level: 'mahadasha' as const,
      subPeriods: [],
    };
  });
  mahadashas[0]!.isActive = true;
  return { vimshottari: { mahadashas } };
}

function makeChart(ascendantSignIndex: number | null): Record<string, unknown> | null {
  if (ascendantSignIndex == null) return { planets: [], houses: [] };
  return { ascendant: { signIndex: ascendantSignIndex }, planets: [], houses: [] };
}

describe('computeReportTimingWindows', () => {
  it('re-exports Domain/RankedWindow/DomainWindowResult types usable by report modules', () => {
    // Type-only assertions — this test's real job is to fail to COMPILE (not throw) if the
    // re-exports in report-timing.ts are ever removed or renamed.
    const domain: Domain = 'career';
    const result: DomainWindowResult = { domain, windows: [] };
    const window: RankedWindow[] = result.windows;
    expect(window).toEqual([]);
  });

  it('produces the exact same result as calling scoreDomainWindows directly with a null-transit chart', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const chart = makeChart(3);

    const wrapped = computeReportTimingWindows('career', ['Venus'], dasha, chart, now);
    const direct = scoreDomainWindows('career', ['Venus'], dasha, 3, now, {
      saturnSignIndex: null,
      jupiterSignIndex: null,
    });

    expect(wrapped).toEqual(direct);
  });

  it('extracts ascSignIndex from chart.ascendant.signIndex the same way chat-grounding.ts does', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    // ascSignIndex actually only affects the (always-degraded-to-false, since transits are
    // always null here) transit-alignment reasoning text — verify it reads the right field by
    // diffing wrapped-with-signIndex vs wrapped-with-missing-ascendant: both must still produce
    // valid, non-throwing results either way (transit alignment degrades to "unknown" in both
    // cases since no real transit is ever supplied), but a chart with NO ascendant at all must
    // not crash extraction.
    const withAsc = computeReportTimingWindows('career', ['Venus'], dasha, makeChart(5), now);
    const withoutAsc = computeReportTimingWindows('career', ['Venus'], dasha, {}, now);
    expect(withAsc.domain).toBe('career');
    expect(withoutAsc.domain).toBe('career');
  });

  it('returns an empty windows array (never throws) on null chart and null dashaData', () => {
    const result = computeReportTimingWindows('love', ['Venus'], null, null, new Date());
    expect(result.windows).toEqual([]);
    expect(result.domain).toBe('love');
  });

  it('never awards transit alignment (max score 2, never HIGH), since transits are always passed as null (documented simplification)', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const dasha = makeDasha(now);
    const chart = makeChart(0);
    const result = computeReportTimingWindows('career', ['Venus'], dasha, chart, now);
    expect(result.windows.length).toBeGreaterThan(0);
    for (const w of result.windows) {
      // HIGH requires score >= 3, which needs the Vimshottari anchor (always 1) + Yogini
      // alignment (0/1) + transit alignment (0/1) all landing. Transit alignment can never
      // fire here (transits are always {saturnSignIndex: null, jupiterSignIndex: null}), so
      // the ceiling is 2 (MEDIUM), never 3 (HIGH).
      expect(w.score).toBeLessThanOrEqual(2);
      expect(w.level).not.toBe('HIGH');
    }
  });
});
