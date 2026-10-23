import { describe, expect, it } from 'vitest';
import { buildScroll, houseOf, induLagna, lagnaSignOf, SCROLL_COUNT, SCROLL_IDS, SCROLL_TITLES } from '../src/lib/astro-tools/daily-hooks/rahasya';
import { fixtureChart } from './helpers/chart-fixture';

describe('the chart fixture itself', () => {
  it('pins the Ashtakavarga totals the engine is known to give: 48/49/39/54/56/52/39 and 337', () => {
    const c = fixtureChart();
    const totals = c.bhinna.map((b) => b.bindus.reduce((a, x) => a + x, 0));
    expect(totals).toEqual([48, 49, 39, 54, 56, 52, 39]);
    expect(c.sarva.reduce((a, x) => a + x, 0)).toBe(337);
  });
});

describe('the scroll list', () => {
  it('has 17 scrolls, each with an id and a title, and every one builds', () => {
    expect(SCROLL_COUNT).toBe(17);
    expect(SCROLL_IDS).toHaveLength(17);
    expect(SCROLL_TITLES).toHaveLength(17);
    const c = fixtureChart();
    for (let n = 1; n <= SCROLL_COUNT; n++) {
      const s = buildScroll(n, c);
      expect(s.n).toBe(n);
      expect(s.headline.length).toBeGreaterThan(10);
      expect(s.facts.length).toBeGreaterThan(0);
      expect(s.why.length).toBeGreaterThan(0);
    }
  });

  it('refuses a scroll that does not exist', () => {
    expect(() => buildScroll(0, fixtureChart())).toThrow();
    expect(() => buildScroll(18, fixtureChart())).toThrow();
    expect(() => buildScroll(1.5, fixtureChart())).toThrow();
  });

  it('is deterministic', () => {
    expect(buildScroll(9, fixtureChart())).toEqual(buildScroll(9, fixtureChart()));
  });

  it('never claims health, fear or certainty', () => {
    const c = fixtureChart();
    const text = Array.from({ length: 17 }, (_, i) => JSON.stringify(buildScroll(i + 1, c))).join(' ');
    expect(text).not.toMatch(/\b(disease|illness|death|doom|guarantee|will definitely|AI)\b/i);
  });
});

describe('scroll contents on the fixture', () => {
  const c = fixtureChart();
  it('1: Libra Ascendant, Venus its lord in Pisces, 6th house', () => {
    const s = buildScroll(1, c);
    expect(s.headline).toContain('Libra');
    expect(s.facts.find((f) => f.label === 'Ruled by')!.value).toBe('Venus');
    expect(s.facts.at(-1)!.value).toBe('Pisces, house 6');
    expect(s.badge).toBeNull();
  });
  it('2: Moon in Taurus, Rohini pada 2', () => {
    const s = buildScroll(2, c);
    expect(s.headline).toContain('Taurus');
    expect(s.headline).toContain('Rohini');
    expect(s.headline).toContain('pada 2');
  });
  it('3: Sun in its own sign Leo, 11th house from a Libra Ascendant', () => {
    const s = buildScroll(3, c);
    expect(s.headline).toContain('in its own sign');
    expect(s.headline).toContain('11th house');
  });
  it('7 and 8: the running periods and what is left', () => {
    expect(buildScroll(7, c).headline).toBe('You are in the Venus Mahadasha, until 2041-03-01.');
    const t = buildScroll(7, c).facts.find((f) => f.label === 'Time left')!.value;
    expect(Number.parseFloat(t)).toBeCloseTo(14.3, 1);
    expect(buildScroll(8, c).headline).toBe('Inside Venus, you are in the Mercury sub-period until 2028-12-01.');
  });
  it('10 and 11: Jupiter exalted in Cancer, Saturn exalted in Libra', () => {
    expect(buildScroll(10, c).headline).toContain('exalted');
    expect(buildScroll(11, c).headline).toContain('exalted');
    expect(buildScroll(11, c).headline).toContain('1st house');
  });
  it('13 and 14: Atmakaraka is the highest degree among the seven grahas', () => {
    // degrees in sign: Sun 10, Moon 15, Mars 5, Mercury 0, Jupiter 10, Venus 10, Saturn 20 -> Saturn
    const s = buildScroll(13, c);
    expect(s.facts[0]!.value).toBe('Saturn');
    // Saturn 200 deg: Navamsa part floor(20/3.333)=6, Libra is air -> start Libra (6) + 6 = 12 -> Aries
    expect(buildScroll(14, c).headline).toContain('Aries');
  });
  it('15: Rahu in Gemini (8th from Libra), Ketu opposite in Sagittarius (2nd)', () => {
    const s = buildScroll(15, c);
    expect(s.facts[0]!.value).toBe('Gemini, house 9');
    expect(s.facts[1]!.value).toBe('Sagittarius, house 3');
  });
  it('16: Indu Lagna by the corrected formula (9th lords from Lagna and from the Moon)', () => {
    // Lagna Libra -> 9th sign Gemini -> Mercury 8; Moon Taurus -> 9th sign Capricorn -> Saturn 1; 9 kalas, remainder 9,
    // counted from the Moon (Taurus = 1): the 9th sign is Capricorn.
    const il = induLagna(6, 1);
    expect(il).toMatchObject({ kalas: 9, remainder: 9, lord9FromLagna: 'Mercury', lord9FromMoon: 'Saturn', signIndex: 9 });
    const s = buildScroll(16, c);
    expect(s.headline).toContain('Capricorn');
    expect(s.headline).toContain('4th house');
  });
  it('16: a remainder of zero counts as the 12th sign from the Moon', () => {
    // Sun 30 + Moon 16 = 46 -> 46 % 12 = 10 (not zero); pick Sun 30 + Mars 6 = 36 -> 0 -> 12
    // 9th lord Sun when the sign 8 after is Leo: lagna Aquarius (10) -> Libra? use direct search instead
    for (let l = 0; l < 12; l++) {
      for (let m = 0; m < 12; m++) {
        const r = induLagna(l, m);
        expect(r.remainder).toBeGreaterThanOrEqual(1);
        expect(r.remainder).toBeLessThanOrEqual(12);
        expect(r.signIndex).toBe((m + r.remainder - 1) % 12);
      }
    }
    const zero = (() => {
      for (let l = 0; l < 12; l++) for (let m = 0; m < 12; m++) if (induLagna(l, m).kalas % 12 === 0) return induLagna(l, m);
      return null;
    })();
    if (zero) expect(zero.remainder).toBe(12);
  });
  it('17: counts the elements of the seven grahas and the Ascendant, and says it is not about health', () => {
    const s = buildScroll(17, c);
    expect(s.facts.reduce((a, f) => a + Number(f.value), 0)).toBe(8);
    expect(s.headline).toContain('not a statement about health');
  });
  it('6: Libra is an air sign facing West (the "sign direction", not Digbala)', () => {
    const s = buildScroll(6, c);
    expect(s.headline).toBe('Libra is an air sign facing West, and a movable sign.');
    expect(JSON.stringify(s)).not.toMatch(/digbala/i);
  });
});

describe('without an exact birth time', () => {
  const moonChart = fixtureChart({ exactTime: false });
  it('uses the Moon sign as the stand-in Ascendant and says so on the scrolls that depend on houses', () => {
    expect(lagnaSignOf(moonChart)).toEqual({ signIndex: 1, moonChart: true });
    const s = buildScroll(1, moonChart);
    expect(s.badge).toBe('moon-chart');
    expect(s.headline).toContain('not exact');
    expect(s.headline).toContain('Taurus');
    expect(buildScroll(2, moonChart).badge).toBeNull(); // the Moon scroll does not depend on houses
  });
  it('the Navamsa Ascendant is left out rather than guessed', () => {
    const s = buildScroll(12, moonChart);
    expect(s.facts.some((f) => f.label === 'Ascendant in Navamsa')).toBe(false);
    expect(s.headline).toContain('needs an exact birth time');
  });
  it('houseOf counts whole signs from the lagna', () => {
    expect(houseOf(6, 6)).toBe(1);
    expect(houseOf(6, 5)).toBe(12);
    expect(houseOf(1, 4)).toBe(4);
  });
});
