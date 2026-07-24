import { describe, expect, it } from 'vitest';
import { computeAvkahadaChakra } from '../src/lib/astro-engine/avkahadaChakra.js';

function chartWithMoon(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    planets: [
      {
        planet: 'Moon',
        longitude: 5, // within Ashwini (0°-13°20')
        sign: 'Aries',
        house: 1,
        nakshatra: 'Ashwini',
        nakshatraIndex: 0,
        nakshatraPada: 2,
        ...overrides,
      },
    ],
  };
}

describe('computeAvkahadaChakra', () => {
  it('produces a fully-populated AvkahadaChakra with no empty-string fields for a complete fixture chart', () => {
    const result = computeAvkahadaChakra(chartWithMoon());
    expect(result).not.toBeNull();
    const r = result!;

    expect(r.varna).toBe('Kshatriya'); // Aries = Fire element = rank 2 = Kshatriya
    expect(r.vashya).toBe('Chatushpada'); // Aries's Vashya group
    expect(r.yoni).toBe('Horse'); // Ashwini's Yoni animal
    expect(r.gana).toBe('Deva'); // Ashwini's Gana
    expect(r.nadi).toBe('Aadi'); // Ashwini's Nadi
    expect(r.paya).toBe('Gold'); // house 1
    expect(r.namingSyllable).toBe('Che'); // Ashwini pada 2
    expect(r.moonSign).toBe('Aries');
    expect(r.moonNakshatra).toBe('Ashwini');

    for (const [key, value] of Object.entries(r)) {
      expect(value, `${key} should not be an empty string`).not.toBe('');
    }
  });

  it("uses the Moon's real nakshatraPada rather than hardcoding pada 1", () => {
    const result = computeAvkahadaChakra(chartWithMoon({ nakshatraPada: 4 }));
    expect(result!.namingSyllable).toBe('Laa'); // Ashwini pada 4
  });

  it('falls back to pada 1 when nakshatraPada is missing or out of range', () => {
    const missing = computeAvkahadaChakra(chartWithMoon({ nakshatraPada: undefined }));
    expect(missing!.namingSyllable).toBe('Chu'); // Ashwini pada 1

    const outOfRange = computeAvkahadaChakra(chartWithMoon({ nakshatraPada: 0 }));
    expect(outOfRange!.namingSyllable).toBe('Chu');
  });

  it('derives nakshatraIndex from longitude when nakshatraIndex is genuinely absent', () => {
    // longitude 15 falls within Bharani (13.333...-26.666...), index 1.
    const result = computeAvkahadaChakra(
      chartWithMoon({ nakshatraIndex: undefined, longitude: 15, nakshatra: 'Bharani' }),
    );
    expect(result!.yoni).toBe('Elephant'); // Bharani's Yoni animal
    expect(result!.gana).toBe('Manushya'); // Bharani's Gana
    expect(result!.nadi).toBe('Madhya'); // Bharani's Nadi
  });

  describe('getPaya house-group mapping (one representative house per group)', () => {
    it('house 1 (Gold group) -> Gold', () => {
      expect(computeAvkahadaChakra(chartWithMoon({ house: 1 }))!.paya).toBe('Gold');
    });
    it('house 9 (Silver group) -> Silver', () => {
      expect(computeAvkahadaChakra(chartWithMoon({ house: 9 }))!.paya).toBe('Silver');
    });
    it('house 7 (Copper group) -> Copper', () => {
      expect(computeAvkahadaChakra(chartWithMoon({ house: 7 }))!.paya).toBe('Copper');
    });
    it('house 4 (Iron group) -> Iron', () => {
      expect(computeAvkahadaChakra(chartWithMoon({ house: 4 }))!.paya).toBe('Iron');
    });
  });

  it('returns null for a null chart', () => {
    expect(computeAvkahadaChakra(null)).toBeNull();
  });

  it('returns null when there is no Moon in the planets list', () => {
    const chart = { planets: [{ planet: 'Sun', sign: 'Aries', house: 1, longitude: 10 }] };
    expect(computeAvkahadaChakra(chart)).toBeNull();
  });

  it('returns null when the Moon is missing essential fields (sign)', () => {
    const chart = { planets: [{ planet: 'Moon', longitude: 5, house: 1 }] };
    expect(computeAvkahadaChakra(chart)).toBeNull();
  });

  it('returns null when the Moon is missing essential fields (house)', () => {
    const chart = { planets: [{ planet: 'Moon', longitude: 5, sign: 'Aries' }] };
    expect(computeAvkahadaChakra(chart)).toBeNull();
  });
});
