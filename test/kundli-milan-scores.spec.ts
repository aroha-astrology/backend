import { describe, expect, it } from 'vitest';
import { calculateAshtakoota } from '../src/lib/astro-engine/matching/ashtakoota.js';
import { calculateDashakoota } from '../src/lib/astro-engine/matching/dashakoota.js';
import {
  computeKundliMilanScores,
  getMoonPlacement,
} from '../src/lib/astro-engine/reports/kundli-milan.js';

/** Minimal chart fixture — only the fields getMoonPlacement/detectMangalDosha read. */
function makeChart(opts: {
  moonNakshatraIndex: number;
  moonSign: string;
  ascendantSignIndex?: number;
  mars?: { signIndex: number; sign: string };
}): Record<string, unknown> {
  const planets: Record<string, unknown>[] = [
    { planet: 'Moon', nakshatraIndex: opts.moonNakshatraIndex, sign: opts.moonSign, signIndex: 0 },
  ];
  if (opts.mars) {
    planets.push({ planet: 'Mars', signIndex: opts.mars.signIndex, sign: opts.mars.sign });
  }
  return {
    ascendant: { signIndex: opts.ascendantSignIndex ?? 0 },
    planets,
  };
}

describe('getMoonPlacement', () => {
  it('extracts the Moon nakshatraIndex and sign from a chart', () => {
    const chart = makeChart({ moonNakshatraIndex: 5, moonSign: 'Cancer' });
    expect(getMoonPlacement(chart)).toEqual({ nakshatraIndex: 5, sign: 'Cancer' });
  });

  it('falls back to Ashwini/Aries when the chart has no Moon entry', () => {
    expect(getMoonPlacement({ planets: [] })).toEqual({ nakshatraIndex: 0, sign: 'Aries' });
  });

  it('falls back to Ashwini/Aries when the chart is null', () => {
    expect(getMoonPlacement(null)).toEqual({ nakshatraIndex: 0, sign: 'Aries' });
  });
});

describe('computeKundliMilanScores', () => {
  it('delegates guna milan scoring to calculateAshtakoota using both Moon placements', () => {
    const chart1 = makeChart({ moonNakshatraIndex: 3, moonSign: 'Taurus' });
    const chart2 = makeChart({ moonNakshatraIndex: 20, moonSign: 'Capricorn' });

    const expected = calculateAshtakoota(3, 20, 'Taurus', 'Capricorn');
    const scores = computeKundliMilanScores({ chart: chart1, partnerChart: chart2 }, null);

    expect(scores.gunaMilanScore).toBe(expected.totalScore);
    expect(scores.gunaMaxScore).toBe(36);
    expect(scores.gunaBreakdown).toHaveLength(8);
  });

  it('delegates dashakoota scoring to calculateDashakoota using both Moon placements', () => {
    const chart1 = makeChart({ moonNakshatraIndex: 3, moonSign: 'Taurus' });
    const chart2 = makeChart({ moonNakshatraIndex: 20, moonSign: 'Capricorn' });

    const expected = calculateDashakoota(3, 20, 'Taurus', 'Capricorn');
    const scores = computeKundliMilanScores({ chart: chart1, partnerChart: chart2 }, null);

    expect(scores.dashakootaScore).toBe(expected.totalScore);
    expect(scores.dashakootaBreakdown).toHaveLength(10);
  });

  it('classifies compatibilityBand using the classical Ashtakoota thresholds', () => {
    // Same nakshatra/sign for both => maximal-ish guna score territory; we only
    // assert the threshold function behaves, not the exact classical score, by
    // checking the band is one of the 4 valid values and is internally consistent
    // with gunaMilanScore.
    const chart1 = makeChart({ moonNakshatraIndex: 3, moonSign: 'Taurus' });
    const chart2 = makeChart({ moonNakshatraIndex: 3, moonSign: 'Taurus' });
    const scores = computeKundliMilanScores({ chart: chart1, partnerChart: chart2 }, null);

    if (scores.gunaMilanScore < 18) expect(scores.compatibilityBand).toBe('poor');
    else if (scores.gunaMilanScore < 25) expect(scores.compatibilityBand).toBe('average');
    else if (scores.gunaMilanScore < 33) expect(scores.compatibilityBand).toBe('good');
    else expect(scores.compatibilityBand).toBe('excellent');
  });

  it('reports manglikStatus.person1/person2 from detectMangalDosha.present for each chart', () => {
    // Mars in house 1 from Lagna (ascendant signIndex 0, Mars signIndex 0) => Manglik present.
    const manglikChart = makeChart({
      moonNakshatraIndex: 3,
      moonSign: 'Taurus',
      ascendantSignIndex: 0,
      mars: { signIndex: 0, sign: 'Aries' },
    });
    const cleanChart = makeChart({
      moonNakshatraIndex: 20,
      moonSign: 'Capricorn',
      ascendantSignIndex: 0,
      // Mars far from any Manglik house (house 3 from Lagna) and not Aries/Scorpio.
      mars: { signIndex: 2, sign: 'Gemini' },
    });

    const scores = computeKundliMilanScores({ chart: manglikChart, partnerChart: cleanChart }, null);
    expect(scores.manglikStatus.person1).toBe(true);
    expect(scores.manglikStatus.person2).toBe(false);
  });

  it('sets manglikStatus.cancelled true when either person\'s dosha is classically cancelled', () => {
    // Mars in OWN sign (Aries) — an unconditional, reference-point-independent
    // cancellation per detectMangalDosha's own rules — while also sitting in a
    // Manglik house (house 1 from Lagna) so `present` is true and `type` becomes 'cancelled'.
    const cancelledManglikChart = makeChart({
      moonNakshatraIndex: 3,
      moonSign: 'Taurus',
      ascendantSignIndex: 0,
      mars: { signIndex: 0, sign: 'Aries' },
    });
    const cleanChart = makeChart({
      moonNakshatraIndex: 20,
      moonSign: 'Capricorn',
      ascendantSignIndex: 0,
      mars: { signIndex: 2, sign: 'Gemini' },
    });

    const scores = computeKundliMilanScores(
      { chart: cancelledManglikChart, partnerChart: cleanChart },
      null,
    );
    expect(scores.manglikStatus.person1).toBe(true);
    expect(scores.manglikStatus.cancelled).toBe(true);
  });

  it('handles a null partnerChart defensively without throwing', () => {
    const chart1 = makeChart({ moonNakshatraIndex: 3, moonSign: 'Taurus' });
    expect(() => computeKundliMilanScores({ chart: chart1, partnerChart: null }, null)).not.toThrow();
  });
});
