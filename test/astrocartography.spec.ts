import { describe, expect, it } from 'vitest';
import { dateToJulianDay } from '../src/lib/astro-engine/index.js';
import {
  scoreRelocationCities,
  CANDIDATE_CITIES,
} from '../src/lib/astro-engine/astrocartography/index.js';

const VALID_SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

describe('scoreRelocationCities', () => {
  it('scores and ranks every candidate city, best-first', async () => {
    // 1990-05-20 06:30 IST (tz +5.5), same fixture as test/astro-engine.spec.ts.
    const jd = await dateToJulianDay(1990, 5, 20, 6, 30, 5.5);

    // Synthetic natal placements covering both benefics and malefics.
    const natalPlanets = [
      { planet: 'Jupiter', signIndex: 0 },
      { planet: 'Venus', signIndex: 3 },
      { planet: 'Saturn', signIndex: 6 },
      { planet: 'Mars', signIndex: 9 },
      { planet: 'Sun', signIndex: 5 },
    ];

    const results = await scoreRelocationCities(jd, natalPlanets, CANDIDATE_CITIES);

    expect(results).toHaveLength(CANDIDATE_CITIES.length);
    // Sorted best (highest score) first.
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
    for (const r of results) {
      expect(VALID_SIGNS).toContain(r.ascendantSign);
      expect(r.score).toBe(r.angularBenefics.length - r.angularMalefics.length);
      // Every angular planet must be classified as either benefic or malefic,
      // never both, and only from the natal set provided.
      for (const p of [...r.angularBenefics, ...r.angularMalefics]) {
        expect(natalPlanets.some((n) => n.planet === p)).toBe(true);
      }
    }
  }, 20_000);

  it('produces different ascendant signs across widely separated cities', async () => {
    const jd = await dateToJulianDay(1990, 5, 20, 6, 30, 5.5);
    const results = await scoreRelocationCities(
      jd,
      [{ planet: 'Jupiter', signIndex: 0 }],
      [
        CANDIDATE_CITIES.find((c) => c.name === 'Mumbai')!,
        CANDIDATE_CITIES.find((c) => c.name === 'New York')!,
        CANDIDATE_CITIES.find((c) => c.name === 'Sydney')!,
      ],
    );

    const signs = new Set(results.map((r) => r.ascendantSign));
    // Relocating across ~180° of longitude at a fixed instant should shift
    // the ascendant — this would be a single repeated sign if relocation
    // math were silently ignoring lat/lng.
    expect(signs.size).toBeGreaterThan(1);
  }, 20_000);

  it('defaults to the full curated city list when none is passed', async () => {
    const jd = await dateToJulianDay(1990, 5, 20, 6, 30, 5.5);
    const results = await scoreRelocationCities(jd, [{ planet: 'Moon', signIndex: 2 }]);
    expect(results).toHaveLength(CANDIDATE_CITIES.length);
  }, 20_000);
});
