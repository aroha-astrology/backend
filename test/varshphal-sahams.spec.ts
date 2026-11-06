import { describe, it, expect } from 'vitest';
import {
  isBetweenZodiacally,
  vivahaSaham,
  punyaSaham,
  vidyaSaham,
  rajyaSaham,
  vittaSaham,
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
  it('Asc + Mercury - Moon', () => {
    // 10 + 50 - 200 = -140 -> 220
    const result = vidyaSaham(FIXTURE_CHART);
    expect(result.longitude).toBe(220);
    expect(result.signIndex).toBe(7); // Scorpio
  });
});

describe('rajyaSaham', () => {
  it('Asc + Sun - Moon', () => {
    // 10 + 100 - 200 = -90 -> 270
    const result = rajyaSaham(FIXTURE_CHART);
    expect(result.longitude).toBe(270);
    expect(result.signIndex).toBe(9);
  });
});

describe('vittaSaham', () => {
  it('Asc + Jupiter - Sun', () => {
    // 10 + 300 - 100 = 210, +30 because Asc (10) is not between Sun (100) and Jupiter (300) = 240
    const result = vittaSaham(FIXTURE_CHART);
    expect(result.longitude).toBe(240);
    expect(result.signIndex).toBe(8); // Sagittarius
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
  it('a night return swaps the two points of the Sahams that swap', () => {
    // Vitta at night: Sun - Jupiter + Asc = 100 - 300 + 10 = -190 -> 170. Asc (10) is between
    // Jupiter (300) and Sun (100) going forward (arc 160, Asc at 70), so no +30.
    expect(vittaSaham(FIXTURE_CHART, false).longitude).toBe(170);
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

  it('Pardesh is the 9th cusp - the 9th lord + Asc, falling back to whole signs without a house list', () => {
    // Asc sign 0 -> 9th sign is Sagittarius (240), ruled by Jupiter (300).
    // 240 - 300 + 10 = -50 -> 310; Asc (10) IS between the 9th lord (300) and the cusp (240) going forward -> no +30.
    expect(pardeshSaham(FIXTURE_CHART, true).longitude).toBe(310);
    expect(pardeshSaham(FIXTURE_CHART, false).longitude).toBe(310);
  });

  it('every Saham carries the lord of its own sign', () => {
    for (const r of computeAllSahams(FIXTURE_CHART, true)) expect(r.lord.length).toBeGreaterThan(0);
  });
});
