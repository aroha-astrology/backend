import { describe, expect, it } from 'vitest';
import {
  getPlanetPosition,
  getHouseFact,
  getHouseLord,
  getHouseSign,
  getHousesRuledBy,
  isPlanetInHouse,
  STRENGTH_SCORE,
  strengthOfPlanet,
  strengthScoreOfPlanet,
  julianDayToDate,
  getVimshottariDashaFromChart,
} from '../src/lib/astro-engine/reports/chart-facts.js';
import { calculateVimshottariDasha } from '../src/lib/astro-engine/dashas/vimshottari.js';
import type { PlanetAnalysis } from '../src/lib/astro-engine/gemstones.js';

/** Minimal chart fixture matching the real ChartData shape (planets[], houses[]). */
function makeChart(): Record<string, unknown> {
  return {
    ascendant: { sign: 'Aries', signIndex: 0 },
    planets: [
      { planet: 'Sun', sign: 'Leo', signIndex: 4, house: 5, longitude: 130, isRetrograde: false },
      {
        planet: 'Venus',
        sign: 'Libra',
        signIndex: 6,
        house: 7,
        longitude: 190,
        isRetrograde: false,
      },
      { planet: 'Mars', sign: 'Aries', signIndex: 0, house: 1, longitude: 10, isRetrograde: false },
      {
        planet: 'Jupiter',
        sign: 'Cancer',
        signIndex: 3,
        house: 4,
        longitude: 100,
        isRetrograde: false,
      },
    ],
    houses: [
      { house: 1, lord: 'Mars', sign: 'Aries' },
      { house: 4, lord: 'Moon', sign: 'Cancer' },
      { house: 5, lord: 'Sun', sign: 'Leo' },
      { house: 7, lord: 'Venus', sign: 'Libra' },
    ],
  };
}

describe('getPlanetPosition', () => {
  it('finds a planet by name in chart.planets', () => {
    const pos = getPlanetPosition('Venus', makeChart());
    expect(pos?.sign).toBe('Libra');
    expect(pos?.house).toBe(7);
  });

  it('returns undefined for a planet not present', () => {
    expect(getPlanetPosition('Saturn', makeChart())).toBeUndefined();
  });

  it('returns undefined for a null chart', () => {
    expect(getPlanetPosition('Venus', null)).toBeUndefined();
  });
});

describe('getHouseFact / getHouseLord / getHouseSign', () => {
  it('finds house data by house number', () => {
    expect(getHouseFact(7, makeChart())).toEqual({ house: 7, lord: 'Venus', sign: 'Libra' });
  });

  it('getHouseLord returns the lord planet name', () => {
    expect(getHouseLord(1, makeChart())).toBe('Mars');
    expect(getHouseLord(4, makeChart())).toBe('Moon');
  });

  it('getHouseSign returns the house sign', () => {
    expect(getHouseSign(5, makeChart())).toBe('Leo');
  });

  it('returns undefined for a house not present / null chart', () => {
    expect(getHouseLord(9, makeChart())).toBeUndefined();
    expect(getHouseLord(1, null)).toBeUndefined();
  });
});

describe('getHousesRuledBy', () => {
  it('returns every house number whose lord is the given planet', () => {
    expect(getHousesRuledBy('Venus', makeChart())).toEqual([7]);
  });

  it('returns an empty array when the planet rules no house in the data', () => {
    expect(getHousesRuledBy('Saturn', makeChart())).toEqual([]);
  });
});

describe('isPlanetInHouse', () => {
  it('returns true when the planet sits in one of the given houses', () => {
    expect(isPlanetInHouse('Venus', [6, 7, 8], makeChart())).toBe(true);
  });

  it('returns false when the planet is not in any given house', () => {
    expect(isPlanetInHouse('Venus', [1, 2, 3], makeChart())).toBe(false);
  });

  it('returns false when the planet is missing from the chart', () => {
    expect(isPlanetInHouse('Saturn', [1, 2, 3], makeChart())).toBe(false);
  });
});

describe('strength <-> numeric score mapping', () => {
  function makeAnalyses(
    overrides: Partial<Record<string, PlanetAnalysis['strength']>>,
  ): PlanetAnalysis[] {
    const planets = [
      'Sun',
      'Moon',
      'Mars',
      'Mercury',
      'Jupiter',
      'Venus',
      'Saturn',
      'Rahu',
      'Ketu',
    ];
    return planets.map((planet) => ({
      planet,
      strength: overrides[planet] ?? 'average',
      reason: 'test',
      needsGemstone: false,
      preference: 50,
    }));
  }

  it('STRENGTH_SCORE maps weak=30, average=60, strong=90 (documented mapping)', () => {
    expect(STRENGTH_SCORE).toEqual({ weak: 30, average: 60, strong: 90 });
  });

  it("strengthOfPlanet looks up a planet's strength from the analysis array", () => {
    const analyses = makeAnalyses({ Venus: 'strong' });
    expect(strengthOfPlanet('Venus', analyses)).toBe('strong');
  });

  it('strengthOfPlanet defaults to "average" when the planet is missing from analyses', () => {
    expect(strengthOfPlanet('Venus', [])).toBe('average');
  });

  it('strengthScoreOfPlanet converts strength to its numeric score', () => {
    const analyses = makeAnalyses({ Jupiter: 'weak' });
    expect(strengthScoreOfPlanet('Jupiter', analyses)).toBe(30);
    expect(strengthScoreOfPlanet('Venus', analyses)).toBe(60); // default average, not overridden
  });
});

describe('julianDayToDate', () => {
  // Cross-check against the well-known JD<->Unix-epoch relationship
  // (unixMs = (jd - 2440587.5) * 86_400_000) rather than a hand-derived JD table —
  // an independent verification of the Meeus algorithm's correctness.
  const MS_PER_DAY = 86_400_000;
  const UNIX_EPOCH_JD = 2440587.5;

  it.each([2440587.5, 2451545.0, 2415020.5, 2460000.0])(
    'matches the JD<->Unix-epoch formula for jd=%f',
    (jd) => {
      const expectedMs = (jd - UNIX_EPOCH_JD) * MS_PER_DAY;
      const actualMs = julianDayToDate(jd).getTime();
      expect(Math.abs(actualMs - expectedMs)).toBeLessThan(1000); // sub-second truncation only
    },
  );
});

describe('getVimshottariDashaFromChart', () => {
  function makeDashaChart(): Record<string, unknown> {
    return {
      julianDay: 2451545.0, // 2000-01-01
      planets: [{ planet: 'Moon', longitude: 123.45, sign: 'Leo', signIndex: 4, house: 5 }],
    };
  }

  it('derives the same VimshottariDasha calculateVimshottariDasha would produce from the equivalent birthDate/moonLongitude', () => {
    const chart = makeDashaChart();
    const result = getVimshottariDashaFromChart(chart);
    expect(result).not.toBeNull();

    const birthDate = julianDayToDate(2451545.0);
    const expected = calculateVimshottariDasha(123.45, birthDate);

    expect(result!.mahadashas).toHaveLength(expected.mahadashas.length);
    expect(result!.mahadashas[0]!.planet).toBe(expected.mahadashas[0]!.planet);
    expect(result!.mahadashas[0]!.startDate.getTime()).toBe(
      expected.mahadashas[0]!.startDate.getTime(),
    );
  });

  it('returns null when the chart is null', () => {
    expect(getVimshottariDashaFromChart(null)).toBeNull();
  });

  it('returns null when the chart has no Moon entry', () => {
    expect(getVimshottariDashaFromChart({ julianDay: 2451545.0, planets: [] })).toBeNull();
  });

  it('returns null when the chart has no julianDay', () => {
    expect(
      getVimshottariDashaFromChart({ planets: [{ planet: 'Moon', longitude: 10 }] }),
    ).toBeNull();
  });
});
