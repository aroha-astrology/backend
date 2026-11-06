import { describe, it, expect } from 'vitest';
import {
  isBetweenZodiacally,
  isBetweenBySign,
  vivahaSaham,
  punyaSaham,
  vidyaSaham,
  rajyaSaham,
  arthaSaham,
  computeAllSahams,
  karyasiddhiSaham,
  pardeshSaham,
  putraSaham,
} from '../src/lib/astro-engine/varshphal/sahams.js';
import type { ChartData } from '@aroha-astrology/shared';

describe('isBetweenZodiacally', () => {
  it('is true when the test point falls on the forward arc from -> to', () => {
    expect(isBetweenZodiacally(0, 100, 50)).toBe(true);
    expect(isBetweenZodiacally(0, 100, 150)).toBe(false);
  });

  it('handles wraparound across 0/360 correctly', () => {
    // Forward arc from 350 to 10 (wrapping through 0) spans 20 degrees.
    expect(isBetweenZodiacally(350, 10, 355)).toBe(true);
    expect(isBetweenZodiacally(350, 10, 180)).toBe(false);
  });

  it('treats the endpoints as inclusive of the start', () => {
    expect(isBetweenZodiacally(0, 100, 0)).toBe(true);
    expect(isBetweenZodiacally(0, 100, 100)).toBe(true);
  });
});

// Ascendant absolute longitude = 0*30 + 10 = 10.
const FIXTURE_CHART: ChartData = {
  ascendant: { signIndex: 0, degree: 10 },
  planets: [
    { planet: 'Sun', signIndex: 3, longitude: 100, house: 1 },
    { planet: 'Moon', signIndex: 6, longitude: 200, house: 1 },
    { planet: 'Mercury', signIndex: 1, longitude: 50, house: 1 },
    { planet: 'Venus', signIndex: 5, longitude: 150, house: 1 },
    { planet: 'Mars', signIndex: 2, longitude: 70, house: 1 },
    { planet: 'Jupiter', signIndex: 10, longitude: 300, house: 1 },
    { planet: 'Saturn', signIndex: 8, longitude: 250, house: 1 },
  ],
} as unknown as ChartData;

describe('vivahaSaham', () => {
  it('computes Venus - Saturn + Asc, adding 30 only when Asc is NOT between Saturn and Venus', () => {
    // Saturn=250, Venus=150, Asc=10. Forward arc Saturn->Venus = 260, Asc at
    // forward-distance 120 from Saturn -> IS between -> no +30 applied.
    // Raw: 150 - 250 + 10 = -90 -> normalized 270.
    const result = vivahaSaham(FIXTURE_CHART);
    expect(result.longitude).toBe(270);
    expect(result.signIndex).toBe(9); // Capricorn
  });

  it('adds 30 degrees when Ascendant does NOT fall between Saturn and Venus', () => {
    const chart: ChartData = {
      ...FIXTURE_CHART,
      ascendant: { signIndex: 8, degree: 5 }, // Asc = 245, outside the Saturn(250)->Venus(150) forward arc
    } as unknown as ChartData;
    const withoutRule = (((150 - 250 + 245) % 360) + 360) % 360; // 145
    const result = vivahaSaham(chart);
    expect(result.longitude).toBe((withoutRule + 30) % 360);
  });
});

describe('punyaSaham', () => {
  it('day return: Moon - Sun + Asc, +30 because Asc (10) is not between Sun (100) and Moon (200)', () => {
    // 200 - 100 + 10 = 110, +30 = 140 (the +30 rule now applies to every Saham)
    const result = punyaSaham(FIXTURE_CHART, true);
    expect(result.longitude).toBe(140);
    expect(result.signIndex).toBe(4); // Leo
  });

  it('night return: Sun - Moon + Asc', () => {
    // 100 - 200 + 10 = -90 -> 270
    const result = punyaSaham(FIXTURE_CHART, false);
    expect(result.longitude).toBe(270);
    expect(result.signIndex).toBe(9);
  });
});

describe('vidyaSaham', () => {
  it('Sun - Moon + Asc by day, swapped at night; the +30 test is by sign', () => {
    // Day: 100 - 200 + 10 = -90 -> 270. Going forward by sign from Moon's (Libra) the Asc's sign
    // (Aries) is reached before the Sun's (Cancer), so no +30.
    expect(vidyaSaham(FIXTURE_CHART).longitude).toBe(270);
    // Night: 200 - 100 + 10 = 110. From the Sun's sign (Cancer) the Moon's (Libra) comes before
    // the Asc's (Aries) -> +30 = 140.
    expect(vidyaSaham(FIXTURE_CHART, false).longitude).toBe(140);
  });
});

describe('rajyaSaham', () => {
  it('Saturn - Sun + Asc by day, swapped at night', () => {
    // Day: 250 - 100 + 10 = 160; from the Sun's sign Saturn's is reached before Aries -> +30 = 190.
    expect(rajyaSaham(FIXTURE_CHART).longitude).toBe(190);
    expect(rajyaSaham(FIXTURE_CHART).signIndex).toBe(6);
    // Night: 100 - 250 + 10 = -140 -> 220; from Saturn's sign Aries comes first -> no +30.
    expect(rajyaSaham(FIXTURE_CHART, false).longitude).toBe(220);
  });
});

describe('arthaSaham', () => {
  it('2nd house point - 2nd lord + Asc, the same by day and night', () => {
    // 2nd house point = 10 + 30 = 40 (Taurus, lord Venus at 150). 40 - 150 + 10 = -100 -> 260;
    // from Venus' sign (Virgo) Aries comes before Taurus -> no +30.
    expect(arthaSaham(FIXTURE_CHART, true).longitude).toBe(260);
    expect(arthaSaham(FIXTURE_CHART, false).longitude).toBe(260);
  });
});

describe('computeAllSahams', () => {
  it('returns all 8 Sahams with valid house-from-Varsha-Asc (1-12) and a boolean benefic verdict', () => {
    const results = computeAllSahams(FIXTURE_CHART, true);
    expect(results).toHaveLength(8);
    for (const r of results) {
      expect(r.houseFromVarshaAsc).toBeGreaterThanOrEqual(1);
      expect(r.houseFromVarshaAsc).toBeLessThanOrEqual(12);
      expect(typeof r.beneficSupported).toBe('boolean');
      expect(r.sign.length).toBeGreaterThan(0);
    }
  });

  it('punyaSaham differs between day and night computeAllSahams calls', () => {
    const day = computeAllSahams(FIXTURE_CHART, true);
    const night = computeAllSahams(FIXTURE_CHART, false);
    const dayPunya = day.find((r) => r.name.startsWith('Punya'))!;
    const nightPunya = night.find((r) => r.name.startsWith('Punya'))!;
    expect(dayPunya.longitude).not.toBe(nightPunya.longitude);
  });
});

describe('rules shared by every Saham (changed in the Varshik 2027 work)', () => {
  it('the +30 test goes by sign, so the same sign as the subtracted point counts as not between', () => {
    expect(isBetweenBySign(150, 250, 10)).toBe(true); // Virgo, Sagittarius, Aries: Aries comes first
    expect(isBetweenBySign(150, 250, 245)).toBe(false); // Asc in the same sign as the subtracted point
    expect(isBetweenBySign(100, 200, 100)).toBe(true); // Asc in the sign of the added point counts
    expect(isBetweenBySign(100, 200, 130)).toBe(false); // wrong side: Leo is not between Libra and Cancer
  });

  it('Putra is Jupiter - Moon + Asc by day and swaps at night', () => {
    // Day: 300 - 200 + 10 = 110; Asc (10) is not between Moon (200) and Jupiter (300) -> 140.
    expect(putraSaham(FIXTURE_CHART, true).longitude).toBe(140);
    // Night: 200 - 300 + 10 = -90 -> 270; Asc is between Jupiter (300) and Moon (200) -> no +30.
    expect(putraSaham(FIXTURE_CHART, false).longitude).toBe(270);
  });

  it('Karyasiddhi uses the Sun by day and the Moon by night, and the lord of that sign', () => {
    // Day: Sun at 100 is Cancer, ruled by the Moon (200). Saturn 250 - Sun 100 + 200 = 350;
    // 200 is between Sun (100) and Saturn (250) -> no +30.
    expect(karyasiddhiSaham(FIXTURE_CHART, true).longitude).toBe(350);
    // Night: Moon at 200 is Libra, ruled by Venus (150). 250 - 200 + 150 = 200; 150 is not
    // between Moon (200) and Saturn (250) -> +30 = 230.
    expect(karyasiddhiSaham(FIXTURE_CHART, false).longitude).toBe(230);
  });

  it('Pardesh is the 9th house point (Lagna + 240) - the 9th lord + Asc', () => {
    // The 9th house point is the Lagna + 240 = 250 (Sagittarius, ruled by Jupiter at 300).
    // 250 - 300 + 10 = -40 -> 320; from Jupiter's sign (Aquarius) Aries comes before Sagittarius -> no +30.
    expect(pardeshSaham(FIXTURE_CHART, true).longitude).toBe(320);
    expect(pardeshSaham(FIXTURE_CHART, false).longitude).toBe(320);
  });

  it('every Saham carries the lord of its own sign', () => {
    for (const r of computeAllSahams(FIXTURE_CHART, true)) expect(r.lord.length).toBeGreaterThan(0);
  });
});
