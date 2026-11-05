import { describe, it, expect } from 'vitest';
import { detectKaalSarpDosha } from '../src/lib/astro-engine/doshas/kaalSarp.js';
import { detectGuruChandalDosha } from '../src/lib/astro-engine/doshas/guruChandal.js';
import { detectGrahanDosha } from '../src/lib/astro-engine/doshas/grahanDosha.js';
import { detectMangalDosha } from '../src/lib/astro-engine/doshas/mangalDosha.js';
import { detectPitraDosha } from '../src/lib/astro-engine/doshas/pitraDosha.js';
import { separationDeg } from '../src/lib/astro-engine/doshas/separation.js';
import { detectAllYogas } from '../src/lib/astro-engine/yogas/index.js';
import { calculateChart } from '../src/lib/astro-engine/index.js';
import type { ChartData } from '../src/lib/shared/types/astrology.js';

const SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

/** A chart with the Lagna in Aries (whole-sign houses), planets at the given sidereal longitudes. */
function chartAt(lons: Record<string, number>): ChartData {
  const names = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  const planets = names.map((planet) => {
    const longitude =
      (((lons[planet] ?? (planet === 'Ketu' ? lons.Rahu! + 180 : 0)) % 360) + 360) % 360;
    const signIndex = Math.floor(longitude / 30);
    return {
      planet,
      longitude,
      signIndex,
      sign: SIGNS[signIndex],
      signDegree: longitude % 30,
      house: signIndex + 1,
      isRetrograde: false,
    };
  });
  return {
    planets,
    ascendant: { signIndex: 0, sign: 'Aries', longitude: 5, degree: 5 },
  } as unknown as ChartData;
}

// Rahu 100 (Cancer 10), Ketu 280 (Capricorn 10). The Rahu -> Ketu half is 100..280.
const ALL_ON_RAHU_SIDE = {
  Rahu: 100,
  Sun: 120,
  Moon: 140,
  Mars: 160,
  Mercury: 180,
  Jupiter: 200,
  Venus: 220,
  Saturn: 250,
};

/** The yoga detector reads more of the chart than the dosha detectors, so graft the fake planets onto a real chart shell. */
async function fullChartAt(lons: Record<string, number>): Promise<ChartData> {
  const real = await calculateChart(1990, 1, 1, 12, 0, 5.5, 19.076, 72.8777, 'lahiri', 'W');
  const fake = chartAt(lons);
  return {
    ...real,
    planets: fake.planets,
    ascendant: { ...real.ascendant, signIndex: 0, sign: 'Aries' },
  };
}

describe('G3: Kaal Sarp reads the longitude arc, with a direction', () => {
  it('all seven planets between Rahu and Ketu = full Kaal Sarp', () => {
    const k = detectKaalSarpDosha(chartAt(ALL_ON_RAHU_SIDE));
    expect(k.present).toBe(true);
    expect(k.isPartial).toBe(false);
    expect(k.direction).toBe('kaal_sarp');
  });
  it('all seven planets between Ketu and Rahu = full, direction Kaal Amrit', () => {
    const k = detectKaalSarpDosha(
      chartAt({
        Rahu: 100,
        Sun: 300,
        Moon: 310,
        Mars: 320,
        Mercury: 330,
        Jupiter: 340,
        Venus: 350,
        Saturn: 20,
      }),
    );
    expect(k.present).toBe(true);
    expect(k.isPartial).toBe(false);
    expect(k.direction).toBe('kaal_amrit');
  });
  it('one planet outside the arc = partial, and it is named', () => {
    const k = detectKaalSarpDosha(chartAt({ ...ALL_ON_RAHU_SIDE, Saturn: 300 }));
    expect(k.present).toBe(true);
    expect(k.isPartial).toBe(true);
    expect(k.direction).toBe('kaal_sarp');
    expect(k.outsidePlanets).toEqual(['Saturn']);
  });
  it("SB4: a planet in Rahu's own sign but 5 degrees BEFORE Rahu is outside the arc, so the chart is partial, not full", () => {
    // Sun at 95 shares Cancer (house 4) with Rahu at 100, but it has not reached Rahu yet.
    const k = detectKaalSarpDosha(chartAt({ ...ALL_ON_RAHU_SIDE, Sun: 95 }));
    expect(k.isPartial).toBe(true);
    expect(k.outsidePlanets).toEqual(['Sun']);
  });
  it("SB4: two planets outside (one in a node's sign, one elsewhere) = no Kaal Sarp at all", () => {
    const k = detectKaalSarpDosha(chartAt({ ...ALL_ON_RAHU_SIDE, Sun: 95, Saturn: 300 }));
    expect(k.present).toBe(false);
  });
  it("a planet in Ketu's sign but past Ketu is outside", () => {
    const k = detectKaalSarpDosha(chartAt({ ...ALL_ON_RAHU_SIDE, Saturn: 285 }));
    expect(k.isPartial).toBe(true);
    expect(k.outsidePlanets).toEqual(['Saturn']);
  });
  it('the mixed chart (3 on each side) is not Kaal Sarp', () => {
    const k = detectKaalSarpDosha(
      chartAt({
        Rahu: 100,
        Sun: 120,
        Moon: 140,
        Mars: 160,
        Mercury: 300,
        Jupiter: 320,
        Venus: 340,
        Saturn: 20,
      }),
    );
    expect(k.present).toBe(false);
    expect(k.direction).toBe('none');
  });
});

describe('G11: Guru Chandal is Jupiter with Rahu only', () => {
  const base = { Sun: 10, Moon: 40, Mars: 70, Mercury: 15, Venus: 200, Saturn: 330 };
  it('Jupiter with Rahu in one house is Guru Chandal', () => {
    const g = detectGuruChandalDosha(chartAt({ ...base, Rahu: 100, Jupiter: 112 }));
    expect(g.present).toBe(true);
    expect(g.severity).toBe('severe');
  });
  it('Jupiter with Ketu alone is not Guru Chandal any more', () => {
    const g = detectGuruChandalDosha(chartAt({ ...base, Rahu: 100, Jupiter: 285 }));
    expect(g.present).toBe(false);
    expect(g.house).toBe(0);
  });
  it('the Guru Chandal yoga follows the dosha: no yoga for Jupiter with Ketu', async () => {
    const yogas = detectAllYogas(await fullChartAt({ ...base, Rahu: 100, Jupiter: 285 }));
    expect(yogas.find((y) => y.name === 'Guru Chandal Yoga')?.present).toBe(false);
  });
});

describe('G2: true angular separation on every node conjunction', () => {
  it('separationDeg is the shortest arc, across the 0/360 edge and across signs', () => {
    expect(separationDeg(359, 1)).toBe(2);
    expect(separationDeg(29, 31)).toBe(2);
    expect(separationDeg(10, 190)).toBe(180);
    expect(separationDeg(100, 112.5)).toBe(12.5);
  });
  it('Guru Chandal carries Jupiter-Rahu separation', () => {
    const g = detectGuruChandalDosha(chartAt({ Rahu: 100, Jupiter: 112.5 }));
    expect(g.separationDeg).toBe(12.5);
  });
  it('Grahan carries the Sun and Moon separation from the nearer node in the same house', () => {
    const g = detectGrahanDosha(chartAt({ Rahu: 100, Sun: 104, Moon: 281 }));
    expect(g.type).toBe('both');
    expect(g.suryaSeparationDeg).toBe(4);
    expect(g.chandraSeparationDeg).toBe(1);
  });
  it('Grahan separation is null for the half that is not in force', () => {
    const g = detectGrahanDosha(chartAt({ Rahu: 100, Sun: 104, Moon: 10 }));
    expect(g.suryaSeparationDeg).toBe(4);
    expect(g.chandraSeparationDeg).toBeNull();
  });
  it('Pitra carries the Sun-Rahu separation when they share a house', () => {
    const p = detectPitraDosha(chartAt({ Rahu: 100, Sun: 107 }));
    expect(p.sunRahuSeparationDeg).toBe(7);
  });
  it('Angarak yoga carries Mars-Rahu separation', async () => {
    const a = detectAllYogas(await fullChartAt({ Rahu: 100, Mars: 103 })).find(
      (y) => y.name === 'Angarak Yoga',
    );
    expect(a?.present).toBe(true);
    expect(a?.separationDeg).toBe(3);
  });
  it('the separation is data only: a conjunction 25 degrees apart is still in the same house and still counts', () => {
    const g = detectGuruChandalDosha(chartAt({ Rahu: 91, Jupiter: 116 }));
    expect(g.present).toBe(true);
    expect(g.separationDeg).toBe(25);
  });
});

describe("G2: Mangal Dosha carries the true separation from Jupiter, Venus or the Moon in Mars's sign", () => {
  it('lists each of them with its distance, data only', () => {
    // Mars 100 and Jupiter 104 in Cancer, Moon 118 in Cancer, Venus far away.
    const m = detectMangalDosha(
      chartAt({ Rahu: 200, Mars: 100, Jupiter: 104, Moon: 118, Venus: 10 }),
    );
    expect(m.conjunctionSeparations).toEqual([
      { planet: 'Moon', deg: 18 },
      { planet: 'Jupiter', deg: 4 },
    ]);
  });
  it("is absent when none of them shares Mars's sign", () => {
    const m = detectMangalDosha(
      chartAt({ Rahu: 200, Mars: 100, Jupiter: 10, Moon: 40, Venus: 250 }),
    );
    expect(m.conjunctionSeparations).toBeUndefined();
  });
});
