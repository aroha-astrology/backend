import { describe, it, expect } from 'vitest';
import { calculateD30 } from '../../src/lib/astro-engine/charts/divisionalCharts.js';
import { calculateChart } from '../../src/lib/astro-engine/calculations/planetPositions.js';
import { calculateVimsopakaBala } from '../../src/lib/astro-engine/calculations/avastha.js';

// =============================================================================
// Audit items V1 (D30 sign) and ST1 (Vimsopaka), register BPHS-6.27-28 and BPHS-16.17-27
// =============================================================================
// BPHS 6.27-28: "The Trimsamsa lords for an odd sign are Mars, Saturn, Jupiter,
// Mercury and Venus. Each of them in order rules 5, 5, 8, 7 and 5 degrees ... In the
// case of an even sign, the quantum of Trimsamsa, planetary lordship and deities
// get reversed." The book's speculum gives the signs: odd signs Aries, Aquarius,
// Sagittarius, Gemini, Libra; even signs Taurus, Virgo, Pisces, Capricorn, Scorpio.
//
// BPHS 16.17-27 (ch. 7 of the translation's own numbering of notes): the Shadvarga
// weights Rasi 6, Hora 2, Drekkana 4, Navamsa 5, Dvadasamsa 2, Trimsamsa 1 (the
// "Swaviswa"); the Varga Viswa of a planet in a division is 20 in its own sign,
// 18 with a great friend (adhimitra), 15 a friend, 10 equal, 7 an enemy, 5 a great
// enemy (adhishatru) as lord of the division; the strength is Swaviswa x Varga
// Viswa / 20, summed.
// The worked example: Venus, longitude 9s 4 deg 32' 30" (Capricorn), in the chart
// of 17 Feb 1984, 22:35 IST, New Delhi:
//   Rasi Capricorn, Saturn, adhimitra: 6 x 18 / 20 = 5.4
//   Hora Cancer, Moon, adhishatru:     2 x  5 / 20 = 0.5
//   Drekkana Capricorn, Saturn:        4 x 18 / 20 = 3.6
//   Navamsa Aquarius, Saturn:          5 x 18 / 20 = 4.5
//   Dvadasamsa Aquarius, Saturn:       2 x 18 / 20 = 1.8
//   Trimsamsa Taurus, Venus, own:      1 x 20 / 20 = 1.0      total 16.8
// =============================================================================

const at = (sign: number, deg: number) => sign * 30 + deg;
const ARIES = 0;
const TAURUS = 1;

describe('[V1] the Trimsamsa sign (BPHS 6.27-28)', () => {
  it('odd signs: Mars 0-5 Aries, Saturn 5-10 Aquarius, Jupiter 10-18 Sagittarius, Mercury 18-25 Gemini, Venus 25-30 Libra', () => {
    expect(calculateD30(at(ARIES, 2))).toBe(0);
    expect(calculateD30(at(ARIES, 7))).toBe(10);
    expect(calculateD30(at(ARIES, 14))).toBe(8);
    expect(calculateD30(at(ARIES, 20))).toBe(2);
    expect(calculateD30(at(ARIES, 27))).toBe(6);
  });

  it('even signs reversed: Venus 0-5 Taurus, Mercury 5-12 Virgo, Jupiter 12-20 Pisces, Saturn 20-25 Capricorn, Mars 25-30 Scorpio', () => {
    expect(calculateD30(at(TAURUS, 2))).toBe(1);
    expect(calculateD30(at(TAURUS, 8))).toBe(5);
    expect(calculateD30(at(TAURUS, 15))).toBe(11);
    expect(calculateD30(at(TAURUS, 22))).toBe(9);
    expect(calculateD30(at(TAURUS, 27))).toBe(7);
  });

  it('the book example: Venus at Capricorn 4 deg 32 min is in Taurus', () => {
    expect(calculateD30(at(9, 4 + 32 / 60))).toBe(1);
  });
});

describe('[ST1] Vimsopaka Bala follows BPHS: Swaviswa x Varga Viswa / 20', () => {
  it("the book's example: Venus scores 16.8 in the six divisions", async () => {
    const chart = await calculateChart(1984, 2, 17, 22, 35, 5.5, 28.6139, 77.209, 'lahiri', 'W');
    const venus = calculateVimsopakaBala(chart).find((r) => r.planet === 'Venus')!;
    expect(venus.score).toBeCloseTo(16.8, 1);
    const parts = Object.fromEntries(venus.parts!.map((p) => [p.varga, p]));
    expect(parts.Rasi!.points).toBeCloseTo(5.4, 6);
    expect(parts.Hora!.points).toBeCloseTo(0.5, 6);
    expect(parts.Drekkana!.points).toBeCloseTo(3.6, 6);
    expect(parts.Navamsa!.points).toBeCloseTo(4.5, 6);
    expect(parts.Dvadasamsa!.points).toBeCloseTo(1.8, 6);
    expect(parts.Trimsamsa!.points).toBeCloseTo(1.0, 6);
    expect(parts.Rasi!.relation).toBe('adhimitra');
    expect(parts.Hora!.relation).toBe('adhishatru');
    expect(parts.Trimsamsa!.relation).toBe('own');
  });

  it('only the seven planets are scored (the text names no node dignities)', async () => {
    const chart = await calculateChart(1984, 2, 17, 22, 35, 5.5, 28.6139, 77.209, 'lahiri', 'W');
    const names = calculateVimsopakaBala(chart)
      .map((r) => r.planet)
      .sort();
    expect(names).toEqual(['Jupiter', 'Mars', 'Mercury', 'Moon', 'Saturn', 'Sun', 'Venus']);
  });

  it('is on a scale of 20 and never above it', async () => {
    const chart = await calculateChart(1984, 2, 17, 22, 35, 5.5, 28.6139, 77.209, 'lahiri', 'W');
    for (const r of calculateVimsopakaBala(chart)) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(20);
    }
  });
});
