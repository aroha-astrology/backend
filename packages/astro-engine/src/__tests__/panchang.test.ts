import { describe, it, expect } from 'vitest';
import { calculateTithi } from '../panchang/tithi';
import { calculateNakshatra } from '../panchang/nakshatra';
import { calculatePanchangYoga } from '../panchang/yoga';
import { calculateKarana } from '../panchang/karana';
import { calculateRahuKaal } from '../panchang/rahuKaal';

describe('Tithi Calculation', () => {
  it('should return a valid tithi number (1-30)', () => {
    const result = calculateTithi(100, 20);
    expect(result.number).toBeGreaterThanOrEqual(1);
    expect(result.number).toBeLessThanOrEqual(30);
  });

  it('should identify Shukla/Krishna paksha', () => {
    const result = calculateTithi(100, 20);
    expect(['Shukla', 'Krishna']).toContain(result.paksha);
  });

  it('should return tithi name', () => {
    const result = calculateTithi(100, 20);
    expect(result.name).toBeTruthy();
    expect(typeof result.name).toBe('string');
  });

  it('should have isAuspicious boolean', () => {
    const result = calculateTithi(100, 20);
    expect(typeof result.isAuspicious).toBe('boolean');
  });

  it('should give Purnima/Amavasya for specific configurations', () => {
    // Moon ~179° ahead of Sun (just before full moon boundary) → Purnima (tithi 15)
    const purnima = calculateTithi(179, 0);
    expect(purnima.number).toBe(15);
  });
});

describe('Nakshatra Calculation', () => {
  it('should return Ashwini for Moon at 0°', () => {
    const result = calculateNakshatra(0);
    expect(result.name).toBe('Ashwini');
    expect(result.index).toBe(0);
  });

  it('should return valid pada (1-4)', () => {
    const result = calculateNakshatra(50);
    expect(result.pada).toBeGreaterThanOrEqual(1);
    expect(result.pada).toBeLessThanOrEqual(4);
  });

  it('should return valid nakshatra index (0-26)', () => {
    const result = calculateNakshatra(200);
    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.index).toBeLessThanOrEqual(26);
  });

  it('should return correct lord for Ashwini (Ketu)', () => {
    const result = calculateNakshatra(5);
    expect(result.lord).toBe('Ketu');
  });
});

describe('Panchang Yoga Calculation', () => {
  it('should return valid yoga index (0-26)', () => {
    const result = calculatePanchangYoga(100, 200);
    expect(result.index).toBeGreaterThanOrEqual(0);
    expect(result.index).toBeLessThanOrEqual(26);
  });

  it('should return yoga name', () => {
    const result = calculatePanchangYoga(100, 200);
    expect(result.name).toBeTruthy();
  });

  it('should have isAuspicious boolean', () => {
    const result = calculatePanchangYoga(100, 200);
    expect(typeof result.isAuspicious).toBe('boolean');
  });
});

describe('Karana Calculation', () => {
  it('should return a valid karana', () => {
    const result = calculateKarana(100, 20);
    expect(result.name).toBeTruthy();
    expect(result.index).toBeGreaterThanOrEqual(0);
  });
});

describe('Rahu Kaal Calculation', () => {
  it('should return start and end times', () => {
    const result = calculateRahuKaal('06:00', '18:00', 0); // Sunday
    expect(result.start).toBeTruthy();
    expect(result.end).toBeTruthy();
  });

  it('should give different times for different days', () => {
    const sunday = calculateRahuKaal('06:00', '18:00', 0);
    const monday = calculateRahuKaal('06:00', '18:00', 1);
    expect(sunday.start).not.toBe(monday.start);
  });
});
