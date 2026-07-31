import { describe, expect, it } from 'vitest';
import {
  buildReportGemstones,
  reportHasGemstones,
} from '../src/lib/astro-engine/reports/report-gemstones.js';

interface PlanetOpts {
  sign: string;
  house?: number;
  longitude?: number;
}

function makeChart(opts: {
  venus?: PlanetOpts;
  sun?: PlanetOpts;
  houses?: Array<{ house: number; lord: string; sign: string }>;
}): Record<string, unknown> {
  const planets: Record<string, unknown>[] = [];
  if (opts.venus) planets.push({ planet: 'Venus', ...opts.venus });
  if (opts.sun) planets.push({ planet: 'Sun', ...opts.sun });
  return { planets, houses: opts.houses ?? [] };
}

describe('reportHasGemstones', () => {
  it('is true for exactly the 5 flagship report types', () => {
    for (const key of ['marriage', 'true_love', 'kundli_milan', 'wealth', 'remedies']) {
      expect(reportHasGemstones(key)).toBe(true);
    }
  });

  it('is false for every other report type', () => {
    for (const key of ['match_report', 'baby_name', 'numerology', 'name_change', 'past_life']) {
      expect(reportHasGemstones(key)).toBe(false);
    }
  });
});

describe('buildReportGemstones', () => {
  it('returns [] for a report key with no gemstone slots', () => {
    expect(buildReportGemstones('baby_name', makeChart({}))).toEqual([]);
  });

  it('marriage: includes Venus, Jupiter, the 7th-lord, and the 4th-lord', () => {
    const chart = makeChart({
      venus: { sign: 'Pisces' }, // exalted
      houses: [
        { house: 7, lord: 'Mercury', sign: 'Virgo' },
        { house: 4, lord: 'Saturn', sign: 'Capricorn' },
      ],
    });
    const gems = buildReportGemstones('marriage', chart);
    expect(gems.map((g) => g.planet)).toEqual(['Venus', 'Jupiter', 'Mercury', 'Saturn']);
  });

  it('marks Venus exalted in Pisces as strong, with no caution applying', () => {
    const chart = makeChart({ venus: { sign: 'Pisces' } });
    const gems = buildReportGemstones('marriage', chart);
    const venus = gems.find((g) => g.planet === 'Venus')!;
    expect(venus.strength).toBe('strong');
    expect(venus.reason).toContain('Exalted');
  });

  it('flags a caution when Saturn rules the 2nd or 7th house (wealth report)', () => {
    const chart = makeChart({
      houses: [
        { house: 2, lord: 'Saturn', sign: 'Capricorn' },
        { house: 11, lord: 'Jupiter', sign: 'Sagittarius' },
      ],
    });
    const gems = buildReportGemstones('wealth', chart);
    const saturn = gems.find((g) => g.planet === 'Saturn');
    expect(saturn?.conditionalCautionApplies).toBe(true);
  });

  it('dedupes a planet that fills two slots for the same report, keeping only the first role', () => {
    // Venus is BOTH the fixed marriage significator AND (in this chart) the 7th-house lord.
    const chart = makeChart({
      venus: { sign: 'Libra', house: 7 },
      houses: [{ house: 7, lord: 'Venus', sign: 'Libra' }],
    });
    const gems = buildReportGemstones('marriage', chart);
    expect(gems.filter((g) => g.planet === 'Venus')).toHaveLength(1);
    expect(gems.find((g) => g.planet === 'Venus')!.role).toContain('romantic harmony');
  });

  it('skips a slot whose house-lord cannot be determined, rather than guessing', () => {
    const chart = makeChart({ houses: [] }); // no house-lord data at all
    const gems = buildReportGemstones('wealth', chart);
    // Only Jupiter/Mercury (fixed planets) remain — the 2nd/11th-lord slots are skipped.
    expect(gems.map((g) => g.planet)).toEqual(['Jupiter', 'Mercury']);
  });

  it('remedies: returns all 9 classical planets in a fixed order', () => {
    const gems = buildReportGemstones('remedies', makeChart({}));
    expect(gems.map((g) => g.planet)).toEqual([
      'Sun',
      'Moon',
      'Mars',
      'Mercury',
      'Jupiter',
      'Venus',
      'Saturn',
      'Rahu',
      'Ketu',
    ]);
  });

  it('never throws on a null chart', () => {
    expect(() => buildReportGemstones('marriage', null)).not.toThrow();
  });
});
