// Audit Sprint 11 (spec review G1): Sripati Bhava Chalit.
//
// swisseph system 'S' returns the START of each bhava (the midpoints between the
// Porphyry cusps, which are the bhava madhya). Reference values below were read
// from the real ephemeris for 1990-05-15 04:30 UT, Lahiri, Delhi (28.6N 77.2E):
//   S: 77.07 107.07 134.27 161.48 191.48 224.27 257.07 287.07 314.27 341.48 11.48 44.27
//   Ascendant 93.47 (so the Lagna sits inside bhava 1, 77.07 - 107.07).
import { describe, it, expect } from 'vitest';
import {
  sripatiHouseFor,
  sripatiCuspsUsable,
} from '../../src/lib/astro-engine/charts/sripatiBhava.js';
import {
  computeBhavaChalit,
  mangalChalitShift,
} from '../../src/lib/astro-engine/charts/bhavaChalit.js';
import { bhavaChalitFacts } from '../../src/lib/chat-grounding.js';
import type { PlanetFact } from '../../src/lib/chat-grounding.js';
import { calculateSripatiCusps } from '../../src/lib/astro-engine/calculations/planetPositions.core.js';
import { calculateChart } from '../../src/lib/astro-engine/calculations/planetPositions.js';

const DELHI = [
  77.07, 107.07, 134.27, 161.48, 191.48, 224.27, 257.07, 287.07, 314.27, 341.48, 11.48, 44.27,
];

describe('sripatiHouseFor', () => {
  it('finds the bhava a longitude falls in, between two cusp starts', () => {
    expect(sripatiHouseFor(80, DELHI)).toBe(1);
    expect(sripatiHouseFor(107.0, DELHI)).toBe(1);
    expect(sripatiHouseFor(108, DELHI)).toBe(2);
    expect(sripatiHouseFor(76, DELHI)).toBe(12);
  });

  it('handles the 0/360 wrap', () => {
    expect(sripatiHouseFor(5, DELHI)).toBe(10); // 341.48 -> 11.48
    expect(sripatiHouseFor(355, DELHI)).toBe(10);
    expect(sripatiHouseFor(20, DELHI)).toBe(11);
  });

  it('is exact on a cusp: the cusp belongs to the house it starts', () => {
    expect(sripatiHouseFor(107.07, DELHI)).toBe(2);
    expect(sripatiHouseFor(11.48, DELHI)).toBe(11);
  });
});

describe('sripatiCuspsUsable', () => {
  it('accepts a normal mid-latitude set', () => {
    expect(sripatiCuspsUsable(DELHI)).toBe(true);
  });

  it('rejects wrong length, NaN, and missing', () => {
    expect(sripatiCuspsUsable(DELHI.slice(0, 11))).toBe(false);
    expect(sripatiCuspsUsable([...DELHI.slice(0, 11), NaN])).toBe(false);
    expect(sripatiCuspsUsable(undefined)).toBe(false);
  });

  it('rejects a squashed set (Tromso 69.6N: bhavas of 5 and 55 degrees)', () => {
    const tromso = [
      70.54, 100.54, 105.47, 110.4, 140.4, 195.47, 250.54, 280.54, 285.47, 290.4, 320.4, 15.47,
    ];
    expect(sripatiCuspsUsable(tromso)).toBe(false);
  });
});

describe('computeBhavaChalit with Sripati cusps', () => {
  it('uses the Sripati bhava where it differs from the equal bhava', () => {
    // Lagna 93.47. Equal bhava 1 = 78.47 - 108.47, Sripati bhava 1 = 77.07 - 107.07.
    // A planet at 108 is house 1 by equal bhava but house 2 by Sripati.
    const planet = { planet: 'Mars', longitude: 108, signIndex: 3, house: 1 };
    const equal = computeBhavaChalit([planet], 93.47, 3);
    expect(equal[0]!.chalitHouse).toBe(1);
    const sripati = computeBhavaChalit([planet], 93.47, 3, DELHI);
    expect(sripati[0]!.chalitHouse).toBe(2);
    expect(sripati[0]!.moved).toBe(true);
  });

  it('ignores unusable cusps and falls back to the equal bhava', () => {
    const planet = { planet: 'Mars', longitude: 108, signIndex: 3, house: 1 };
    const out = computeBhavaChalit([planet], 93.47, 3, DELHI.slice(0, 5));
    expect(out[0]!.chalitHouse).toBe(1);
  });
});

describe('bhavaChalitFacts names the system used', () => {
  const planets: PlanetFact[] = [
    {
      planet: 'Mars',
      sign: 'Cancer',
      signIndex: 3,
      house: 1,
      longitude: 108,
    } as unknown as PlanetFact,
  ];

  it('says Sripati when the chart carries the cusps', () => {
    const chart = { ascendant: { signIndex: 3, degree: 3.47 }, sripatiCusps: DELHI };
    const facts = bhavaChalitFacts(chart, planets);
    expect(facts[0]).toContain('Mars sits in house 1 by sign but house 2 by bhava');
    expect(facts[0]).toContain('Sripati');
  });

  it('keeps the equal-bhava wording on charts without cusps (older charts)', () => {
    const chart = { ascendant: { signIndex: 3, degree: 20 } };
    const facts = bhavaChalitFacts(chart, [{ ...planets[0]!, longitude: 130 }]);
    expect(facts.join(' ')).not.toContain('Sripati');
  });
});

describe('mangalChalitShift (note only, never changes the Mangal status)', () => {
  const mars = (rasi: number, chalit: number) => ({
    planet: 'Mars',
    rasiHouse: rasi,
    chalitHouse: chalit,
    moved: rasi !== chalit,
  });

  it('flags Mars leaving a Mangal house by bhava', () => {
    expect(mangalChalitShift([mars(7, 6)])).toEqual({
      rasiHouse: 7,
      chalitHouse: 6,
      effect: 'leaves',
    });
  });

  it('flags Mars entering a Mangal house by bhava', () => {
    expect(mangalChalitShift([mars(3, 4)])).toEqual({
      rasiHouse: 3,
      chalitHouse: 4,
      effect: 'enters',
    });
  });

  it('is silent when the Mangal-house status is the same either way', () => {
    expect(mangalChalitShift([mars(7, 8)])).toBeNull(); // both Mangal houses
    expect(mangalChalitShift([mars(5, 6)])).toBeNull(); // neither
    expect(mangalChalitShift([])).toBeNull();
  });
});

describe('real ephemeris', () => {
  const jd = 2448026.6875; // 1990-05-15 04:30 UT

  it('returns 12 Sripati bhava starts for Delhi that match the reference', async () => {
    const cusps = await calculateSripatiCusps(jd, 28.6, 77.2, 'lahiri');
    expect(cusps).not.toBeNull();
    expect(cusps).toHaveLength(12);
    cusps!.forEach((c, i) => expect(Math.abs(c - DELHI[i]!)).toBeLessThan(0.1));
  });

  it('returns null above the polar fallback latitude', async () => {
    expect(await calculateSripatiCusps(jd, 69.6, 18.9, 'lahiri')).toBeNull();
  });

  it('puts the cusps on the chart so the engine output carries them', async () => {
    const chart = await calculateChart(1990, 5, 15, 10, 0, 5.5, 28.6, 77.2);
    expect(chart.sripatiCusps).toHaveLength(12);
    const polar = await calculateChart(1990, 5, 15, 10, 0, 1, 69.6, 18.9);
    expect(polar.sripatiCusps).toBeUndefined();
  });
});
