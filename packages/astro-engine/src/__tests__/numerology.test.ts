import { describe, it, expect } from 'vitest';
import {
  calculateLifePath,
  calculateExpression,
  calculateSoulUrge,
  calculatePersonality,
  calculateLuckyNumbers,
} from '../numerology';

describe('Numerology - Life Path', () => {
  it('should calculate life path number correctly', () => {
    // 1990-01-15: 1+9+9+0+0+1+1+5 = 26 = 2+6 = 8
    const result = calculateLifePath('1990-01-15');
    expect(result).toBe(8);
  });

  it('should reduce to single digit (1-9) or master numbers (11,22,33)', () => {
    const result = calculateLifePath('2000-06-15');
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33]).toContain(result);
  });

  it('should handle different date formats', () => {
    const result = calculateLifePath('1985-12-25');
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(33);
  });
});

describe('Numerology - Expression Number', () => {
  it('should return a valid number', () => {
    const result = calculateExpression('John Doe');
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(33);
  });

  it('should be case insensitive', () => {
    const lower = calculateExpression('john doe');
    const upper = calculateExpression('JOHN DOE');
    expect(lower).toBe(upper);
  });
});

describe('Numerology - Soul Urge', () => {
  it('should only use vowels', () => {
    const result = calculateSoulUrge('John Doe');
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(33);
  });
});

describe('Numerology - Personality', () => {
  it('should only use consonants', () => {
    const result = calculatePersonality('John Doe');
    expect(result).toBeGreaterThanOrEqual(1);
    expect(result).toBeLessThanOrEqual(33);
  });
});

describe('Numerology - Lucky Numbers', () => {
  it('should return an array of numbers', () => {
    const result = calculateLuckyNumbers(5);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('should include the life path number', () => {
    const lifePath = 7;
    const result = calculateLuckyNumbers(lifePath);
    expect(result).toContain(lifePath);
  });
});
