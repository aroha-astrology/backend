// C2: M.S. Mehta, "Annual Horoscope (Varshaphala): Effective Predictive Techniques" (266 pp.),
// astrofoxx.files.wordpress.com/2018/11/jyotish_annual-horoscope_varshaphala_m-s-mehta.pdf
// His worked examples as fixtures. The book's planet degrees are used as printed; where a drawing is
// too poor to read, the sign is chosen so the example holds as the text states it (stated per case).
import { describe, it, expect } from 'vitest';
import type { ChartData } from '@aroha-astrology/shared';
import { panchavargiBala } from '../src/lib/astro-engine/varshphal/tajika.js';
import { selectVarsheshwara } from '../src/lib/astro-engine/varshphal/varsheshwara.js';
import { computeTajikaYogas } from '../src/lib/astro-engine/varshphal/tajika-yogas.js';
import { computeExtraTajikaYogas, type ExtraYogaKind } from '../src/lib/astro-engine/varshphal/tajika-yogas-extra.js';

const dm = (d: number, m = 0) => d + m / 60;
const L = (sign: number, d: number, m = 0) => sign * 30 + dm(d, m);
const [Ari, Tau, Gem, Can, Leo, Vir, Lib, Sco, Sag, Cap, Aqu, Pis] = Array.from({ length: 12 }, (_, i) => i);

function chart(asc: number, planets: Record<string, number | [number, boolean]>): ChartData {
  return {
    ascendant: { signIndex: Math.floor(asc / 30), degree: asc % 30 },
    planets: Object.entries(planets).map(([planet, v]) => {
      const longitude = Array.isArray(v) ? v[0] : v;
      return { planet, longitude, signIndex: Math.floor(longitude / 30), isRetrograde: Array.isArray(v) ? v[1] : false };
    }),
  } as unknown as ChartData;
}

describe('Mehta ch. V: Panchavargiya bala of the Nehru annual chart 1946-47 (Vishwabala)', () => {
  // Signs from the book's text: Sun, Venus, Mars and Mercury in Scorpio, Moon in Leo, Jupiter in
  // Libra, Saturn in Cancer; Varsha Lagna Aquarius 23 57.
  const nehru = chart(L(Aqu, 23, 57), {
    Sun: L(Sco, 0, 16), Moon: L(Leo, 5, 51), Mars: L(Sco, 13, 49), Mercury: L(Sco, 12, 4),
    Jupiter: L(Lib, 18, 3), Venus: L(Sco, 2, 36), Saturn: L(Can, 15, 44),
  });
  // His table, sexagesimal "units.minutes" read as decimals: kshetra, uccha, hadda, drekkana.
  const book: Record<string, [number, number, number, number]> = {
    Sun: [7.5, 2 + 15 / 60, 3.75, 2.5], Moon: [7.5, 9 + 41 / 60, 11.25, 5],
    Mars: [30, 11 + 45 / 60, 3.75, 2.5], Mercury: [7.5, 13 + 39 / 60, 15, 2.5],
    Jupiter: [15, 8 + 33 / 60, 15, 2.5], Venus: [7.5, 3 + 57 / 60, 3.75, 2.5], Saturn: [15, 9 + 34 / 60, 11.25, 7.5],
  };
  it.each(Object.keys(book))('%s: kshetra, uccha, hadda and drekkana equal the book', (planet) => {
    const b = panchavargiBala(planet as never, nehru);
    const [k, u, h, d] = book[planet]!;
    expect(b.griha).toBeCloseTo(k, 6);
    expect(b.uchcha).toBeCloseTo(u, 1);
    expect(b.hadda).toBeCloseTo(h, 6);
    expect(b.drekkana).toBeCloseTo(d, 6);
  });
  it('the book scores the Moon navamsa (Taurus, its sign of exaltation) 5; the engine, by lord only, gives 1.25. Pending the owner\'s decision.', () => {
    expect(panchavargiBala('Moon' as never, nehru).navamsa).toBe(1.25);
  });
  it('Year Lord of 1947 is Mars: strongest of the five that look at the Lagna (Moon, Mars, Saturn, Mars, Jupiter)', () => {
    const r = selectVarsheshwara(Can, Ari, nehru, true);
    expect(r.candidates.map((c) => c.planet)).toEqual(['Moon', 'Mars', 'Saturn', 'Mars', 'Jupiter']);
    expect(r.varsheshwara).toBe('Mars');
  });
  // Mehta: "When the office bearers have equal strength and all of them aspect lagna, one holding the
  // greater number of portfolios qualifies". The engine, when one planet holds two roles and is the
  // strongest, returns the Muntha lord instead (76 of 300 synthetic charts). Rule change awaits the owner.
  it.todo('a planet that holds two of the five roles and is the strongest wins over the Muntha lord');
});

type Case = {
  name: string; page: string; chart: ChartData; karyeshHouse: number | null; expect: ExtraYogaKind; with?: string[];
};
const CASES: Case[] = [
  {
    name: 'Duhphali-kuttha: Mercury exalted in the Lagna (26 50), the Moon faster and behind it (24 52)',
    page: 'p. 143-144', karyeshHouse: 11, expect: 'duhphali-kuttha', with: ['Moon', 'Mercury'],
    // Sign of the Moon chosen: Capricorn (5th from Virgo, neutral sign), not Taurus where it would be exalted.
    chart: chart(L(Vir, 7, 43), {
      Sun: L(Leo, 0, 46), Moon: L(Cap, 24, 52), Mars: L(Ari, 3, 36), Mercury: L(Vir, 26, 50),
      Jupiter: L(Lib, 24, 44), Venus: L(Lib, 24, 43), Saturn: L(Sag, 0, 44),
    }),
  },
  {
    name: 'Induvara: every planet in the 3rd, 6th, 9th or 12th house',
    page: 'p. 129-130', karyeshHouse: null, expect: 'induvara',
    chart: chart(L(Ari, 10), {
      Sun: L(Gem, 5), Moon: L(Vir, 20), Mars: L(Sag, 11), Mercury: L(Gem, 25), Jupiter: L(Vir, 3), Venus: L(Pis, 9), Saturn: L(Sag, 21),
    }),
  },
  {
    name: 'Iqbal: Cancer Lagna with its lord Moon in its own sign, Sun exalted in the 10th exchanging with Mars, Saturn in its own sign; all in kendras and panapharas',
    page: 'p. 128-129', karyeshHouse: null, expect: 'iqbal',
    chart: chart(L(Can, 10), {
      Sun: L(Ari, 10), Moon: L(Can, 12), Mars: L(Leo, 5), Mercury: L(Tau, 8), Jupiter: L(Lib, 14), Venus: L(Tau, 20), Saturn: L(Cap, 20),
    }),
  },
  {
    name: 'Manau: Mars (Lagnesh, 9 10) and Venus (6 40) in Ithasala, and Venus joins Saturn',
    page: 'p. 138-139', karyeshHouse: null, expect: 'manau', with: ['Venus', 'Mars', 'Saturn'],
    chart: chart(L(Ari, 5), {
      Sun: L(Lib, 7, 6), Moon: L(Cap, 4, 3), Mars: L(Ari, 9, 10), Venus: L(Leo, 6, 40), Saturn: L(Leo, 6, 40),
      Mercury: L(Aqu, 2), Jupiter: L(Pis, 20),
    }),
  },
  {
    name: 'Khallasara: Lagnesh Jupiter (5 57) and Karyesh Mercury (2 37) in Ithasala; the Moon (8 13) in the 2nd, not with or looking at either',
    page: 'p. 142', karyeshHouse: 7, expect: 'khallasara', with: ['Jupiter', 'Mercury', 'Moon'],
    // Sagittarius Lagna: Mercury rules the 7th (Gemini). Jupiter and Mercury in Gemini; the Moon in
    // the 2nd (Capricorn), which is 6th from Gemini and so does not look at it.
    chart: chart(L(Sag, 12, 27), {
      Sun: L(Aqu, 25, 53), Moon: L(Cap, 8, 13), Mars: L(Pis, 12, 41), Mercury: L(Gem, 2, 37), Jupiter: [L(Gem, 5, 57), true], Venus: L(Sag, 20), Saturn: L(Sco, 6, 15),
    }),
  },
  {
    name: 'Dutthottha-davira: Mars (18 44) and Sun (28 38) both fallen and not in Ithasala; Mars has an Ithasala with Venus (12 22) in its own sign',
    page: 'p. 144-145', karyeshHouse: 5, expect: 'dutthottha-davira', with: ['Mars', 'Sun', 'Venus'],
    chart: chart(L(Ari, 5, 55), {
      Sun: L(Lib, 28, 38), Moon: L(Aqu, 4, 34), Mars: L(Can, 18, 44), Mercury: L(Lib, 19, 23), Jupiter: L(Gem, 9, 31), Venus: L(Lib, 12, 22), Saturn: L(Pis, 28, 2),
    }),
  },
  {
    name: 'Durupha: Lagnesh Jupiter (9 26) and Karyesh Saturn (11 21), both retrograde in the 6th, in Ithasala',
    page: 'p. 145-146', karyeshHouse: 11, expect: 'durupha',
    // Pisces Lagna: the 6th is Leo; Saturn rules the 11th (Capricorn).
    chart: chart(L(Pis, 24, 4), {
      Sun: L(Aqu, 4), Moon: L(Aqu, 0, 43), Mars: L(Aqu, 4, 53), Mercury: L(Aqu, 1, 29), Jupiter: [L(Leo, 9, 26), true], Venus: L(Aqu, 19, 45), Saturn: [L(Leo, 11, 21), true],
    }),
  },
  {
    name: 'Tambira (Rashi-anta): Venus at 29 30 of Capricorn, not yet looking at Saturn in Aquarius; one step on, they are together',
    page: 'p. 136, 145', karyeshHouse: null, expect: 'tambira', with: ['Venus', 'Saturn'],
    chart: chart(L(Ari, 5), { Venus: L(Cap, 29, 30), Saturn: L(Aqu, 3), Moon: L(Pis, 20) }),
  },
  {
    name: 'Kuttha: the Moon in the Lagna, aspected by Jupiter in its own sign in the 9th',
    page: 'p. 145', karyeshHouse: null, expect: 'kuttha', with: ['Jupiter', 'Moon'],
    chart: chart(L(Ari, 5), { Moon: L(Ari, 20), Jupiter: L(Sag, 10), Sun: L(Cap, 5) }),
  },
  {
    name: 'Gairi-Kamboola: Lagnesh Mars (9 25) and Karyesh Saturn (10 22) in Ithasala, and Mars in Ithasala with a strong Jupiter',
    page: 'p. 141-142', karyeshHouse: 10, expect: 'gairi-kamboola', with: ['Mars', 'Saturn', 'Jupiter'],
    chart: chart(L(Ari, 5, 21), { Mars: L(Ari, 9, 25), Saturn: L(Gem, 10, 22), Jupiter: L(Can, 12), Moon: L(Lib, 20) }),
  },
];

describe('Mehta ch. VIII: the extra Tajika yogas on his examples', () => {
  it.each(CASES)('$name ($page)', (c) => {
    const found = computeExtraTajikaYogas(c.chart, c.karyeshHouse).filter((y) => y.kind === c.expect);
    expect(found.length, `${c.expect} not found`).toBeGreaterThan(0);
    if (c.with) expect(found.some((y) => c.with!.every((p) => y.planets.includes(p as never))), c.with.join('+')).toBe(true);
  });

  it('Iqbal: Mehta\'s essential condition, a strong Lagna lord, is reported not assumed', () => {
    const c = CASES.find((x) => x.expect === 'iqbal')!;
    const y = computeExtraTajikaYogas(c.chart).find((x) => x.kind === 'iqbal')!;
    expect(typeof y.lagneshStrong).toBe('boolean');
    expect(y.lagneshStrong).toBe(true);
  });

  it('negatives: a mixed chart has no Iqbal and no Induvara; no pair means no pair yoga', () => {
    const mixed = chart(L(Ari, 5), { Sun: L(Ari, 1), Moon: L(Gem, 1), Mars: L(Can, 1), Mercury: L(Vir, 1), Jupiter: L(Lib, 1), Venus: L(Sag, 1), Saturn: L(Aqu, 1) });
    const kinds = computeExtraTajikaYogas(mixed, 7).map((y) => y.kind);
    expect(kinds).not.toContain('iqbal');
    expect(kinds).not.toContain('induvara');
    expect(kinds).not.toContain('khallasara');
  });
});

describe('Mehta ch. VIII: the six built yogas on his drawn examples', () => {
  it('Ithasala Example A: Mars 9 25 behind Saturn 10 22 (3rd and 11th), gap 0 57, mean orb 8.5', () => {
    const y = computeTajikaYogas(chart(L(Ari, 5, 21), { Mars: L(Ari, 9, 25), Saturn: L(Gem, 10, 22) }));
    const i = y.find((x) => x.kind === 'ithasala' && x.planets.join() === 'Mars,Saturn')!;
    expect(i.gapDeg).toBeCloseTo(dm(0, 57), 2);
  });
  it('Bhavishya case: Sun 11 15 and Jupiter 25 21 are 14 06 apart, outside the 12 degree orb: no Ithasala today', () => {
    const y = computeTajikaYogas(chart(L(Ari, 5), { Sun: L(Ari, 11, 15), Jupiter: L(Ari, 25, 21) }));
    expect(y.some((x) => x.kind === 'ithasala')).toBe(false);
  });
  it('Mercury (2/12) and Jupiter, Venus and Mars (6/8): no aspect, no yoga (p. 130)', () => {
    expect(computeTajikaYogas(chart(L(Ari, 5), { Mercury: L(Pis, 9, 14), Jupiter: L(Ari, 19, 12) }))).toEqual([]);
    expect(computeTajikaYogas(chart(L(Ari, 5), { Venus: L(Ari, 1), Mars: L(Sco, 11, 12) }))).toEqual([]);
  });
  it('Ishrafa: Mars 5 05, Sun 9 03 ahead of it', () => {
    const y = computeTajikaYogas(chart(L(Ari, 5), { Mars: L(Ari, 5, 5), Sun: L(Ari, 9, 3) }));
    expect(y.some((x) => x.kind === 'ishrafa' && x.planets.join() === 'Sun,Mars')).toBe(true);
  });
  it('Radda: Mercury (10 20) and a retrograde Jupiter (16 13) in Ithasala', () => {
    const y = computeTajikaYogas(chart(L(Ari, 5), { Mercury: L(Gem, 10, 20), Jupiter: [L(Gem, 16, 13), true] }));
    expect(y.some((x) => x.kind === 'radda' && x.reason === 'retrograde')).toBe(true);
  });
});
