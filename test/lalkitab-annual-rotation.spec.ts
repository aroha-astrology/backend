import { describe, it, expect } from 'vitest';
import {
  rotateHouse,
  computeLalKitabMuntha,
  completedYearsOfAge,
  computeAnnualRotation,
} from '../src/lib/astro-engine/lalkitab/annualRotation.js';
import { getLalKitabRemedies } from '../src/lib/astro-engine/index.js';
import type { Planet } from '@aroha-astrology/shared';

const NINE: Planet[] = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
];

describe('rotateHouse', () => {
  it('is the identity at every multiple of 12 — the cycle the year chart is built on', () => {
    for (let house = 1; house <= 12; house++) {
      for (const age of [0, 12, 24, 36, 48, 120]) {
        expect(rotateHouse(house, age)).toBe(house);
      }
    }
  });

  it('advances exactly one house per year and wraps 12 -> 1', () => {
    expect(rotateHouse(1, 1)).toBe(2);
    expect(rotateHouse(11, 1)).toBe(12);
    expect(rotateHouse(12, 1)).toBe(1);
    expect(rotateHouse(9, 4)).toBe(1);
  });

  it('never leaves 1-12 for any house/age combination', () => {
    for (let house = 1; house <= 12; house++) {
      for (let age = 0; age <= 110; age++) {
        const h = rotateHouse(house, age);
        expect(h).toBeGreaterThanOrEqual(1);
        expect(h).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe('computeLalKitabMuntha', () => {
  it('starts at the Ascendant and returns to it after a full 12-year cycle', () => {
    expect(computeLalKitabMuntha(0)).toBe(1);
    expect(computeLalKitabMuntha(12)).toBe(1);
    expect(computeLalKitabMuntha(24)).toBe(1);
  });

  it('advances one house per year of age', () => {
    expect(computeLalKitabMuntha(1)).toBe(2);
    expect(computeLalKitabMuntha(11)).toBe(12);
  });
});

describe('completedYearsOfAge', () => {
  it('does not count a birthday that has not happened yet this year', () => {
    expect(completedYearsOfAge('1990-08-20', new Date('2026-08-12T00:00:00Z'))).toBe(35);
    expect(completedYearsOfAge('1990-08-12', new Date('2026-08-12T00:00:00Z'))).toBe(36);
    expect(completedYearsOfAge('1990-01-01', new Date('2026-08-12T00:00:00Z'))).toBe(36);
  });

  it('never returns a negative age for a future date of birth', () => {
    expect(completedYearsOfAge('2030-01-01', new Date('2026-08-12T00:00:00Z'))).toBe(0);
  });
});

describe('computeAnnualRotation', () => {
  const natal = new Map<Planet, number>(NINE.map((p, i) => [p, (i % 12) + 1]));

  it("reads this year's remedies at the ROTATED house, not the natal one", () => {
    const result = computeAnnualRotation(natal, 5);
    for (const p of result.planets) {
      expect(p.annualHouse).toBe(rotateHouse(p.natalHouse, 5));
      expect(p.remedies).toEqual(getLalKitabRemedies(p.planet, p.annualHouse).remedies);
      expect(p.remedies.length).toBeGreaterThan(0);
    }
  });

  it('reproduces the natal chart exactly at a 12-year boundary', () => {
    const result = computeAnnualRotation(natal, 24);
    for (const p of result.planets) {
      expect(p.annualHouse).toBe(p.natalHouse);
      expect(p.dignityDelta).toBe(0);
    }
    // Nothing gains or loses dignity when nothing moves.
    expect(result.kismatKaGrah).toBeNull();
    expect(result.dhokheKaGrah).toBeNull();
  });

  it('names the biggest dignity gain as Kismat and the biggest loss as Dhokhe', () => {
    const result = computeAnnualRotation(natal, 7);
    const deltas = new Map(result.planets.map((p) => [p.planet, p.dignityDelta]));

    if (result.kismatKaGrah) {
      const best = Math.max(...deltas.values());
      expect(deltas.get(result.kismatKaGrah)).toBe(best);
      expect(best).toBeGreaterThan(0);
    }
    if (result.dhokheKaGrah) {
      const worst = Math.min(...deltas.values());
      expect(deltas.get(result.dhokheKaGrah)).toBe(worst);
      expect(worst).toBeLessThan(0);
    }
  });

  it('skips out-of-range natal houses instead of emitting a bad rotation', () => {
    const broken = new Map<Planet, number>([
      ['Sun', 0],
      ['Moon', 13],
      ['Mars', 4],
    ]);
    const result = computeAnnualRotation(broken, 3);
    expect(result.planets.map((p) => p.planet)).toEqual(['Mars']);
  });
});
