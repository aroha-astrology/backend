import { describe, it, expect } from 'vitest';
import {
  mahadashaBand,
  narrowByAntardasha,
  gocharaFraction,
  computeAggregateScore,
} from '../src/lib/astro-tools/daily-synthesis.js';
import type { DashaTranistDetail } from '../src/lib/astro-tools/daily-synthesis.js';

function dashaDetail(qualityScore: number): DashaTranistDetail {
  return {
    planet: 'Test',
    transitSign: 'Aries',
    dignity: 'neutral',
    qualityScore,
    description: 'test fixture',
  };
}

describe('mahadashaBand: Mahadasha sets the absolute score band', () => {
  it('returns the full 1-5 range when no Mahadasha data is available', () => {
    expect(mahadashaBand(undefined)).toEqual([1, 5]);
  });

  it('gives a debilitated (qualityScore 0) Mahadasha lord the lowest band', () => {
    const [, ceiling] = mahadashaBand(dashaDetail(0));
    expect(ceiling).toBeLessThan(4);
  });

  it('gives an exalted (qualityScore 5) Mahadasha lord the highest band', () => {
    const [floor] = mahadashaBand(dashaDetail(5));
    expect(floor).toBeGreaterThan(2);
  });

  it('produces a strictly wider-or-equal ceiling as qualityScore rises (monotonic)', () => {
    const ceilings = [0, 1, 2, 3, 4, 5].map((q) => mahadashaBand(dashaDetail(q))[1]);
    for (let i = 1; i < ceilings.length; i++) {
      expect(ceilings[i]).toBeGreaterThanOrEqual(ceilings[i - 1]!);
    }
  });

  it('always stays within the overall 1-5 scale', () => {
    for (let q = 0; q <= 5; q++) {
      const [floor, ceiling] = mahadashaBand(dashaDetail(q));
      expect(floor).toBeGreaterThanOrEqual(1);
      expect(ceiling).toBeLessThanOrEqual(5);
      expect(floor).toBeLessThanOrEqual(ceiling);
    }
  });
});

describe('narrowByAntardasha: Antardasha narrows the Mahadasha band, never breaks it', () => {
  it('returns the Mahadasha band unchanged when no Antardasha data is available', () => {
    const mdBand: [number, number] = [2, 4];
    expect(narrowByAntardasha(mdBand, undefined)).toEqual(mdBand);
  });

  it('never produces a floor below or a ceiling above the Mahadasha band', () => {
    const mdBand: [number, number] = [2, 4];
    for (let q = 0; q <= 5; q++) {
      const [floor, ceiling] = narrowByAntardasha(mdBand, dashaDetail(q));
      expect(floor).toBeGreaterThanOrEqual(mdBand[0]);
      expect(ceiling).toBeLessThanOrEqual(mdBand[1]);
    }
  });

  it('produces a narrower-or-equal band than the input Mahadasha band', () => {
    const mdBand: [number, number] = [1, 5];
    for (let q = 0; q <= 5; q++) {
      const [floor, ceiling] = narrowByAntardasha(mdBand, dashaDetail(q));
      expect(ceiling - floor).toBeLessThanOrEqual(mdBand[1] - mdBand[0]);
    }
  });

  it('shifts the narrowed band toward the high end for a strong Antardasha lord', () => {
    const mdBand: [number, number] = [1, 5];
    const weak = narrowByAntardasha(mdBand, dashaDetail(0));
    const strong = narrowByAntardasha(mdBand, dashaDetail(5));
    expect(strong[0]).toBeGreaterThan(weak[0]);
  });
});

describe('gocharaFraction: transits position the score WITHIN the band, in [0,1]', () => {
  it('is always within [0,1] regardless of input combination', () => {
    const qualities = ['good', 'average', 'poor'] as const;
    const lunarQualities = ['excellent', 'good', 'average', 'poor'] as const;
    for (const kq of qualities) {
      for (const lq of lunarQualities) {
        for (const vedhaCount of [0, 1, 2, 5]) {
          for (const dangerous of [true, false]) {
            const fraction = gocharaFraction({ quality: kq }, { overallQuality: lq }, vedhaCount, {
              isDangerous: dangerous,
            });
            expect(fraction).toBeGreaterThanOrEqual(0);
            expect(fraction).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it('rates a good Kakshya + excellent lunar day higher than a poor Kakshya + poor lunar day', () => {
    const good = gocharaFraction({ quality: 'good' }, { overallQuality: 'excellent' }, 0, {
      isDangerous: false,
    });
    const bad = gocharaFraction({ quality: 'poor' }, { overallQuality: 'poor' }, 3, {
      isDangerous: true,
    });
    expect(good).toBeGreaterThan(bad);
  });

  it('handles missing lunar/panchaka data without throwing', () => {
    expect(() => gocharaFraction({ quality: 'average' }, undefined, 0, undefined)).not.toThrow();
  });
});

describe('computeAggregateScore: the full hierarchy — MD sets bounds, AD narrows, Gochara positions within', () => {
  it("NO gochara combination can push the score outside the Mahadasha's band (the core audit fix)", () => {
    // A debilitated Mahadasha lord -> low band.
    const md = dashaDetail(0);
    const [floor, ceiling] = mahadashaBand(md);

    // Even the most favorable possible transits cannot escape the MD band.
    const bestCase = computeAggregateScore(
      md,
      dashaDetail(5),
      { quality: 'good' },
      { overallQuality: 'excellent' },
      0,
      { isDangerous: false },
    );
    expect(bestCase.score).toBeLessThanOrEqual(Math.round(ceiling));

    // Even the worst possible transits cannot fall below the MD band's floor.
    const worstCase = computeAggregateScore(
      md,
      dashaDetail(0),
      { quality: 'poor' },
      { overallQuality: 'poor' },
      5,
      { isDangerous: true },
    );
    expect(worstCase.score).toBeGreaterThanOrEqual(Math.max(1, Math.round(floor)));
  });

  it('returns a score always within 1-5', () => {
    for (let mdQ = 0; mdQ <= 5; mdQ++) {
      for (let adQ = 0; adQ <= 5; adQ++) {
        const result = computeAggregateScore(
          dashaDetail(mdQ),
          dashaDetail(adQ),
          { quality: 'average' },
          { overallQuality: 'average' },
          0,
          { isDangerous: false },
        );
        expect(result.score).toBeGreaterThanOrEqual(1);
        expect(result.score).toBeLessThanOrEqual(5);
      }
    }
  });

  it('emits a reasoning chain explaining the band and the transit position within it', () => {
    const result = computeAggregateScore(
      dashaDetail(4),
      dashaDetail(3),
      { quality: 'good' },
      { overallQuality: 'good' },
      0,
      { isDangerous: false },
    );
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.reasoning.join(' ')).toMatch(/mahadasha|major/i);
  });

  it('falls back to the full 1-5 range with no Dasha data at all, positioned purely by Gochara', () => {
    const withGoodTransits = computeAggregateScore(
      undefined,
      undefined,
      { quality: 'good' },
      { overallQuality: 'excellent' },
      0,
      { isDangerous: false },
    );
    const withBadTransits = computeAggregateScore(
      undefined,
      undefined,
      { quality: 'poor' },
      { overallQuality: 'poor' },
      3,
      { isDangerous: true },
    );
    expect(withGoodTransits.score).toBeGreaterThan(withBadTransits.score);
  });
});
