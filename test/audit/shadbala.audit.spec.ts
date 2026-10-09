import { afterEach, describe, expect, it } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import { SIGN_LORDS, ZODIAC_SIGNS } from '@aroha-astrology/shared';
import {
  ayanaBala,
  calculateShadbala,
  cheshtaKendra,
  digBala,
  drekkanaBala,
  drishtiVirupa,
  kalaLords,
  kendradiBala,
  nathonnathaBala,
  ojhayugmaBala,
  pakshaBala,
  saptavargajaBala,
  uchchaBala,
} from '../../src/lib/astro-engine/calculations/shadbala.js';
import { calculateChart } from '../../src/lib/astro-engine/calculations/planetPositions.js';
import { DEFAULT_PROFILE, setActiveProfile } from '../../src/lib/astro-engine/rules/profile.js';
import type { DayContext } from '../../src/lib/astro-engine/rules/day.js';

// =============================================================================
// Shadbala after Bṛhat Parāśara Horā Śāstra chapter 27 (register BPHS-27.x)
// =============================================================================
// Every expected number is worked by hand from the chapter's rules or from the
// worked examples in R. Santhanam's translation, never from the code's output.
// =============================================================================

afterEach(() => setActiveProfile(DEFAULT_PROFILE));

const ALL: Planet[] = [
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

/** A chart from sidereal longitudes. Unplaced planets are parked well away from the ones under test. */
function chart(opts: {
  lon: Partial<Record<Planet, number>>;
  asc?: number;
  midheaven?: number;
  ayanamsaValue?: number;
  julianDay?: number;
}): ChartData {
  const asc = opts.asc ?? 0;
  const ascSign = Math.floor(asc / 30);
  const planets = ALL.map((planet, i) => {
    const longitude = (((opts.lon[planet] ?? 150 + i * 13) % 360) + 360) % 360;
    const signIndex = Math.floor(longitude / 30);
    return {
      planet,
      house: ((signIndex - ascSign + 12) % 12) + 1,
      signIndex,
      sign: ZODIAC_SIGNS[signIndex]!,
      signDegree: longitude - signIndex * 30,
      longitude,
      latitude: 0,
      speed: 1,
      isRetrograde: false,
    };
  });
  const houses = ZODIAC_SIGNS.map((_, i) => {
    const signIndex = (ascSign + i) % 12;
    const sign = ZODIAC_SIGNS[signIndex]!;
    return {
      house: i + 1,
      sign,
      signIndex,
      cusp: signIndex * 30,
      lord: SIGN_LORDS[sign],
      planets: planets.filter((p) => p.house === i + 1).map((p) => p.planet),
    };
  });
  return {
    planets,
    houses,
    ascendant: { sign: ZODIAC_SIGNS[ascSign]!, signIndex: ascSign, degree: asc % 30 },
    ayanamsa: 'lahiri',
    ayanamsaValue: opts.ayanamsaValue ?? 24,
    julianDay: opts.julianDay ?? 2451545,
    ...(opts.midheaven !== undefined ? { midheaven: opts.midheaven } : {}),
  } as unknown as ChartData;
}

const day = (over: Partial<DayContext> = {}): DayContext => ({
  isDay: true,
  fraction: 0.5,
  weekday: 0,
  hoursSinceSunrise: 6,
  hoursFromSolarNoon: 0,
  civilDate: { year: 2000, month: 1, day: 1 },
  basis: 'ephemeris',
  ...over,
});

// -----------------------------------------------------------------------------
// Sthana Bala
// -----------------------------------------------------------------------------

describe('[BPHS 27.1] Uchcha Bala: the arc from deep debilitation, folded, divided by 3', () => {
  it('the chapter’s example: the Sun at Pisces 12 deg 15 min is 50.75 virupas', () => {
    // 342 deg 15 min less the Sun's deep debilitation point, Libra 10 deg (190 deg) = 152 deg 15 min; / 3.
    expect(uchchaBala('Sun', 342.25)).toBeCloseTo(50.75, 4);
  });

  it('60 at the deep exaltation point and 0 at the deep debilitation point', () => {
    expect(uchchaBala('Moon', 33)).toBeCloseTo(60, 6); // Taurus 3
    expect(uchchaBala('Jupiter', 275)).toBeCloseTo(0, 6); // Capricorn 5
    expect(uchchaBala('Saturn', 200)).toBeCloseTo(60, 6); // Libra 20
  });

  it('an arc over 180 degrees is taken from 360', () => {
    // Mars debilitated at Cancer 28 (118); at 300 the arc is 182, so 178 / 3.
    expect(uchchaBala('Mars', 300)).toBeCloseTo(178 / 3, 6);
  });
});

describe('[BPHS 27.2-4] Saptavargaja Bala: seven divisions, 45/30/20/15/10/4/2', () => {
  // The Sun at Leo 4 deg (124). Venus in Cancer, Mercury in Scorpio, Mars in Pisces.
  //   Sign:        Leo 0-20 deg is the Sun's moolatrikona                       -> 45
  //   Hora:        first half of an odd sign is the Sun's hora: own             -> 30
  //   Drekkana:    first third: Leo itself, the Sun's own (and moolatrikona) sign
  //   Saptamsa:    4 / 4.2857 = part 0 of an odd sign: Leo itself, the same
  //   Navamsa:     4 / 3.333 = part 1 from Aries (fire): Taurus, lord Venus
  //                natural enemy; Venus is the 12th from the Sun: temporary friend
  //                enemy + friend = neutral                                      -> 10
  //   Dvadasamsa:  4 / 2.5 = part 1: Virgo, lord Mercury
  //                natural neutral; Mercury is the 4th from the Sun: friend
  //                neutral + friend = friend                                     -> 15
  //   Trimsamsa:   odd sign, under 5 deg: Mars
  //                natural friend; Mars is the 8th from the Sun: temporary enemy
  //                friend + enemy = neutral                                      -> 10
  const sun = chart({ lon: { Sun: 124, Venus: 100, Mercury: 220, Mars: 340 } });

  it('by the BPHS points, a moolatrikona sign counting in every division: 45+30+45+45+10+15+10 = 200', () => {
    expect(saptavargajaBala('Sun', 124, sun)).toBe(200);
  });

  it('with the moolatrikona degree range kept to the sign chart: the two Leo divisions are plain own, 170', () => {
    setActiveProfile({ ...DEFAULT_PROFILE, moolatrikonaInVargas: 'rasi-only' });
    expect(saptavargajaBala('Sun', 124, sun)).toBe(170);
  });

  it('with the older halving set (22.5/7.5/3.75/1.875): 45+30+45+45+7.5+15+7.5 = 195', () => {
    setActiveProfile({ ...DEFAULT_PROFILE, saptavargajaPoints: 'raman' });
    expect(saptavargajaBala('Sun', 124, sun)).toBe(195);
  });
});

describe('[BPHS 27.5] Ojhayugmarasyamsa Bala: odd signs for the male group, even for the Moon and Venus', () => {
  it('Mercury scores in odd signs only: Gemini 1 deg (odd, navamsa Libra, odd) 30; Taurus 1 deg (even, navamsa Capricorn, even) 0', () => {
    expect(ojhayugmaBala('Mercury', 61)).toBe(30);
    expect(ojhayugmaBala('Mercury', 31)).toBe(0);
  });

  it('the Moon and Venus score in even signs: Taurus 1 deg is 15 + 15', () => {
    expect(ojhayugmaBala('Moon', 31)).toBe(30);
    expect(ojhayugmaBala('Venus', 61)).toBe(0);
  });

  it('the Sun, Mars, Jupiter and Saturn score in odd signs: Aries 1 deg (navamsa Aries) is 15 + 15', () => {
    for (const planet of ['Sun', 'Mars', 'Jupiter', 'Saturn'] as Planet[]) {
      expect(ojhayugmaBala(planet, 1), planet).toBe(30);
    }
  });
});

describe('[BPHS 27.5-6] Kendradi and Drekkana Bala', () => {
  it('60 in an angle, 30 in a succedent, 15 in a cadent house', () => {
    expect([1, 4, 7, 10].map(kendradiBala)).toEqual([60, 60, 60, 60]);
    expect([2, 5, 8, 11].map(kendradiBala)).toEqual([30, 30, 30, 30]);
    expect([3, 6, 9, 12].map(kendradiBala)).toEqual([15, 15, 15, 15]);
  });

  it('15 for male planets in the first drekkana, neuter in the second, female in the third', () => {
    expect(drekkanaBala('Sun', 5)).toBe(15);
    expect(drekkanaBala('Sun', 15)).toBe(0);
    expect(drekkanaBala('Mercury', 15)).toBe(15);
    expect(drekkanaBala('Saturn', 5)).toBe(0);
    expect(drekkanaBala('Venus', 25)).toBe(15);
    expect(drekkanaBala('Moon', 15)).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Dig Bala
// -----------------------------------------------------------------------------

describe('[BPHS 27.7-8] Dig Bala: degrees from the point of no strength, divided by 3', () => {
  // Ascendant 100, Midheaven 10 (so Descendant 280, Nadir 190).
  const asc = 100;
  const mc = 10;

  it('Jupiter and Mercury are 60 on the Ascendant, 0 on the Descendant, 30 a quarter-circle away', () => {
    expect(digBala('Jupiter', 100, asc, mc)).toBeCloseTo(60, 9);
    expect(digBala('Mercury', 280, asc, mc)).toBeCloseTo(0, 9);
    expect(digBala('Jupiter', 190, asc, mc)).toBeCloseTo(30, 9);
  });

  it('the Sun and Mars are 60 on the Midheaven and 0 on the Nadir', () => {
    expect(digBala('Sun', 10, asc, mc)).toBeCloseTo(60, 9);
    expect(digBala('Mars', 190, asc, mc)).toBeCloseTo(0, 9);
  });

  it('Saturn is 60 exactly on the Descendant and 0 exactly on the Ascendant (the chapter’s example)', () => {
    expect(digBala('Saturn', 280, asc, mc)).toBeCloseTo(60, 9);
    expect(digBala('Saturn', 100, asc, mc)).toBeCloseTo(0, 9);
  });

  it('the Moon and Venus are 60 on the Nadir and 0 on the Midheaven', () => {
    expect(digBala('Moon', 190, asc, mc)).toBeCloseTo(60, 9);
    expect(digBala('Venus', 10, asc, mc)).toBeCloseTo(0, 9);
  });

  it('the strength changes smoothly inside a house: 10 degrees off the Ascendant is 60 - 10/3', () => {
    expect(digBala('Jupiter', 110, asc, mc)).toBeCloseTo(60 - 10 / 3, 9);
  });
});

// -----------------------------------------------------------------------------
// Kala Bala
// -----------------------------------------------------------------------------

describe('[BPHS 27.8-9] Nathonnatha Bala: 60 less 5 virupas for each hour from midnight', () => {
  it('at apparent midnight the Moon, Mars and Saturn have 60 and the Sun, Jupiter and Venus 0', () => {
    for (const planet of ['Moon', 'Mars', 'Saturn'] as Planet[]) {
      expect(nathonnathaBala(planet, 12), planet).toBeCloseTo(60, 9);
    }
    for (const planet of ['Sun', 'Jupiter', 'Venus'] as Planet[]) {
      expect(nathonnathaBala(planet, 12), planet).toBeCloseTo(0, 9);
    }
  });

  it('at noon it is the other way round', () => {
    expect(nathonnathaBala('Sun', 0)).toBeCloseTo(60, 9);
    expect(nathonnathaBala('Moon', 0)).toBeCloseTo(0, 9);
  });

  it('six hours from noon (and from midnight) both groups have 30; three hours from midnight 45 and 15', () => {
    expect(nathonnathaBala('Moon', 6)).toBeCloseTo(30, 9);
    expect(nathonnathaBala('Sun', 18)).toBeCloseTo(30, 9);
    expect(nathonnathaBala('Moon', 9)).toBeCloseTo(45, 9); // 9 pm, 3 hours before midnight
    expect(nathonnathaBala('Venus', 9)).toBeCloseTo(15, 9);
    expect(nathonnathaBala('Moon', 15)).toBeCloseTo(45, 9); // 3 am, 3 hours after midnight
    expect(nathonnathaBala('Moon', 21)).toBeCloseTo(15, 9); // 9 am, 9 hours from midnight
  });

  it('Mercury has 60 at every hour', () => {
    for (const h of [0, 3, 6, 12, 17]) expect(nathonnathaBala('Mercury', h)).toBe(60);
  });
});

describe('[BPHS 27.10-11] Paksha Bala: folded Moon-Sun arc / 3 for the benefics, 60 less that for the malefics', () => {
  const benefic: Planet = 'Jupiter';
  const malefic: Planet = 'Saturn';
  // arc (Moon minus Sun), benefic, malefic
  const cases: Array<[number, number, number]> = [
    [0, 0, 60], // new Moon
    [90, 30, 30],
    [135, 45, 15], // waxing gibbous
    [180, 60, 0], // full Moon
    [225, 45, 15], // waning gibbous: the benefics are still strong. Before the fix this gave 15 and 45.
    [270, 30, 30],
    [359, 1 / 3, 60 - 1 / 3],
  ];

  it.each(cases)('arc %i degrees', (arc, b, m) => {
    expect(pakshaBala(benefic, arc)).toBeCloseTo(b, 9);
    expect(pakshaBala(malefic, arc)).toBeCloseTo(m, 9);
  });

  it('the Moon, Mercury and Venus take the benefic figure; the Sun and Mars the malefic', () => {
    for (const planet of ['Moon', 'Mercury', 'Venus'] as Planet[]) {
      expect(pakshaBala(planet, 225), planet).toBeCloseTo(45, 9);
    }
    for (const planet of ['Sun', 'Mars'] as Planet[]) {
      expect(pakshaBala(planet, 225), planet).toBeCloseTo(15, 9);
    }
  });

  it('is continuous across the full Moon: 179.9 and 180.1 degrees differ by a fraction of a virupa', () => {
    expect(Math.abs(pakshaBala(benefic, 179.9) - pakshaBala(benefic, 180.1))).toBeLessThan(0.1);
  });
});

describe('[BPHS 27.12-13] who rules the year, month, day, hour and third of the day', () => {
  // The book's example: 1 June 1984 -> year lord Thursday (Jupiter), month lord Friday (Venus), day lord Friday (Venus).
  it('the chapter’s example date', () => {
    const lords = kalaLords(day({ weekday: 5, civilDate: { year: 1984, month: 6, day: 1 } }));
    expect(lords.varshaLord).toBe('Jupiter');
    expect(lords.masaLord).toBe('Venus');
    expect(lords.dinaLord).toBe('Venus');
  });

  it('the day is cut into 24 equal hours: the 24th hour from Sunday sunrise is Mercury, then Monday starts with the Moon', () => {
    expect(kalaLords(day({ weekday: 0, hoursSinceSunrise: 0.2 })).horaLord).toBe('Sun');
    expect(kalaLords(day({ weekday: 0, hoursSinceSunrise: 1.2 })).horaLord).toBe('Venus');
    expect(kalaLords(day({ weekday: 0, hoursSinceSunrise: 23.5 })).horaLord).toBe('Mercury');
    expect(kalaLords(day({ weekday: 1, hoursSinceSunrise: 0.2 })).horaLord).toBe('Moon');
  });
});

describe('[BPHS 27.15-17] Ayana Bala by the khandas 45, 33, 12', () => {
  // f(bhuja) steps through 45 at 30 deg, 78 at 60 deg and 90 at 90 deg; bala = (90 +/- f) / 3.
  it('the Sun at the summer solstice (tropical 90) is 60, at the winter solstice (270) 0, at an equinox 30', () => {
    expect(ayanaBala('Sun', 90)).toBeCloseTo(60, 9);
    expect(ayanaBala('Sun', 270)).toBeCloseTo(0, 9);
    expect(ayanaBala('Sun', 0)).toBeCloseTo(30, 9);
    expect(ayanaBala('Sun', 180)).toBeCloseTo(30, 9);
  });

  it('inside the first khanda: the Sun at tropical 15 is (90 + 22.5) / 3 = 37.5; at 30 it is (90 + 45) / 3 = 45', () => {
    expect(ayanaBala('Sun', 15)).toBeCloseTo(37.5, 9);
    expect(ayanaBala('Sun', 30)).toBeCloseTo(45, 9);
  });

  it('inside the second and third khandas: at 60 it is (90 + 78) / 3 = 56; at 75, (90 + 84) / 3 = 58', () => {
    expect(ayanaBala('Sun', 60)).toBeCloseTo(56, 9);
    expect(ayanaBala('Sun', 75)).toBeCloseTo(58, 9);
  });

  it('the bhuja is measured from the nearer equinox: tropical 150 and 30 give the same f', () => {
    expect(ayanaBala('Sun', 150)).toBeCloseTo(ayanaBala('Sun', 30), 9);
    expect(ayanaBala('Sun', 210)).toBeCloseTo(
      ayanaBala('Sun', 330) /* bhuja 30 both, both southern */,
      9,
    );
  });

  it('the Moon and Saturn are strong in the southern half: at tropical 210 (bhuja 30) 45, at 30 only 15', () => {
    expect(ayanaBala('Moon', 210)).toBeCloseTo(45, 9);
    expect(ayanaBala('Moon', 30)).toBeCloseTo(15, 9);
    expect(ayanaBala('Saturn', 270)).toBeCloseTo(60, 9);
  });

  it('Mercury always takes the added form, so it is never below 30', () => {
    expect(ayanaBala('Mercury', 30)).toBeCloseTo(45, 9);
    expect(ayanaBala('Mercury', 210)).toBeCloseTo(45, 9);
    expect(ayanaBala('Mercury', 0)).toBeCloseTo(30, 9);
  });

  it('the Sun’s Ayana Bala is doubled only when the profile says so', () => {
    const c = chart({ lon: { Sun: 66 }, ayanamsaValue: 24 }); // tropical 90
    const plain = calculateShadbala(c, null).find((r) => r.planet === 'Sun')!.cheshtaBala;
    expect(plain).toBeCloseTo(60, 6);
    setActiveProfile({ ...DEFAULT_PROFILE, kalaDoubling: 'sun-ayana-moon-paksha' });
    expect(calculateShadbala(c, null).find((r) => r.planet === 'Sun')!.cheshtaBala).toBeCloseTo(
      120,
      6,
    );
  });
});

// -----------------------------------------------------------------------------
// Cheshta Bala
// -----------------------------------------------------------------------------

describe('[BPHS 27.18, 27.24-25] Cheshta Bala', () => {
  const noon = async (year: number, month: number, day: number) =>
    calculateChart(year, month, day, 12, 0, 0, 0, 0);
  const cheshta = async (
    planet: 'Mars' | 'Mercury' | 'Jupiter' | 'Venus' | 'Saturn',
    y: number,
    m: number,
    d: number,
  ) => {
    const c = await noon(y, m, d);
    const pos = c.planets.find((p) => p.planet === planet)!;
    return cheshtaKendra(planet, pos.longitude, c.julianDay, c.ayanamsaValue) / 3;
  };

  // A planet is in line with its sighrocca at conjunction with the Sun (outer planets, Venus beyond the Sun)
  // and opposite it at opposition / inferior conjunction, when it also goes retrograde. The strength must
  // then be near its two ends.
  it('Mars at opposition (8 Dec 2022, retrograde) is close to 60; Mars in conjunction with the Sun (8 Oct 2021) close to 0', async () => {
    expect(await cheshta('Mars', 2022, 12, 8)).toBeGreaterThan(54);
    expect(await cheshta('Mars', 2021, 10, 8)).toBeLessThan(6);
  }, 60_000);

  it('Jupiter (26 Sep 2022) and Saturn (14 Aug 2022) at opposition are close to 60', async () => {
    expect(await cheshta('Jupiter', 2022, 9, 26)).toBeGreaterThan(54);
    expect(await cheshta('Saturn', 2022, 8, 14)).toBeGreaterThan(54);
  }, 60_000);

  it('Venus at inferior conjunction (3 Jun 2020, retrograde) is close to 60; at superior conjunction (26 Mar 2021) close to 0', async () => {
    expect(await cheshta('Venus', 2020, 6, 3)).toBeGreaterThan(54);
    expect(await cheshta('Venus', 2021, 3, 26)).toBeLessThan(6);
  }, 60_000);

  it('the Sun’s Cheshta Bala is its Ayana Bala and the Moon’s is its Paksha Bala', () => {
    // Sun tropical 90 deg (sidereal 66 + ayanamsa 24): Ayana 60. Moon 90 deg ahead of the Sun: Paksha 30.
    const c = chart({ lon: { Sun: 66, Moon: 156 } });
    const rows = calculateShadbala(c, null);
    expect(rows.find((r) => r.planet === 'Sun')!.cheshtaBala).toBeCloseTo(60, 6);
    expect(rows.find((r) => r.planet === 'Moon')!.cheshtaBala).toBeCloseTo(30, 6);
  });
});

// -----------------------------------------------------------------------------
// Drik Bala
// -----------------------------------------------------------------------------

describe('[BPHS 26.6-12, 27.19] Drik Bala', () => {
  it('the aspect value at the stages of BPHS 26.6-8', () => {
    const v = (arc: number) => drishtiVirupa('Venus', arc);
    expect([0, 15, 29.9, 300, 330].map(v)).toEqual([0, 0, 0, 0, 0]);
    expect(v(45)).toBeCloseTo(7.5, 9); // (45 - 30) / 2
    expect(v(75)).toBeCloseTo(30, 9); // 75 - 60 + 15
    expect(v(105)).toBeCloseTo(37.5, 9); // (120 - 105) / 2 + 30
    expect(v(135)).toBeCloseTo(15, 9); // 150 - 135
    expect(v(165)).toBeCloseTo(30, 9); // (165 - 150) x 2
    expect(v(180)).toBeCloseTo(60, 9);
    expect(v(240)).toBeCloseTo(30, 9); // (300 - 240) / 2
  });

  it('Mars, Jupiter and Saturn reach 60 on their special aspects: Mars 90 and 210, Jupiter 120 and 240, Saturn 60 and 270', () => {
    expect(drishtiVirupa('Mars', 90)).toBeCloseTo(60, 9);
    expect(drishtiVirupa('Mars', 210)).toBeCloseTo(60, 9);
    expect(drishtiVirupa('Jupiter', 120)).toBeCloseTo(60, 9);
    expect(drishtiVirupa('Jupiter', 240)).toBeCloseTo(60, 9);
    expect(drishtiVirupa('Saturn', 60)).toBeCloseTo(60, 9);
    expect(drishtiVirupa('Saturn', 270)).toBeCloseTo(60, 9);
    // and only they: another planet at the same arcs gets the plain value
    expect(drishtiVirupa('Venus', 90)).toBeCloseTo(45, 9);
    expect(drishtiVirupa('Venus', 120)).toBeCloseTo(30, 9);
    expect(drishtiVirupa('Venus', 270)).toBeCloseTo(15, 9);
  });

  it('the extra covers the 30 degrees from the aspect on: Mars at 100 is 40 + 15, Saturn at 285 is 7.5 + 45', () => {
    expect(drishtiVirupa('Mars', 100)).toBeCloseTo(55, 9);
    expect(drishtiVirupa('Saturn', 285)).toBeCloseTo(52.5, 9);
    expect(drishtiVirupa('Jupiter', 135)).toBeCloseTo(45, 9);
  });

  it('the arc runs from the aspector to the aspected: a planet 120 or 240 degrees AHEAD of Jupiter is aspected in full (5th, 9th); 60 ahead only 15; 300 ahead not at all', () => {
    expect(drishtiVirupa('Jupiter', 120)).toBeCloseTo(60, 9);
    expect(drishtiVirupa('Jupiter', -120)).toBeCloseTo(60, 9); // -120 is 240 ahead
    expect(drishtiVirupa('Jupiter', 60)).toBeCloseTo(15, 9);
    expect(drishtiVirupa('Jupiter', 300)).toBeCloseTo(0, 9);
  });

  it('a quarter of the benefics’ aspects less a quarter of the malefics’: the Moon at 100 with Jupiter opposite and Saturn 90 behind', () => {
    // Jupiter at 280: arc (100 - 280) = 180 -> 60, benefic: +15.
    // Saturn at 10: arc (100 - 10) = 90 -> 45 (no special band at exactly 90), malefic: -11.25.
    // Everyone else 10-16 degrees ahead of the Moon: arcs 344-350, no aspect.
    const c = chart({
      lon: { Moon: 100, Jupiter: 280, Saturn: 10, Sun: 116, Mars: 114, Mercury: 110, Venus: 112 },
    });
    const moon = calculateShadbala(c, null).find((r) => r.planet === 'Moon')!;
    expect(moon.drikBala).toBeCloseTo(3.75, 6);
  });

  it('is not clamped: a planet aspected only by malefics goes negative', () => {
    // Saturn opposite the Moon (arc 180 -> 60 malefic -15), nothing else aspecting.
    const c = chart({
      lon: { Moon: 100, Saturn: 280, Sun: 116, Mars: 114, Mercury: 110, Venus: 112, Jupiter: 106 },
    });
    expect(calculateShadbala(c, null).find((r) => r.planet === 'Moon')!.drikBala).toBeLessThan(0);
  });
});

// -----------------------------------------------------------------------------
// Totals
// -----------------------------------------------------------------------------

describe('[BPHS 27.14, 27.32-33] Naisargika Bala and the required totals', () => {
  const c = chart({ lon: { Sun: 10, Moon: 100, Mars: 200 } });
  const rows = calculateShadbala(c, null);
  const row = (p: Planet) => rows.find((r) => r.planet === p)!;

  it('Naisargika Bala is 60/7 times 1 to 7 for Saturn, Mars, Mercury, Jupiter, Venus, Moon, Sun', () => {
    expect(row('Sun').naisargikaBala).toBeCloseTo(60, 2);
    expect(row('Moon').naisargikaBala).toBeCloseTo(51.43, 2);
    expect(row('Venus').naisargikaBala).toBeCloseTo(42.86, 2);
    expect(row('Jupiter').naisargikaBala).toBeCloseTo(34.29, 2);
    expect(row('Mercury').naisargikaBala).toBeCloseTo(25.71, 2);
    expect(row('Mars').naisargikaBala).toBeCloseTo(17.14, 2);
    expect(row('Saturn').naisargikaBala).toBeCloseTo(8.57, 2);
  });

  it('the strong-planet minimum is 390, 360, 300, 420, 390, 330, 300 virupas (6.5, 6, 5, 7, 6.5, 5.5, 5 rupas)', () => {
    expect(
      ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].map(
        (p) => row(p as Planet).requiredVirupas,
      ),
    ).toEqual([390, 360, 300, 420, 390, 330, 300]);
  });

  it('the total is the sum of the six, and strong means reaching the minimum', () => {
    for (const r of rows) {
      const parts =
        r.sthanaBala + r.digBala + r.kalaBala + r.cheshtaBala + r.naisargikaBala + r.drikBala;
      expect(Math.abs(r.totalVirupas - parts), r.planet).toBeLessThan(0.05);
      expect(r.isStrong, r.planet).toBe(r.totalVirupas >= r.requiredVirupas);
    }
  });
});
