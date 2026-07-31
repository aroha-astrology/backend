import { describe, expect, it } from 'vitest';
import { analyzePlanetStrengths } from '../src/lib/astro-engine/gemstones.js';
import { computeLifeContext } from '../src/lib/astro-engine/reports/report-life-context.js';

const MS_PER_DAY = 86_400_000;
const UNIX_EPOCH_JD = 2440587.5;
function dateToJd(date: Date): number {
  return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

function makeChart(): Record<string, unknown> {
  return {
    julianDay: dateToJd(new Date(Date.now() - 5 * 365.25 * MS_PER_DAY)),
    ascendant: { signIndex: 0 },
    planets: [{ planet: 'Moon', longitude: 80.5 }],
    houses: [],
  };
}

describe('computeLifeContext', () => {
  it('returns one entry for each of the 4 life domains, in order', () => {
    const chart = makeChart();
    const ctx = computeLifeContext(chart, analyzePlanetStrengths(chart), null);
    expect(ctx.domains.map((d) => d.domain)).toEqual(['career', 'health', 'wealth', 'love']);
  });

  it('resolves a real current Mahadasha/Antardasha from a chart with usable dasha data', () => {
    const chart = makeChart();
    const ctx = computeLifeContext(chart, analyzePlanetStrengths(chart), null);
    expect(ctx.currentMahadasha).not.toBeNull();
    expect(typeof ctx.currentAntardasha).toBe('string');
    expect(ctx.endsOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('gives every domain a score in [0,100] and a tone matching the shared threshold rule', () => {
    const chart = makeChart();
    const ctx = computeLifeContext(chart, analyzePlanetStrengths(chart), null);
    for (const d of ctx.domains) {
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
      expect(['challenging', 'mixed', 'favorable']).toContain(d.tone);
    }
  });

  it('never throws and degrades to neutral 50/mixed scores + null dasha facts on a chart with no derivable birth date', () => {
    expect(() => computeLifeContext(null, analyzePlanetStrengths(null), null)).not.toThrow();
    const ctx = computeLifeContext(null, analyzePlanetStrengths(null), null);
    expect(ctx.currentMahadasha).toBeNull();
    expect(ctx.currentAntardasha).toBeNull();
    expect(ctx.endsOn).toBeNull();
    for (const d of ctx.domains) {
      expect(d.score).toBe(50);
      expect(d.tone).toBe('mixed');
      expect(d.connectedHouses).toEqual([]);
      expect(d.nextWindow).toBeNull();
    }
  });

  it('never throws when dashaData is null (timing-window search degrades to no windows)', () => {
    const chart = makeChart();
    expect(() => computeLifeContext(chart, analyzePlanetStrengths(chart), null)).not.toThrow();
  });
});
