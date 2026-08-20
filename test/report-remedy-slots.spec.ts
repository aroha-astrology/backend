import { describe, expect, it } from 'vitest';
import {
  buildReportRemedies,
  reportHasRemedySlots,
} from '../src/lib/astro-engine/reports/report-remedy-slots.js';

function makeChart(opts: {
  planets?: Array<{ planet: string; house: number }>;
  houses?: Array<{ house: number; lord: string; sign: string }>;
}): Record<string, unknown> {
  return { planets: opts.planets ?? [], houses: opts.houses ?? [] };
}

describe('reportHasRemedySlots', () => {
  it('is true for exactly the 4 flagship report types', () => {
    for (const key of ['marriage', 'true_love', 'kundli_milan', 'wealth']) {
      expect(reportHasRemedySlots(key)).toBe(true);
    }
  });

  it('is false for the standalone remedies report (covers all 9 planets natively) and every other report type', () => {
    for (const key of [
      'remedies',
      'match_report',
      'baby_name',
      'numerology',
      'name_change',
      'past_life',
    ]) {
      expect(reportHasRemedySlots(key)).toBe(false);
    }
  });
});

describe('buildReportRemedies', () => {
  it('returns [] for a report key with no remedy slots', () => {
    expect(buildReportRemedies('baby_name', makeChart({}))).toEqual([]);
  });

  it('returns [] for the standalone remedies report key (no duplicate slot injection)', () => {
    expect(
      buildReportRemedies('remedies', makeChart({ planets: [{ planet: 'Venus', house: 7 }] })),
    ).toEqual([]);
  });

  it('marriage: includes Venus, Jupiter, the 7th-lord, and the 4th-lord, each with real Lal Kitab remedies', () => {
    const chart = makeChart({
      planets: [
        { planet: 'Venus', house: 7 },
        { planet: 'Jupiter', house: 9 },
        { planet: 'Mercury', house: 7 },
        { planet: 'Saturn', house: 4 },
      ],
      houses: [
        { house: 7, lord: 'Mercury', sign: 'Virgo' },
        { house: 4, lord: 'Saturn', sign: 'Capricorn' },
      ],
    });
    const entries = buildReportRemedies('marriage', chart);
    expect(entries.map((e) => e.planet)).toEqual(['Venus', 'Jupiter', 'Mercury', 'Saturn']);
    for (const entry of entries) {
      expect(entry.remedies.length).toBeGreaterThan(0);
    }
  });

  it('dedupes a planet that fills two slots for the same report, keeping only one entry', () => {
    // Venus is BOTH the fixed marriage significator AND (in this chart) the 7th-house lord.
    const chart = makeChart({
      planets: [{ planet: 'Venus', house: 7 }],
      houses: [{ house: 7, lord: 'Venus', sign: 'Libra' }],
    });
    const entries = buildReportRemedies('marriage', chart);
    expect(entries.filter((e) => e.planet === 'Venus')).toHaveLength(1);
  });

  it('skips a slot whose house-lord cannot be determined, rather than guessing', () => {
    const chart = makeChart({
      planets: [
        { planet: 'Jupiter', house: 9 },
        { planet: 'Mercury', house: 3 },
      ],
      houses: [], // no house-lord data at all — the 2nd/11th-lord slots are skipped
    });
    const entries = buildReportRemedies('wealth', chart);
    expect(entries.map((e) => e.planet)).toEqual(['Jupiter', 'Mercury']);
  });

  it('skips a slot whose planet has no natal house data, rather than guessing', () => {
    const chart = makeChart({ planets: [], houses: [] });
    expect(buildReportRemedies('marriage', chart)).toEqual([]);
  });

  it('never throws on a null chart', () => {
    expect(() => buildReportRemedies('marriage', null)).not.toThrow();
    expect(buildReportRemedies('marriage', null)).toEqual([]);
  });
});
