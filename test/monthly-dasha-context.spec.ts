import { describe, expect, it } from 'vitest';
import {
  findActivePeriodForMonth,
  computeMonthlyReportScore,
  toneFromMonthScore,
  safelyResolveActivePeriod,
} from '../src/lib/astro-engine/reports/monthly-dasha-context.js';
import { buildSubPeriods } from '../src/lib/astro-engine/dashas/vimshottari.js';
import type { PlanetAnalysis } from '../src/lib/astro-engine/gemstones.js';
import type { VimshottariDasha, DashaPeriod, Planet } from '@aroha-astrology/shared';

function makeMahadasha(planet: Planet, start: string, end: string, isActive = false): DashaPeriod {
  return {
    planet,
    startDate: new Date(start),
    endDate: new Date(end),
    isActive,
    level: 'mahadasha',
    subPeriods: [],
  };
}

function makeVimshottari(mahadashas: DashaPeriod[]): VimshottariDasha {
  return {
    mahadashas,
    currentMahadasha: mahadashas[0]!,
    currentAntardasha: mahadashas[0]!.subPeriods[0] as DashaPeriod,
    currentPratyantardasha: undefined as unknown as DashaPeriod,
  };
}

describe('findActivePeriodForMonth', () => {
  it('finds the mahadasha whose date range covers the target month, ignoring isActive', () => {
    const sun = makeMahadasha('Sun', '2020-01-01T00:00:00Z', '2026-01-01T00:00:00Z', false);
    const moon = makeMahadasha('Moon', '2026-01-01T00:00:00Z', '2036-01-01T00:00:00Z', true);
    const vimshottari = makeVimshottari([sun, moon]);

    const result = findActivePeriodForMonth(vimshottari, '2022-06');
    expect(result.mahadashaLord).toBe('Sun');
    expect(result.startDate.getTime()).toBe(sun.startDate.getTime());
    expect(result.endDate.getTime()).toBe(sun.endDate.getTime());
  });

  it('computes the antardasha lord fresh via buildSubPeriods, matching a direct call', () => {
    const sun = makeMahadasha('Sun', '2020-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    const vimshottari = makeVimshottari([sun]);
    const target = new Date('2022-06-01T00:00:00Z');

    const result = findActivePeriodForMonth(vimshottari, '2022-06');

    const years = (sun.endDate.getTime() - sun.startDate.getTime()) / (365.25 * 86_400_000);
    const expectedAntardashas = buildSubPeriods('Sun', sun.startDate, years, 1, target, 1);
    const expectedAntardasha = expectedAntardashas.find(
      (p) => target.getTime() >= p.startDate.getTime() && target.getTime() < p.endDate.getTime(),
    );

    expect(expectedAntardasha).toBeDefined();
    expect(result.antardashaLord).toBe(expectedAntardasha?.planet);
  });

  it('ignores any pre-existing (possibly stale/empty) subPeriods on the mahadasha node and recomputes independently', () => {
    const sun = makeMahadasha('Sun', '2020-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    // Deliberately wrong subPeriods baked onto the fixture, simulating stale data.
    sun.subPeriods = [
      {
        planet: 'Rahu',
        startDate: sun.startDate,
        endDate: sun.endDate,
        isActive: true,
        level: 'antardasha',
        subPeriods: [],
      },
    ];
    const vimshottari = makeVimshottari([sun]);
    const result = findActivePeriodForMonth(vimshottari, '2022-06');
    expect(result.antardashaLord).not.toBe('Rahu');
  });

  it('resolves a target exactly at a mahadasha boundary to the NEXT mahadasha (start-inclusive, end-exclusive)', () => {
    const sun = makeMahadasha('Sun', '2020-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    const moon = makeMahadasha('Moon', '2026-01-01T00:00:00Z', '2036-01-01T00:00:00Z');
    const vimshottari = makeVimshottari([sun, moon]);
    const result = findActivePeriodForMonth(vimshottari, '2026-01');
    expect(result.mahadashaLord).toBe('Moon');
  });

  it('accepts both YYYY-MM and YYYY-MM-01 period formats identically', () => {
    const sun = makeMahadasha('Sun', '2020-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    const vimshottari = makeVimshottari([sun]);
    const a = findActivePeriodForMonth(vimshottari, '2022-06');
    const b = findActivePeriodForMonth(vimshottari, '2022-06-01');
    expect(a).toEqual(b);
  });

  it('throws a clear error when the target month falls outside every mahadasha window', () => {
    const sun = makeMahadasha('Sun', '2020-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    const vimshottari = makeVimshottari([sun]);
    expect(() => findActivePeriodForMonth(vimshottari, '2019-01')).toThrow();
  });
});

describe('computeMonthlyReportScore', () => {
  function makeAnalyses(overrides: Partial<Record<string, PlanetAnalysis['strength']>>): PlanetAnalysis[] {
    const planets = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
    return planets.map((planet) => ({
      planet,
      strength: overrides[planet] ?? 'average',
      reason: 'test',
      needsGemstone: false,
      preference: 50,
    }));
  }

  it('returns the base strength score with no adjustment when the lord has no connection to the key houses', () => {
    const analyses = makeAnalyses({ Venus: 'strong' });
    const chart = { planets: [{ planet: 'Venus', house: 3 }], houses: [{ house: 3, lord: 'Venus' }] };
    // Key houses [6, 1] — Venus rules house 3 and sits in house 3, neither is a key house.
    expect(computeMonthlyReportScore('Venus', [6, 1], chart, analyses)).toBe(90);
  });

  it('adds +15 when a non-weak lord rules one of the key houses', () => {
    const analyses = makeAnalyses({ Mars: 'average' });
    const chart = { planets: [{ planet: 'Mars', house: 3 }], houses: [{ house: 6, lord: 'Mars' }] };
    expect(computeMonthlyReportScore('Mars', [6, 1], chart, analyses)).toBe(75); // 60 + 15
  });

  it('adds +15 when a non-weak lord physically sits in one of the key houses', () => {
    const analyses = makeAnalyses({ Saturn: 'strong' });
    const chart = { planets: [{ planet: 'Saturn', house: 1 }], houses: [] };
    expect(computeMonthlyReportScore('Saturn', [6, 1], chart, analyses)).toBe(100); // 90 + 15, would be 105 but clamped
  });

  it('subtracts 15 when a WEAK lord has a connection to the key houses (affliction concentrated there)', () => {
    const analyses = makeAnalyses({ Jupiter: 'weak' });
    const chart = { planets: [{ planet: 'Jupiter', house: 10 }], houses: [] };
    expect(computeMonthlyReportScore('Jupiter', [10, 6], chart, analyses)).toBe(15); // 30 - 15
  });

  it('clamps the result to [0, 100]', () => {
    const analyses = makeAnalyses({ Mercury: 'weak' });
    const chart = { planets: [{ planet: 'Mercury', house: 6 }], houses: [] };
    const score = computeMonthlyReportScore('Mercury', [6, 1], chart, analyses);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

describe('toneFromMonthScore', () => {
  it('classifies <40 as challenging, 40-70 (inclusive) as mixed, >70 as favorable', () => {
    expect(toneFromMonthScore(15)).toBe('challenging');
    expect(toneFromMonthScore(39)).toBe('challenging');
    expect(toneFromMonthScore(40)).toBe('mixed');
    expect(toneFromMonthScore(60)).toBe('mixed');
    expect(toneFromMonthScore(70)).toBe('mixed');
    expect(toneFromMonthScore(71)).toBe('favorable');
    expect(toneFromMonthScore(100)).toBe('favorable');
  });
});

describe('safelyResolveActivePeriod', () => {
  const MS_PER_DAY = 86_400_000;
  const UNIX_EPOCH_JD = 2440587.5;
  function dateToJd(date: Date): number {
    return date.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
  }

  it('resolves a valid period when the chart and periodMonth are both usable', () => {
    const chart = {
      julianDay: dateToJd(new Date('1990-06-15T00:00:00Z')),
      planets: [{ planet: 'Moon', longitude: 80.5 }],
    };
    const result = safelyResolveActivePeriod(chart, '2000-01');
    expect(result).not.toBeNull();
    expect(typeof result?.mahadashaLord).toBe('string');
  });

  it('never throws and returns null when periodMonth is null', () => {
    const chart = {
      julianDay: dateToJd(new Date('1990-06-15T00:00:00Z')),
      planets: [{ planet: 'Moon', longitude: 80.5 }],
    };
    expect(() => safelyResolveActivePeriod(chart, null)).not.toThrow();
    expect(safelyResolveActivePeriod(chart, null)).toBeNull();
  });

  it('never throws and returns null when the chart has no julianDay/Moon data', () => {
    expect(() => safelyResolveActivePeriod({ planets: [] }, '2000-01')).not.toThrow();
    expect(safelyResolveActivePeriod({ planets: [] }, '2000-01')).toBeNull();
  });

  it('never throws and returns null when the chart is null', () => {
    expect(() => safelyResolveActivePeriod(null, '2000-01')).not.toThrow();
    expect(safelyResolveActivePeriod(null, '2000-01')).toBeNull();
  });

  it('never throws and returns null when periodMonth falls outside the 120-year dasha span', () => {
    const chart = {
      julianDay: dateToJd(new Date('1990-06-15T00:00:00Z')),
      planets: [{ planet: 'Moon', longitude: 80.5 }],
    };
    expect(() => safelyResolveActivePeriod(chart, '1800-01')).not.toThrow();
    expect(safelyResolveActivePeriod(chart, '1800-01')).toBeNull();
  });
});
