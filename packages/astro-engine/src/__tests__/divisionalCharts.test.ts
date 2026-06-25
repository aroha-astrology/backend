import { describe, it, expect } from 'vitest';
import {
  calculateD1,
  calculateD2,
  calculateD3,
  calculateD9,
  calculateD10,
  calculateD12,
} from '../charts/divisionalCharts';

describe('D1 - Rashi Chart', () => {
  it('should return sign index 0 (Aries) for longitude 0-30', () => {
    expect(calculateD1(0)).toBe(0);
    expect(calculateD1(15)).toBe(0);
    expect(calculateD1(29.9)).toBe(0);
  });

  it('should return sign index 1 (Taurus) for longitude 30-60', () => {
    expect(calculateD1(30)).toBe(1);
    expect(calculateD1(45)).toBe(1);
  });

  it('should return sign index 11 (Pisces) for longitude 330-360', () => {
    expect(calculateD1(340)).toBe(11);
  });
});

describe('D2 - Hora Chart', () => {
  it('should return a valid sign index (0-11)', () => {
    const result = calculateD2(15);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(11);
  });
});

describe('D3 - Drekkana Chart', () => {
  it('should map 0-10° of Aries to Aries (same sign)', () => {
    expect(calculateD3(5)).toBe(0); // Aries
  });

  it('should map 10-20° of Aries to Leo (5th from Aries)', () => {
    expect(calculateD3(15)).toBe(4); // Leo
  });

  it('should map 20-30° of Aries to Sagittarius (9th from Aries)', () => {
    expect(calculateD3(25)).toBe(8); // Sagittarius
  });
});

describe('D9 - Navamsa Chart', () => {
  it('should map 0° Aries to Aries (fire sign starts from Aries)', () => {
    expect(calculateD9(0)).toBe(0); // Aries
  });

  it('should map 3°20 Aries to Taurus (2nd navamsa of Aries)', () => {
    const deg = 3 + 20 / 60; // 3°20'
    expect(calculateD9(deg)).toBe(1); // Taurus
  });

  it('should return valid sign index for any longitude', () => {
    for (let i = 0; i < 360; i += 10) {
      const result = calculateD9(i);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(11);
    }
  });
});

describe('D10 - Dashamsha Chart', () => {
  it('should return valid sign index', () => {
    const result = calculateD10(100);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(11);
  });
});

describe('D12 - Dwadashamsha Chart', () => {
  it('should map first 2.5° of Aries to Aries', () => {
    expect(calculateD12(1)).toBe(0);
  });

  it('should map 2.5-5° of Aries to Taurus', () => {
    expect(calculateD12(3)).toBe(1);
  });

  it('should return valid sign index for all longitudes', () => {
    for (let i = 0; i < 360; i += 15) {
      const result = calculateD12(i);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(11);
    }
  });
});
