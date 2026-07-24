import { describe, expect, it } from 'vitest';
import {
  buildPlanetPositions,
  buildHouseTable,
  buildYogaList,
  buildDoshaList,
  buildDashaTimeline,
  buildAshtakavargaSummary,
  buildShadbalaSummary,
} from '../src/lib/flagship/chartSummary.js';

describe('buildPlanetPositions', () => {
  it('maps a realistic fixture chart into presentation-ready planet rows', () => {
    const chart = {
      planets: [
        {
          planet: 'Sun',
          sign: 'Aries',
          house: 10,
          nakshatra: 'Ashwini',
          nakshatraPada: 2,
          isRetrograde: false,
        },
        {
          planet: 'Saturn',
          sign: 'Aquarius',
          house: 3,
          nakshatra: 'Shatabhisha',
          nakshatraPada: 4,
          isRetrograde: true,
        },
      ],
    };

    const result = buildPlanetPositions(chart);
    expect(result).toEqual([
      {
        planet: 'Sun',
        sign: 'Aries',
        house: 10,
        nakshatra: 'Ashwini',
        nakshatraPada: 2,
        isRetrograde: false,
      },
      {
        planet: 'Saturn',
        sign: 'Aquarius',
        house: 3,
        nakshatra: 'Shatabhisha',
        nakshatraPada: 4,
        isRetrograde: true,
      },
    ]);
  });

  it('filters out entries without a planet name and defaults missing fields', () => {
    const chart = { planets: [{ sign: 'Aries' }, { planet: 'Moon' }] };
    const result = buildPlanetPositions(chart);
    expect(result).toEqual([
      {
        planet: 'Moon',
        sign: '',
        house: 0,
        nakshatra: '',
        nakshatraPada: 0,
        isRetrograde: false,
      },
    ]);
  });

  it('returns an empty array (not a throw) for a null chart', () => {
    expect(buildPlanetPositions(null)).toEqual([]);
  });
});

describe('buildHouseTable', () => {
  it('sorts a realistic fixture chart into ascending house order', () => {
    const chart = {
      houses: [
        { house: 3, sign: 'Gemini', lord: 'Mercury' },
        { house: 1, sign: 'Aries', lord: 'Mars' },
        { house: 2, sign: 'Taurus', lord: 'Venus' },
      ],
    };
    expect(buildHouseTable(chart)).toEqual([
      { house: 1, sign: 'Aries', lord: 'Mars' },
      { house: 2, sign: 'Taurus', lord: 'Venus' },
      { house: 3, sign: 'Gemini', lord: 'Mercury' },
    ]);
  });

  it('returns an empty array (not a throw) for a null chart', () => {
    expect(buildHouseTable(null)).toEqual([]);
  });

  it('returns an empty array for a chart with no houses key', () => {
    expect(buildHouseTable({})).toEqual([]);
  });
});

describe('buildYogaList', () => {
  it('filters to present yogas only and sorts strongest first', () => {
    const yogas = {
      yogas: [
        { name: 'Gajakesari Yoga', type: 'raja', present: true, strength: 60, description: 'a' },
        { name: 'Neecha Bhanga', type: 'raja', present: false, strength: 90, description: 'b' },
        { name: 'Chandra Mangal', type: 'dhana', present: true, strength: 85, description: 'c' },
      ],
    };
    expect(buildYogaList(yogas)).toEqual([
      { name: 'Chandra Mangal', type: 'dhana', description: 'c', strength: 85 },
      { name: 'Gajakesari Yoga', type: 'raja', description: 'a', strength: 60 },
    ]);
  });

  it('returns an empty array (not a throw) for null yogas data', () => {
    expect(buildYogaList(null)).toEqual([]);
  });
});

describe('buildDoshaList', () => {
  it('maps a realistic fixture of present doshas, using .active for sadeSati and .present for the rest', () => {
    const doshas = {
      mangal: { present: true, severity: 'high', description: 'Mars afflicted' },
      sadeSati: { active: true, severity: 'peak', description: 'Saturn transiting Moon sign' },
      pitra: { present: false, severity: 'none', description: '' },
    };
    expect(buildDoshaList(doshas)).toEqual([
      { name: 'Mangal Dosha', present: true, severity: 'high', description: 'Mars afflicted' },
      {
        name: 'Sade Sati',
        present: true,
        severity: 'peak',
        description: 'Saturn transiting Moon sign',
      },
      { name: 'Pitra Dosha', present: false, severity: 'none', description: '' },
    ]);
  });

  it('skips dosha keys entirely absent from the input', () => {
    const doshas = { mangal: { present: true, severity: 'low', description: 'x' } };
    expect(buildDoshaList(doshas)).toEqual([
      { name: 'Mangal Dosha', present: true, severity: 'low', description: 'x' },
    ]);
  });

  it('returns an empty array (not a throw) for null doshas data', () => {
    expect(buildDoshaList(null)).toEqual([]);
  });
});

describe('buildDashaTimeline', () => {
  it('maps a realistic fixture, flagging the current mahadasha and trimming dates to YYYY-MM-DD', () => {
    const dasha = {
      vimshottari: {
        mahadashas: [
          { planet: 'Venus', startDate: '2015-03-01T00:00:00Z', endDate: '2035-03-01T00:00:00Z' },
          { planet: 'Sun', startDate: '2035-03-01T00:00:00Z', endDate: '2041-03-01T00:00:00Z' },
        ],
        currentMahadasha: { planet: 'Venus' },
      },
    };
    expect(buildDashaTimeline(dasha)).toEqual([
      { planet: 'Venus', startDate: '2015-03-01', endDate: '2035-03-01', isCurrent: true },
      { planet: 'Sun', startDate: '2035-03-01', endDate: '2041-03-01', isCurrent: false },
    ]);
  });

  it('falls back to a "periods" key when "mahadashas" is absent', () => {
    const dasha = {
      vimshottari: {
        periods: [{ planet: 'Mars', startDate: '2020-01-01', endDate: '2027-01-01' }],
      },
    };
    expect(buildDashaTimeline(dasha)).toEqual([
      { planet: 'Mars', startDate: '2020-01-01', endDate: '2027-01-01', isCurrent: false },
    ]);
  });

  it('returns an empty array (not a throw) for null dasha data', () => {
    expect(buildDashaTimeline(null)).toEqual([]);
  });
});

describe('buildAshtakavargaSummary', () => {
  it('maps a realistic fixture of 12 sarva bindu counts to their zodiac signs in order', () => {
    const ashtakavarga = {
      sarva: {
        bindus: [28, 30, 25, 27, 32, 29, 26, 24, 31, 22, 23, 30],
      },
    };
    const result = buildAshtakavargaSummary(ashtakavarga);
    expect(result.bySign).toHaveLength(12);
    expect(result.bySign[0]).toEqual({ sign: 'Aries', bindus: 28 });
    expect(result.bySign[4]).toEqual({ sign: 'Leo', bindus: 32 });
    expect(result.bySign[11]).toEqual({ sign: 'Pisces', bindus: 30 });
  });

  it('returns an empty bySign array (not a throw) for null ashtakavarga data', () => {
    expect(buildAshtakavargaSummary(null)).toEqual({ bySign: [] });
  });
});

describe('buildShadbalaSummary', () => {
  // A realistic (if astrologically simplified) natal chart: all 7 Shadbala
  // planets present with the fields the real engine reads (longitude, house,
  // speed, sign), plus julianDay for the time-based Kala Bala components.
  // Rahu/Ketu are included to confirm they're excluded from the output
  // (calculateShadbala only scores the 7 classical Shadbala planets).
  const REALISTIC_CHART: Record<string, unknown> = {
    julianDay: 2451545.0, // 2000-01-01 12:00 UTC
    planets: [
      { planet: 'Sun', longitude: 285, house: 10, speed: 1.0, sign: 'Capricorn' },
      { planet: 'Moon', longitude: 40, house: 4, speed: 13.2, sign: 'Taurus' },
      { planet: 'Mars', longitude: 10, house: 1, speed: 0.5, sign: 'Aries' },
      { planet: 'Mercury', longitude: 260, house: 1, speed: 1.3, sign: 'Sagittarius' },
      { planet: 'Jupiter', longitude: 95, house: 1, speed: 0.08, sign: 'Cancer' },
      { planet: 'Venus', longitude: 15, house: 4, speed: 1.1, sign: 'Aries' },
      { planet: 'Saturn', longitude: 220, house: 7, speed: -0.03, sign: 'Libra' },
      { planet: 'Rahu', longitude: 100, house: 2, speed: -0.05, sign: 'Cancer' },
      { planet: 'Ketu', longitude: 280, house: 8, speed: -0.05, sign: 'Capricorn' },
    ],
  };

  it('computes a Shadbala row for each of the 7 classical planets, ranked strongest to weakest', () => {
    const result = buildShadbalaSummary(REALISTIC_CHART);

    expect(result).toHaveLength(7);
    const planets = result.map((r) => r.planet);
    expect(planets).toEqual(
      expect.arrayContaining(['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']),
    );
    expect(planets).not.toContain('Rahu');
    expect(planets).not.toContain('Ketu');

    // Ranked strongest to weakest by totalVirupas.
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.totalVirupas).toBeGreaterThanOrEqual(result[i]!.totalVirupas);
    }

    // Every row carries the real engine's full shape, not a collapsed one.
    const requiredByPlanet: Record<string, number> = {
      Sun: 390,
      Moon: 360,
      Mars: 300,
      Mercury: 420,
      Jupiter: 390,
      Venus: 330,
      Saturn: 300,
    };
    for (const row of result) {
      expect(typeof row.totalVirupas).toBe('number');
      expect(row.requiredVirupas).toBe(requiredByPlanet[row.planet]);
      expect(typeof row.isStrong).toBe('boolean');
      expect(row.isStrong).toBe(row.totalVirupas >= row.requiredVirupas);
      expect(typeof row.sthanaBala).toBe('number');
      expect(typeof row.digBala).toBe('number');
      expect(typeof row.kalaBala).toBe('number');
      expect(typeof row.cheshtaBala).toBe('number');
      expect(typeof row.naisargikaBala).toBe('number');
      expect(typeof row.drikBala).toBe('number');
    }
  });

  it('only scores planets actually present in the chart (partial data does not throw)', () => {
    const result = buildShadbalaSummary({
      julianDay: 2451545.0,
      planets: [{ planet: 'Sun', longitude: 100, house: 5, speed: 1.0, sign: 'Cancer' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.planet).toBe('Sun');
  });

  it('returns an empty array (not a throw) for a null chart', () => {
    expect(buildShadbalaSummary(null)).toEqual([]);
  });

  it('returns an empty array (not a throw) for a chart with no planets', () => {
    expect(buildShadbalaSummary({ planets: [] })).toEqual([]);
  });
});
