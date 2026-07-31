import { describe, it, expect } from 'vitest';
import { computeMuntha } from '../src/lib/astro-engine/varshphal/muntha.js';

describe('computeMuntha', () => {
  it('advances exactly one sign per completed year of age', () => {
    const natalAsc = 0; // Aries
    expect(computeMuntha(0, natalAsc, 0).signIndex).toBe(0);
    expect(computeMuntha(1, natalAsc, 0).signIndex).toBe(1);
    expect(computeMuntha(11, natalAsc, 0).signIndex).toBe(11);
    expect(computeMuntha(12, natalAsc, 0).signIndex).toBe(0); // wraps
    expect(computeMuntha(30, natalAsc, 0).signIndex).toBe(6);
  });

  it('offsets from the natal Ascendant sign, not always Aries', () => {
    const natalAsc = 5; // Virgo
    expect(computeMuntha(0, natalAsc, 0).signIndex).toBe(5);
    expect(computeMuntha(3, natalAsc, 0).signIndex).toBe(8);
  });

  it('computes house-from-Varsha-Ascendant correctly', () => {
    // Muntha sign 3 (Cancer), Varsha Asc sign 0 (Aries) -> house 4.
    const result = computeMuntha(3, 0, 0);
    expect(result.signIndex).toBe(3);
    expect(result.houseFromVarshaAsc).toBe(4);
  });

  it('flags houses 1,2,3,5,9,10,11 as auspicious and the rest as not', () => {
    const auspicious = [1, 2, 3, 5, 9, 10, 11];
    for (let h = 1; h <= 12; h++) {
      // Construct a muntha sign that lands exactly `h` houses from a fixed Varsha Asc of 0.
      const munthaSign = h - 1;
      const result = computeMuntha(munthaSign, 0, 0);
      expect(result.houseFromVarshaAsc).toBe(h);
      expect(result.isAuspicious).toBe(auspicious.includes(h));
    }
  });
});
