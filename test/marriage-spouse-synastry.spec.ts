import { describe, expect, it } from 'vitest';
import { computeSpouseSynastry } from '../src/lib/astro-engine/reports/marriage-spouse-synastry.js';

function makeChart(moonSign: string, moonNakshatraIndex: number): Record<string, unknown> {
  return {
    ascendant: { signIndex: 0 },
    planets: [
      { planet: 'Moon', sign: moonSign, nakshatraIndex: moonNakshatraIndex, house: 1 },
      { planet: 'Mars', sign: 'Aries', house: 1 },
    ],
    houses: [],
  };
}

describe('computeSpouseSynastry', () => {
  it('returns null when either chart is missing', () => {
    expect(computeSpouseSynastry(null, makeChart('Aries', 0), null)).toBeNull();
    expect(computeSpouseSynastry(makeChart('Aries', 0), null, null)).toBeNull();
  });

  it('computes guna milan, dashakoota, manglik, risk factors and spouse navamsa for two real charts', () => {
    const self = makeChart('Cancer', 6);
    const spouse = makeChart('Taurus', 3);
    const result = computeSpouseSynastry(self, spouse, null);
    expect(result).not.toBeNull();
    expect(result!.gunaMilanScore).toBeGreaterThanOrEqual(0);
    expect(result!.gunaMaxScore).toBe(36);
    expect(result!.gunaBreakdown.length).toBeGreaterThan(0);
    expect(['poor', 'average', 'good', 'excellent']).toContain(result!.compatibilityBand);
    expect(result!.dashakootaMaxScore).toBeGreaterThan(0);
    expect(typeof result!.manglikStatus.self).toBe('boolean');
    expect(typeof result!.manglikStatus.spouse).toBe('boolean');
    expect(result!.riskFactors.length).toBe(8);
    expect(Array.isArray(result!.spouseNavamsa)).toBe(true);
  });
});
