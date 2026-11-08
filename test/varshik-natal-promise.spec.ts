import { describe, it, expect } from 'vitest';
import type { ChartData } from '@aroha-astrology/shared';
import { natalPromise, promiseCeiling, capByPromise } from '../src/lib/astro-engine/reports/natal-promise.js';

const chart = (asc: number, planets: Record<string, number>): ChartData =>
  ({
    ascendant: { signIndex: asc, degree: 10 },
    planets: Object.entries(planets).map(([planet, lon]) => ({ planet, longitude: lon, signIndex: Math.floor(lon / 30), isRetrograde: false })),
  }) as unknown as ChartData;

describe('natal promise', () => {
  // Aries Lagna: the 10th is Capricorn, lord Saturn.
  it('a 10th lord in its own sign with Jupiter looking at the house promises a lot', () => {
    // Saturn in Aquarius (own), Jupiter in Taurus (7th aspect reaches Scorpio; 9th reaches Capricorn)
    const strong = natalPromise(chart(0, { Saturn: 10 * 30 + 5, Jupiter: 1 * 30 + 5 }), 10);
    expect(strong.score).toBeGreaterThan(0.5);
  });
  it('a 10th lord fallen in the 8th, with Mars in the house, promises little', () => {
    // Saturn in Aries (fall) is the 1st; use the 8th (Scorpio) instead, Mars in Capricorn.
    const weak = natalPromise(chart(0, { Saturn: 7 * 30 + 5, Mars: 9 * 30 + 5 }), 10);
    expect(weak.score).toBeLessThan(0);
    expect(weak.parts.lordInDusthana).toBeLessThan(0);
    expect(weak.parts.malefics).toBeLessThan(0);
  });
  it('the ceiling runs from 0.4 at -1 to 1 at +0.3 and above', () => {
    expect(promiseCeiling(-1)).toBeCloseTo(0.4, 9);
    expect(promiseCeiling(0.3)).toBe(1);
    expect(promiseCeiling(1)).toBe(1);
    expect(promiseCeiling(-0.35)).toBeGreaterThan(0.4);
    expect(promiseCeiling(-0.35)).toBeLessThan(1);
  });
  it('caps a good signal, never lifts a bad one', () => {
    expect(capByPromise(0.9, -1)).toBeCloseTo(0.4, 9);
    expect(capByPromise(0.2, -1)).toBe(0.2);
    expect(capByPromise(-0.7, -1)).toBe(-0.7);
    expect(capByPromise(0.9, 0.8)).toBe(0.9);
  });
});
