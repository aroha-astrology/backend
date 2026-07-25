import { describe, expect, it } from 'vitest';
import {
  computeBabyNameScores,
  NAKSHATRA_PADA_SYLLABLE,
} from '../src/lib/astro-engine/reports/baby-name.js';
import { calculateNakshatra } from '../src/lib/astro-engine/panchang/nakshatra.js';
import { NAKSHATRAS } from '@aroha-astrology/shared';

function makeChart(moonLongitude: number): Record<string, unknown> {
  return { planets: [{ planet: 'Moon', longitude: moonLongitude }] };
}

describe('NAKSHATRA_PADA_SYLLABLE table', () => {
  it('has all 27 nakshatras, each with exactly 4 pada syllables', () => {
    expect(Object.keys(NAKSHATRA_PADA_SYLLABLE)).toHaveLength(27);
    for (const name of NAKSHATRAS) {
      expect(NAKSHATRA_PADA_SYLLABLE[name]).toBeDefined();
      expect(NAKSHATRA_PADA_SYLLABLE[name]).toHaveLength(4);
    }
  });

  it('matches the standard classical table for a few spot-checked nakshatras', () => {
    expect(NAKSHATRA_PADA_SYLLABLE.Ashwini).toEqual(['Chu', 'Che', 'Cho', 'La']);
    expect(NAKSHATRA_PADA_SYLLABLE.Moola).toEqual(['Ye', 'Yo', 'Ba', 'Bi']); // classical table's "Mula"
    expect(NAKSHATRA_PADA_SYLLABLE.Revati).toEqual(['De', 'Do', 'Cha', 'Chi']);
  });
});

describe('computeBabyNameScores', () => {
  it('derives moonNakshatra/moonPada via the existing calculateNakshatra utility (not recomputed)', () => {
    const longitude = 45.7; // arbitrary
    const chart = makeChart(longitude);
    const expected = calculateNakshatra(longitude);

    const scores = computeBabyNameScores({ chart, partnerChart: null }, null);
    expect(scores.moonNakshatra).toBe(expected.name);
    expect(scores.moonPada).toBe(expected.pada);
  });

  it('returns the single starting syllable matching the nakshatra+pada from the table', () => {
    const longitude = 0.5; // early Ashwini, pada 1
    const chart = makeChart(longitude);
    const nakshatraData = calculateNakshatra(longitude);
    const scores = computeBabyNameScores({ chart, partnerChart: null }, null);

    expect(scores.startingSyllables).toEqual([
      NAKSHATRA_PADA_SYLLABLE[nakshatraData.name][nakshatraData.pada - 1],
    ]);
  });

  it('falls back to Ashwini pada 1 when the chart has no Moon longitude', () => {
    const scores = computeBabyNameScores({ chart: { planets: [] }, partnerChart: null }, null);
    expect(scores.moonNakshatra).toBe('Ashwini');
    expect(scores.moonPada).toBe(1);
    expect(scores.startingSyllables).toEqual(['Chu']);
  });

  it('handles a null chart defensively without throwing', () => {
    expect(() => computeBabyNameScores({ chart: null, partnerChart: null }, null)).not.toThrow();
  });
});
