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

  it('populates candidateNames with real names actually starting with the derived syllable', () => {
    const longitude = 0.5; // Ashwini pada 1 -> syllable "Chu"
    const chart = makeChart(longitude);
    const scores = computeBabyNameScores({ chart, partnerChart: null }, null);

    expect(scores.startingSyllables).toEqual(['Chu']);
    expect(scores.candidateNames.length).toBeGreaterThan(0);
    for (const name of scores.candidateNames) {
      expect(name.toLowerCase().startsWith('chu')).toBe(true);
    }
    // No duplicates.
    expect(new Set(scores.candidateNames).size).toBe(scores.candidateNames.length);
  });

  it('narrows candidateNames by childGender ("boy"/"girl") when the reader answered that question', () => {
    const longitude = 0.5;
    const chart = makeChart(longitude);
    const boyScores = computeBabyNameScores(
      { chart, partnerChart: null, userAnswers: { childGender: 'boy' } },
      null,
    );
    const girlScores = computeBabyNameScores(
      { chart, partnerChart: null, userAnswers: { childGender: 'girl' } },
      null,
    );
    // The two gender-narrowed pools should not be identical (both non-empty for "Chu").
    expect(boyScores.candidateNames.length).toBeGreaterThan(0);
    expect(girlScores.candidateNames.length).toBeGreaterThan(0);
    expect(new Set(boyScores.candidateNames)).not.toEqual(new Set(girlScores.candidateNames));
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

  it('surfaces the nakshatra lord and deity from calculateNakshatra (not discarded)', () => {
    const longitude = 45.7;
    const chart = makeChart(longitude);
    const expected = calculateNakshatra(longitude);

    const scores = computeBabyNameScores({ chart, partnerChart: null }, null);
    expect(scores.nakshatraLord).toBe(expected.lord);
    expect(scores.nakshatraDeity).toBe(expected.deity);
    expect(scores.nakshatraLord).toBeTruthy();
    expect(scores.nakshatraDeity).toBeTruthy();
  });

  it('surfaces nakshatra lord/deity even on the no-Moon-data fallback path', () => {
    const scores = computeBabyNameScores({ chart: { planets: [] }, partnerChart: null }, null);
    const expected = calculateNakshatra(0);
    expect(scores.nakshatraLord).toBe(expected.lord);
    expect(scores.nakshatraDeity).toBe(expected.deity);
  });

  it('degrades to an empty dosha/yoga summary when doshaData/yogaData are missing, without throwing', () => {
    const chart = makeChart(0.5);
    expect(() => computeBabyNameScores({ chart, partnerChart: null }, null)).not.toThrow();
    const scores = computeBabyNameScores({ chart, partnerChart: null }, null);
    expect(scores.doshaYoga).toEqual({ positives: [], cautions: [] });
  });

  it('handles a null chart defensively for doshaYoga too', () => {
    const scores = computeBabyNameScores({ chart: null, partnerChart: null }, null);
    expect(scores.doshaYoga).toEqual({ positives: [], cautions: [] });
  });

  it('surfaces a Mangal Dosha caution and a Raja Yoga positive from ctx.doshaData/yogaData', () => {
    const chart = makeChart(0.5);
    const doshaData = { mangal: { present: true, severity: 'medium', type: 'high' } };
    const yogaData = {
      yogas: [
        {
          type: 'raja',
          name: 'Gaja Kesari Yoga',
          present: true,
          description: 'a favorable combination',
        },
      ],
    };
    const scores = computeBabyNameScores({ chart, partnerChart: null, doshaData, yogaData }, null);
    expect(scores.doshaYoga.cautions).toHaveLength(1);
    expect(scores.doshaYoga.cautions[0]?.label).toBe('Mangal Dosha');
    expect(scores.doshaYoga.positives).toHaveLength(1);
    expect(scores.doshaYoga.positives[0]?.label).toBe('Gaja Kesari Yoga');
  });

  it('ignores dosha/yoga keys outside its own relevant lists (mangal/kaalSarp, raja/dhana)', () => {
    const chart = makeChart(0.5);
    const doshaData = { pitra: { present: true, severity: 'high' } };
    const yogaData = {
      yogas: [{ type: 'gajakesari', name: 'Irrelevant', present: true, description: 'x' }],
    };
    const scores = computeBabyNameScores({ chart, partnerChart: null, doshaData, yogaData }, null);
    expect(scores.doshaYoga).toEqual({ positives: [], cautions: [] });
  });
});
