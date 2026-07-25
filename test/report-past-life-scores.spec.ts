import { describe, expect, it } from 'vitest';
import { computePastLifeScores } from '../src/lib/astro-engine/reports/past-life.js';

function makeChart(opts: {
  rahu?: { house: number; sign: string };
  ketu?: { house: number; sign: string };
  extraPlanets?: Array<{ planet: string; house: number; sign?: string }>;
  twelfthLord?: string;
  twelfthLordSign?: string;
} = {}): Record<string, unknown> {
  const planets: Record<string, unknown>[] = [];
  if (opts.rahu) planets.push({ planet: 'Rahu', house: opts.rahu.house, sign: opts.rahu.sign });
  if (opts.ketu) planets.push({ planet: 'Ketu', house: opts.ketu.house, sign: opts.ketu.sign });
  for (const p of opts.extraPlanets ?? []) planets.push(p);
  if (opts.twelfthLord) planets.push({ planet: opts.twelfthLord, sign: opts.twelfthLordSign ?? 'Aries' });

  return {
    planets,
    houses: opts.twelfthLord ? [{ house: 12, lord: opts.twelfthLord, sign: 'Pisces' }] : [],
  };
}

describe('computePastLifeScores', () => {
  it('reads Rahu house + sign directly from chart data', () => {
    const chart = makeChart({ rahu: { house: 3, sign: 'Gemini' } });
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.rahuHouse).toBe(3);
    expect(scores.rahuSign).toBe('Gemini');
  });

  it('reads Ketu house + sign directly from chart data — verified from data, not assumed opposite', () => {
    // Deliberately NOT the geometric opposite of the Rahu fixture above, to prove this function
    // reads Ketu's own chart entry rather than deriving/assuming it from Rahu's position.
    const chart = makeChart({
      rahu: { house: 3, sign: 'Gemini' },
      ketu: { house: 9, sign: 'Sagittarius' },
    });
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.ketuHouse).toBe(9);
    expect(scores.ketuSign).toBe('Sagittarius');
  });

  it('reports the 12th-lord strength via analyzePlanetStrengths + chart-facts house lookup', () => {
    // Mercury in own sign Virgo => strong.
    const chart = makeChart({ twelfthLord: 'Mercury', twelfthLordSign: 'Virgo' });
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.twelfthLordStrength).toBe('strong');
  });

  it('defaults 12th-lord strength to average when house data is missing', () => {
    const chart = makeChart({});
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.twelfthLordStrength).toBe('average');
  });

  it('flags planets conjunct Rahu or Ketu (same house), excluding Rahu/Ketu themselves', () => {
    const chart = makeChart({
      rahu: { house: 3, sign: 'Gemini' },
      ketu: { house: 9, sign: 'Sagittarius' },
      extraPlanets: [
        { planet: 'Mars', house: 3 }, // conjunct Rahu
        { planet: 'Jupiter', house: 9 }, // conjunct Ketu
        { planet: 'Venus', house: 5 }, // not conjunct either
      ],
    });
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.conjunctPlanets.sort()).toEqual(['Jupiter', 'Mars']);
  });

  it('returns an empty conjunctPlanets array when nothing conjuncts Rahu/Ketu', () => {
    const chart = makeChart({
      rahu: { house: 3, sign: 'Gemini' },
      ketu: { house: 9, sign: 'Sagittarius' },
      extraPlanets: [{ planet: 'Venus', house: 5 }],
    });
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.conjunctPlanets).toEqual([]);
  });

  it('handles a null chart defensively without throwing', () => {
    expect(() => computePastLifeScores({ chart: null, partnerChart: null }, null)).not.toThrow();
    const scores = computePastLifeScores({ chart: null, partnerChart: null }, null);
    expect(scores.rahuHouse).toBeNull();
    expect(scores.ketuHouse).toBeNull();
    expect(scores.conjunctPlanets).toEqual([]);
  });
});
