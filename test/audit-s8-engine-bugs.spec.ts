import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { tzOffsetHours } from '../src/modules/kundli/kundli.service.js';
import { avoidFlags } from '../src/lib/astro-tools/decision-engine.js';
import type { DaySky } from '../src/lib/astro-tools/decision-engine.js';
import { isCombust } from '../src/lib/astro-engine/calculations/planet-state.js';
import { DEFAULT_PROFILE } from '../src/lib/astro-engine/rules/profile.js';
import { getHouseGroups } from '../src/lib/astro-engine/calculations/vakri.js';

describe('SB5: the birth zone is read at the real moment, not at wall time read as UTC', () => {
  it('New York 2024-03-10 03:30 local is already summer time (-4), not winter time (-5)', () => {
    // 03:30 local that day is 07:30 UTC, after the 02:00 jump. Read as UTC it is 03:30Z = 22:30 the day before, still winter time.
    expect(tzOffsetHours('America/New_York', new Date(Date.UTC(2024, 2, 10, 3, 30)))).toBe(-4);
  });
  it('New York 2024-03-10 01:30 local is still winter time (-5)', () => {
    expect(tzOffsetHours('America/New_York', new Date(Date.UTC(2024, 2, 10, 1, 30)))).toBe(-5);
  });
  it('India in the 1942 war-time summer was +6:30 (the old read gave +5:30 near the edge)', () => {
    expect(tzOffsetHours('Asia/Kolkata', new Date(Date.UTC(1943, 5, 15, 12, 0)))).toBe(6.5);
  });
  it('autumn overlap: London 2024-10-27 00:30 local is still summer time (+1)', () => {
    expect(tzOffsetHours('Europe/London', new Date(Date.UTC(2024, 9, 27, 0, 30)))).toBe(1);
  });
  it('a zone name that does not exist is an error, never a silent +5:30', () => {
    expect(() => tzOffsetHours('Mars/Olympus_Mons', new Date(Date.UTC(2000, 0, 1, 12)))).toThrow();
  });
  it('numeric and signed offsets still work', () => {
    expect(tzOffsetHours('5.5', new Date())).toBe(5.5);
    expect(tzOffsetHours('-05:00', new Date())).toBe(-5);
    expect(tzOffsetHours('+0530', new Date())).toBe(5.5);
  });
});

describe('SB6: no profile field that nothing reads', () => {
  it('the profile has no dashaYearDays field (the dasha year is 365.25 days everywhere)', () => {
    expect('dashaYearDays' in DEFAULT_PROFILE).toBe(false);
  });
});

describe('SB7: house 7 is both a kendra and a maraka', () => {
  it('lists every group a house belongs to', () => {
    expect(getHouseGroups(7)).toEqual(expect.arrayContaining(['kendra', 'maraka']));
    expect(getHouseGroups(2)).toContain('maraka');
    expect(getHouseGroups(10)).toEqual(expect.arrayContaining(['kendra', 'upachaya']));
    expect(getHouseGroups(6)).toEqual(expect.arrayContaining(['dusthana', 'upachaya']));
    expect(getHouseGroups(9)).toEqual(['trikona']);
  });
});

describe('SB8: Decisions and the chart on combustion (muhurat Asta follows drikpanchang since 2026-11-09)', () => {
  const day = (venusLon: number, venusRetro: boolean): DaySky =>
    ({
      date: '2026-11-10',
      weekday: 1,
      tithi: 5,
      nakshatraIndex: 3,
      moonSignIndex: 2,
      eclipse: null,
      planets: [
        { planet: 'Sun', longitude: 200, signIndex: 6, sign: 'Libra', isRetrograde: false },
        {
          planet: 'Venus',
          longitude: venusLon,
          signIndex: 6,
          sign: 'Libra',
          isRetrograde: venusRetro,
        },
      ],
    }) as unknown as DaySky;
  const spec = { avoid: ['combust'] } as never;

  // Superseded for muhurat by the owner's decision of 2026-11-09: wedding Asta follows drikpanchang's published
  // dates (config/asta-dates.ts), and a year the table does not cover uses a fallback orb that CONTAINS
  // drikpanchang's windows. Drikpanchang's retrograde Venus Asta (Oct 2026) starts 17.6 deg from the Sun, so the
  // fallback treats retrograde Venus within 20 deg as Asta. The chart's own combustion (planet-state) is unchanged.
  it('the chart: retrograde Venus 9 degrees from the Sun is NOT combust (orb 8, planet-state)', () => {
    expect(isCombust('Venus', 209, 200, true)).toBe(false);
  });
  it('Decide, uncovered year: retrograde Venus 9 degrees from the Sun IS Asta for a wedding (fallback contains drik)', () => {
    expect(avoidFlags(day(209, true), spec)).toContain('combust');
  });
  it('direct Venus 9 degrees from the Sun is combust (orb 10)', () => {
    expect(avoidFlags(day(209, false), spec)).toContain('combust');
  });
  it('retrograde Venus 7 degrees from the Sun is combust', () => {
    expect(avoidFlags(day(207, true), spec)).toContain('combust');
  });
});

describe('SB11: the shadbala header does not say Yuddha Bala is missing', () => {
  it('no "NOT implemented ... Yuddha" line', () => {
    const src = readFileSync(
      new URL('../src/lib/astro-engine/calculations/shadbala.ts', import.meta.url),
      'utf8',
    );
    expect(src).not.toMatch(/NOT implemented[^]{0,80}Yuddha/);
  });
});

// ---- SB9 + SB3 (Grahan): rules the owner approved on 2026-11-05 ----
import { detectPitraDosha } from '../src/lib/astro-engine/doshas/pitraDosha.js';
import { detectGrahanDosha } from '../src/lib/astro-engine/doshas/grahanDosha.js';
import { detectAllYogas } from '../src/lib/astro-engine/index.js';
import { withLiveSaturnTransits } from '../src/modules/kundli/kundli.service.js';
import { ZODIAC_SIGNS } from '@aroha-astrology/shared';
import type { ChartData, Planet, PlanetPosition, ZodiacSign } from '@aroha-astrology/shared';

function pl(p: Planet, signIndex: number, house: number): PlanetPosition {
  return {
    planet: p,
    longitude: signIndex * 30 + 15,
    latitude: 0,
    speed: 1,
    sign: ZODIAC_SIGNS[signIndex] as ZodiacSign,
    signIndex,
    signDegree: 15,
    nakshatra: 'Ashwini',
    nakshatraIndex: 0,
    nakshatraPada: 1,
    nakshatraLord: 'Ketu',
    isRetrograde: false,
    house,
  };
}
function ch(planets: PlanetPosition[]): ChartData {
  return {
    planets,
    houses: [],
    ascendant: { sign: 'Aries', signIndex: 0, degree: 0, nakshatra: 'Ashwini', nakshatraPada: 1 },
    ayanamsa: 'lahiri',
    ayanamsaValue: 24,
    julianDay: 2448000,
  } as unknown as ChartData;
}

describe('SB9: the Sun alone in the 9th does not make Pitra Dosha', () => {
  it('Sun alone in the 9th: not present', () => {
    // Aries Lagna, 9th house = Sagittarius (index 8). Jupiter (9th lord) is in its own sign.
    expect(detectPitraDosha(ch([pl('Sun', 8, 9), pl('Jupiter', 8, 9)])).present).toBe(false);
  });
  it('Saturn in the 9th still counts', () => {
    const r = detectPitraDosha(ch([pl('Saturn', 8, 9), pl('Jupiter', 8, 9)]));
    expect(r.present).toBe(true);
  });
  it('Sun with Rahu in the 9th still counts (rule a), and Mars in the 9th with the Sun names only Mars', () => {
    expect(
      detectPitraDosha(ch([pl('Sun', 8, 9), pl('Rahu', 8, 9), pl('Jupiter', 8, 9)])).present,
    ).toBe(true);
    const r = detectPitraDosha(ch([pl('Sun', 8, 9), pl('Mars', 8, 9), pl('Jupiter', 8, 9)]));
    expect(r.indicators.join(' ')).toMatch(/Mars/);
    expect(r.indicators.join(' ')).not.toMatch(/Sun/);
  });
});

describe('SB3: one Grahan rule, the Sun counts with either node like the Moon', () => {
  const sunKetu = ch([pl('Sun', 3, 4), pl('Ketu', 3, 4)]);
  it('the dosha detector sees Sun with Ketu as Surya Grahan', () => {
    const r = detectGrahanDosha(sunKetu);
    expect(r.present).toBe(true);
    expect(r.type).toBe('surya_grahan');
    expect(r.description).toMatch(/Ketu/);
  });
  it('the Grahan yoga and the Grahan dosha agree on this chart', () => {
    const y = detectAllYogas(sunKetu).find((x) => x.name === 'Grahan Yoga');
    expect(y?.present).toBe(detectGrahanDosha(sunKetu).present);
  });
  it('nothing without a node', () => {
    expect(detectGrahanDosha(ch([pl('Sun', 3, 4), pl('Moon', 3, 4)])).present).toBe(false);
  });
});

describe('read time: old saved Pitra and Grahan are recomputed from the saved chart', () => {
  it('a saved Pitra from the Sun alone, and a missing Sun-Ketu Grahan, come out right', async () => {
    const chart = ch([pl('Sun', 8, 9), pl('Jupiter', 8, 9)]);
    const chart2 = ch([pl('Sun', 3, 4), pl('Ketu', 3, 4)]);
    const saved = {
      pitra: {
        present: true,
        indicators: ['9th house afflicted by malefic(s): Sun'],
        severity: 'mild',
        description: 'old',
      },
      grahan: { present: false, type: 'none', severity: 'none', description: '' },
    };
    const a = (await withLiveSaturnTransits(saved, undefined, { chart })) as Record<
      string,
      { present: boolean }
    >;
    expect(a.pitra?.present).toBe(false);
    const b = (await withLiveSaturnTransits(saved, undefined, { chart: chart2 })) as Record<
      string,
      { present: boolean }
    >;
    expect(b.grahan?.present).toBe(true);
  });
});
