import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  listBirthProfilesByOwner: () => Promise.resolve([]),
  findOwnedBirthProfile: () => Promise.resolve(undefined),
}));
vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: () => Promise.resolve(undefined),
}));
vi.mock('../src/modules/pass/pass.repo.js', () => ({
  findActivePass: () => Promise.resolve(null),
}));

import {
  bondMangal,
  bondPhase,
  bondSpec,
  communicationThemes,
  friendshipScore,
  periodTheme,
  relateMeters,
  sharedWindows,
  signRelation,
  type BondWindow,
} from '../src/modules/bonds/bonds.service.js';
import type { ChartContext } from '../src/lib/intelligence/chart-context.js';

const ARIES = 0;
const TAURUS = 1;
const GEMINI = 2;
const CANCER = 3;
const LEO = 4;
const LIBRA = 6;
const CAPRICORN = 9;

interface Sketch {
  asc?: number;
  moon?: number;
  /** Planet → sign index. */
  signs?: Record<string, number>;
  /** Planet → house it sits in. */
  houses?: Record<string, number>;
  /** House → the planet that rules it. */
  lords?: Record<number, string>;
  antardasha?: string;
  transits?: Array<{ planet: string; houseFromMoon: number }>;
}

/** Just enough of a chart for the rule under test. */
function chart(s: Sketch): ChartContext {
  const planets = new Set([...Object.keys(s.signs ?? {}), ...Object.keys(s.houses ?? {})]);
  return {
    ascendantSignIndex: s.asc ?? ARIES,
    moonSignIndex: s.moon ?? ARIES,
    moonNakshatraIndex: 0,
    natal: [...planets].map((planet) => ({
      planet,
      signIndex: s.signs?.[planet] ?? 0,
      house: s.houses?.[planet] ?? 1,
      nakshatraIndex: 0,
    })),
    houseLords: s.lords ?? {},
    dasha: {
      mahadasha: null,
      antardasha: s.antardasha ? { planet: s.antardasha, startDate: '', endDate: '' } : null,
      pratyantardasha: null,
    },
    transits: (s.transits ?? []).map((t) => ({
      ...t,
      signIndex: 0,
      sign: 'Aries',
      nakshatraIndex: 0,
      isRetrograde: false,
      houseFromLagna: 1,
    })),
  } as unknown as ChartContext;
}

describe('periodTheme', () => {
  it('speaks for the house holding the mulatrikona sign when a planet rules two', () => {
    // Aries rising: Venus rules the 2nd (Taurus) and the 7th (Libra, its mulatrikona).
    const venus = chart({ asc: ARIES, lords: { 2: 'Venus', 7: 'Venus' }, antardasha: 'Venus' });
    expect(periodTheme(venus)).toEqual({ planet: 'Venus', house: 7, theme: 'relationships' });
    // Aries rising: Saturn rules the 10th (Capricorn) and the 11th (Aquarius, its mulatrikona).
    const saturn = chart({
      asc: ARIES,
      lords: { 10: 'Saturn', 11: 'Saturn' },
      antardasha: 'Saturn',
    });
    expect(periodTheme(saturn)).toEqual({ planet: 'Saturn', house: 11, theme: 'gains' });
    // Libra rising: Venus rules the 1st (Libra) and the 8th (Taurus).
    const libra = chart({ asc: LIBRA, lords: { 1: 'Venus', 8: 'Venus' }, antardasha: 'Venus' });
    expect(periodTheme(libra)).toEqual({ planet: 'Venus', house: 1, theme: 'self' });
  });

  it('reads the one house the Sun or the Moon rules', () => {
    // Aries rising: Cancer is the 4th, Leo the 5th.
    expect(periodTheme(chart({ lords: { 4: 'Moon' }, antardasha: 'Moon' }))?.theme).toBe('home');
    expect(periodTheme(chart({ lords: { 5: 'Sun' }, antardasha: 'Sun' }))?.theme).toBe(
      'creativity',
    );
  });

  it('reads Rahu and Ketu from the house they sit in, since they rule none', () => {
    const rahu = chart({ houses: { Rahu: 10 }, antardasha: 'Rahu' });
    expect(periodTheme(rahu)).toEqual({ planet: 'Rahu', house: 10, theme: 'career' });
  });

  it('is null with no running sub-period', () => {
    expect(periodTheme(chart({}))).toBeNull();
  });
});

describe('bondPhase reads both charts', () => {
  const spouse = bondSpec('spouse', 'female', 'male');

  it("counts a slow planet in the other person's bond house, from their Moon", () => {
    const phase = bondPhase(
      chart({}),
      chart({ transits: [{ planet: 'Saturn', houseFromMoon: 7 }] }),
      spouse,
      'Priya',
    );
    expect(phase.tone).toBe('mixed');
    expect(phase.why).toContainEqual(
      expect.objectContaining({
        kind: 'transit',
        planet: 'Saturn',
        house: 7,
        effect: -1,
        textKey: 'bonds.why.theirTransit',
        params: expect.objectContaining({ name: 'Priya' }),
      }),
    );
  });

  it('is a testing stretch when both charts are strained', () => {
    const saturn7 = { transits: [{ planet: 'Saturn', houseFromMoon: 7 }] };
    expect(bondPhase(chart(saturn7), chart(saturn7), spouse, 'Priya').tone).toBe('testing');
  });

  it("counts Jupiter in the other person's bond house as support", () => {
    const jupiter7 = { transits: [{ planet: 'Jupiter', houseFromMoon: 7 }] };
    const phase = bondPhase(chart(jupiter7), chart(jupiter7), spouse, 'Priya');
    // 2 from each side.
    expect(phase.tone).toBe('active');
  });

  it('counts Rahu and Ketu once when the bond is read from two opposite houses', () => {
    // A travel buddy is read from the 9th and the 3rd; the nodes always sit opposite.
    const spec = bondSpec('travel_buddy', null, null);
    expect(spec.houses).toEqual([9, 3]);
    const nodes = {
      transits: [
        { planet: 'Rahu', houseFromMoon: 9 },
        { planet: 'Ketu', houseFromMoon: 3 },
      ],
    };
    const phase = bondPhase(chart(nodes), chart({}), spec, 'Asha');
    expect(phase.tone).toBe('mixed');
    expect(phase.why.filter((w) => w.kind === 'transit')).toHaveLength(1);
  });

  it("gives each person's period theme", () => {
    const me = chart({ lords: { 2: 'Venus', 7: 'Venus' }, antardasha: 'Venus' });
    const them = chart({ lords: { 10: 'Saturn', 11: 'Saturn' }, antardasha: 'Saturn' });
    const phase = bondPhase(me, them, spouse, 'Priya');
    expect(phase.themes[0]?.theme).toBe('relationships');
    expect(phase.themes[1]?.theme).toBe('gains');
    expect(phase.lords).toEqual(['Venus', 'Saturn']);
  });
});

describe('sharedWindows', () => {
  const w = (
    who: 'you' | 'them',
    start: string,
    end: string,
    tone: 'good' | 'care',
  ): BondWindow => ({
    who,
    start,
    end,
    tone,
    lords: ['Jupiter', 'Venus'],
    why: [],
  });

  it('finds the overlap of two windows with the same tone', () => {
    expect(
      sharedWindows(
        [w('you', '2027-01-01', '2027-06-30', 'good')],
        [w('them', '2027-04-01', '2027-12-31', 'good')],
      ),
    ).toEqual([{ start: '2027-04-01', end: '2027-06-30', tone: 'good' }]);
  });

  it('ignores different tones, no overlap, and an overlap under two weeks', () => {
    const mine = [w('you', '2027-01-01', '2027-06-30', 'good')];
    expect(sharedWindows(mine, [w('them', '2027-04-01', '2027-12-31', 'care')])).toEqual([]);
    expect(sharedWindows(mine, [w('them', '2027-07-01', '2027-12-31', 'good')])).toEqual([]);
    expect(sharedWindows(mine, [w('them', '2027-06-20', '2027-12-31', 'good')])).toEqual([]);
  });
});

describe('signRelation', () => {
  it('follows the count from one sign to the other', () => {
    const from = (n: number) => signRelation(ARIES, (ARIES + n - 1) % 12);
    expect([1, 5, 9].map(from)).toEqual(['alike', 'alike', 'alike']);
    expect([3, 7, 11].map(from)).toEqual(['complement', 'complement', 'complement']);
    // 6 and 8 apart (shadashtaka) is the hard pairing.
    expect([6, 8].map(from)).toEqual(['friction', 'friction']);
    expect([2, 12, 4, 10].map(from)).toEqual(['different', 'different', 'different', 'different']);
  });

  it('reads the same both ways round', () => {
    for (let a = 0; a < 12; a++) {
      for (let b = 0; b < 12; b++) expect(signRelation(a, b)).toBe(signRelation(b, a));
    }
  });

  it('drives the "how you talk" line', () => {
    const line = (theirMercury: number) =>
      communicationThemes(
        chart({ signs: { Mercury: ARIES } }),
        chart({ signs: { Mercury: theirMercury } }),
        false,
        'Ravi',
      ).find((f) => f.planet === 'Mercury')?.textKey;
    expect(line(LEO)).toBe('bonds.comm.mercuryAlike');
    expect(line(GEMINI)).toBe('bonds.comm.mercuryComplement');
    expect(line(5)).toBe('bonds.comm.mercuryFriction'); // Virgo, 6th from Aries
    expect(line(CANCER)).toBe('bonds.comm.mercuryDifferent'); // 4th from Aries
  });
});

describe('friendshipScore', () => {
  it('reads natural friendship both ways and averages it', () => {
    expect(friendshipScore('Sun', 'Moon')).toBe(100); // friends both ways
    expect(friendshipScore('Sun', 'Saturn')).toBe(20); // enemies both ways
    expect(friendshipScore('Sun', 'Mercury')).toBe(80); // neutral one way, friend the other
    expect(friendshipScore('Mars', 'Mercury')).toBe(40); // enemy one way, neutral the other
    expect(friendshipScore('Jupiter', 'Jupiter')).toBe(100);
    expect(friendshipScore('Venus', 'Moon')).toBe(friendshipScore('Moon', 'Venus'));
  });
});

describe('relateMeters', () => {
  const kootas = [
    { koota: 'GrahaMaitri', score: 5, max: 5 },
    { koota: 'Bhakoot', score: 7, max: 7 },
    { koota: 'Yoni', score: 2, max: 4 },
    { koota: 'Tara', score: 1.5, max: 3 },
  ];
  const me = chart({
    moon: ARIES,
    signs: { Mercury: ARIES, Venus: TAURUS, Mars: LEO, Sun: ARIES },
    lords: { 10: 'Saturn' },
  });
  const them = chart({
    moon: LEO,
    signs: { Mercury: LEO, Venus: CANCER, Mars: CAPRICORN, Sun: LEO },
    lords: { 10: 'Sun' },
  });

  it('gives a romantic bond Emotion, Communication and Spark, worked out by hand', () => {
    const meters = relateMeters(me, them, 'romantic', kootas);
    expect(meters.map((m) => m.key)).toEqual(['emotion', 'communication', 'spark']);

    // Emotion: Graha Maitri 100 x 0.4 + Bhakoot 100 x 0.3 + both Moons in fire 100 x 0.3.
    expect(meters[0]).toMatchObject({ score: 100, level: 'high' });
    // Communication: Mercury in Aries and Leo, a trine (90 x 0.7); their lords Mars
    // and the Sun are friends both ways (100 x 0.3) = 93.
    expect(meters[1]).toMatchObject({ score: 93, level: 'high' });
    // Spark: Yoni 2 of 4 (50 x 0.4 = 20)
    //   + my Venus (earth) with their Mars (earth): 100 x 0.2 = 20
    //   + my Mars (fire) with their Venus (water): 40 x 0.2 = 8
    //   + Venus in Taurus and Cancer, 3 apart (75 x 0.7), lords Venus and Moon
    //     (enemy one way, neutral the other = 40 x 0.3) = 64.5 x 0.2 = 12.9
    //   = 60.9
    expect(meters[2]).toMatchObject({ score: 61, level: 'mid' });
    expect(meters[2]!.parts.map((p) => p.part)).toEqual([
      'yoni',
      'venusMars',
      'marsVenus',
      'venus',
    ]);
    expect(meters[2]!.parts.reduce((sum, p) => sum + p.weight, 0)).toBeCloseTo(1);
  });

  it('gives a work bond Workflow in place of Spark', () => {
    const meters = relateMeters(me, them, 'professional', kootas);
    expect(meters.map((m) => m.key)).toEqual(['emotion', 'communication', 'workflow']);
    // Sun in Aries and Leo with friendly lords: 93 x 0.4 = 37.2
    //   + 10th lords Saturn and the Sun, enemies both ways: 20 x 0.3 = 6
    //   + Mercury 93 x 0.3 = 27.9   = 71.1
    expect(meters[2]).toMatchObject({ score: 71, level: 'high' });
  });

  it('shares the weight out when a part cannot be read', () => {
    const noLords = chart({ moon: LEO, signs: { Mercury: LEO, Sun: LEO } });
    const workflow = relateMeters(me, noLords, 'professional', kootas)[2]!;
    expect(workflow.parts.map((p) => p.part)).toEqual(['sun', 'mercury']);
    expect(workflow.parts.map((p) => p.weight)).toEqual([0.57, 0.43]);
    // Both remaining parts are 93.
    expect(workflow.score).toBe(93);
  });

  it('picks the third meter by group, and gives an unsorted bond only two', () => {
    const third = (c: Parameters<typeof relateMeters>[2]) =>
      relateMeters(me, them, c, kootas)[2]?.key;
    expect(third('social')).toBe('vibe');
    expect(third('family')).toBe('foundation');
    expect(third('other')).toBeUndefined();
  });

  it('marks a low score low', () => {
    const cold = [
      { koota: 'GrahaMaitri', score: 0, max: 5 },
      { koota: 'Bhakoot', score: 0, max: 7 },
    ];
    // Aries (fire) and Cancer (water): 40 x 0.3 = 12, the rest 0.
    const emotion = relateMeters(
      chart({ moon: ARIES }),
      chart({ moon: CANCER }),
      'other',
      cold,
    )[0]!;
    expect(emotion).toMatchObject({ key: 'emotion', score: 12, level: 'low' });
  });

  it('keeps every meter between 0 and 100', () => {
    for (const c of ['romantic', 'professional', 'family', 'social', 'other'] as const) {
      for (const m of relateMeters(me, them, c, kootas)) {
        expect(m.score).toBeGreaterThanOrEqual(0);
        expect(m.score).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('bondMangal', () => {
  const p = (planet: string, sign: string, signIndex: number) => ({ planet, sign, signIndex });
  // Aries rising, Mars in Cancer: the 4th from the Ascendant, nothing cancels it.
  const inForce = {
    ascendant: { signIndex: ARIES },
    planets: [
      p('Mars', 'Cancer', CANCER),
      p('Moon', 'Gemini', GEMINI),
      p('Venus', 'Taurus', TAURUS),
      p('Jupiter', 'Taurus', TAURUS),
    ],
  };
  // Aries rising, Mars in Aries: the 1st house, cancelled because Mars is in its own sign.
  const cancelled = {
    ascendant: { signIndex: ARIES },
    planets: [
      p('Mars', 'Aries', ARIES),
      p('Moon', 'Gemini', GEMINI),
      p('Venus', 'Taurus', TAURUS),
      p('Jupiter', 'Taurus', TAURUS),
    ],
  };
  // Mars in Gemini: 3rd from the Ascendant and Venus, 11th from the Moon.
  const none = {
    ascendant: { signIndex: ARIES },
    planets: [
      p('Mars', 'Gemini', GEMINI),
      p('Moon', 'Leo', LEO),
      p('Venus', 'Aries', ARIES),
      p('Jupiter', 'Taurus', TAURUS),
    ],
  };

  it('says who has it in force', () => {
    expect(bondMangal(inForce, none)).toEqual({ you: true, them: false, status: 'oneSided' });
    expect(bondMangal(none, inForce)).toEqual({ you: false, them: true, status: 'oneSided' });
    expect(bondMangal(inForce, inForce)).toEqual({ you: true, them: true, status: 'both' });
    expect(bondMangal(none, none)).toEqual({ you: false, them: false, status: 'neither' });
  });

  it('does not count a cancelled dosha', () => {
    expect(bondMangal(cancelled, none)).toEqual({ you: false, them: false, status: 'neither' });
    expect(bondMangal(cancelled, inForce)).toEqual({ you: false, them: true, status: 'oneSided' });
  });

  it('is null when a chart is missing', () => {
    expect(bondMangal(null, none)).toBeNull();
  });
});
