import { describe, expect, it } from 'vitest';
import type { Planet } from '@aroha-astrology/shared';
import { explainArea, netEffect } from '../src/lib/intelligence/why.js';
import { houseFrom, type ChartContext } from '../src/lib/intelligence/chart-context.js';
import {
  baselineBirthTimeConfidence,
  levelFor,
} from '../src/lib/intelligence/birth-time-confidence.js';

/**
 * A hand-built chart so every expectation below can be checked by eye.
 * Ascendant Aries (0), Moon in Cancer (3). Whole-sign lords from Aries:
 * 1 Mars, 2 Venus, 3 Mercury, 4 Moon, 5 Sun, 6 Mercury, 7 Venus, 8 Mars,
 * 9 Jupiter, 10 Saturn, 11 Saturn, 12 Jupiter.
 */
const LORDS: Planet[] = [
  'Mars',
  'Venus',
  'Mercury',
  'Moon',
  'Sun',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Saturn',
  'Jupiter',
];

function makeCtx(overrides: Partial<ChartContext> = {}): ChartContext {
  const natal: ChartContext['natal'] = [
    { planet: 'Sun', signIndex: 9, house: 10, nakshatraIndex: 21 },
    { planet: 'Moon', signIndex: 3, house: 4, nakshatraIndex: 7 },
    { planet: 'Mars', signIndex: 0, house: 1, nakshatraIndex: 1 },
    { planet: 'Mercury', signIndex: 9, house: 10, nakshatraIndex: 22 },
    { planet: 'Jupiter', signIndex: 8, house: 9, nakshatraIndex: 19 },
    { planet: 'Venus', signIndex: 10, house: 11, nakshatraIndex: 23 },
    { planet: 'Saturn', signIndex: 5, house: 6, nakshatraIndex: 12 },
    { planet: 'Rahu', signIndex: 2, house: 3, nakshatraIndex: 6 },
    { planet: 'Ketu', signIndex: 8, house: 9, nakshatraIndex: 19 },
  ];
  return {
    asOf: '2026-09-24T06:30:00.000Z',
    birth: {
      placeName: 'Kolkata',
      lat: 22.57,
      lon: 88.36,
      timezone: 'Asia/Kolkata',
      timeAccuracy: 'exact',
      timeSource: 'birth_certificate',
    },
    calculation: {
      ayanamsa: 'lahiri',
      houseSystem: 'W',
      nodeType: 'mean',
      calculationVersion: '2026.08.1',
      calculatedAt: '2026-09-01T00:00:00.000Z',
    },
    ascendantSignIndex: 0,
    moonSignIndex: 3,
    moonNakshatraIndex: 7,
    natal,
    houseLords: Object.fromEntries(LORDS.map((p, i) => [i + 1, p])),
    dasha: {
      // Mercury rules the 3rd and 6th and sits in the 10th — tied to career.
      mahadasha: {
        planet: 'Mercury',
        startDate: '2020-01-01T00:00:00.000Z',
        endDate: '2037-01-01T00:00:00.000Z',
      },
      antardasha: {
        planet: 'Venus',
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2027-11-01T00:00:00.000Z',
      },
      pratyantardasha: null,
    },
    transits: [
      // Saturn in Pisces: 12th from the Aries Ascendant, 9th from the Cancer Moon.
      {
        planet: 'Saturn',
        signIndex: 11,
        sign: 'Pisces',
        nakshatraIndex: 25,
        isRetrograde: false,
        houseFromLagna: 12,
        houseFromMoon: 9,
      },
      // Jupiter in Gemini: 3rd from Lagna, 12th from Moon.
      {
        planet: 'Jupiter',
        signIndex: 2,
        sign: 'Gemini',
        nakshatraIndex: 6,
        isRetrograde: false,
        houseFromLagna: 3,
        houseFromMoon: 12,
      },
      // Rahu in Aquarius: 11th from Lagna, 8th from Moon.
      {
        planet: 'Rahu',
        signIndex: 10,
        sign: 'Aquarius',
        nakshatraIndex: 23,
        isRetrograde: true,
        houseFromLagna: 11,
        houseFromMoon: 8,
      },
      // Moon in Scorpio today: 5th from the natal Moon, star 16 (Vishakha → index 15? use 16).
      {
        planet: 'Moon',
        signIndex: 7,
        sign: 'Scorpio',
        nakshatraIndex: 16,
        isRetrograde: false,
        houseFromLagna: 8,
        houseFromMoon: 5,
      },
    ],
    ...overrides,
  };
}

describe('houseFrom', () => {
  it('counts signs inclusively, wrapping round the zodiac', () => {
    expect(houseFrom(0, 0)).toBe(1);
    expect(houseFrom(0, 9)).toBe(10);
    expect(houseFrom(3, 11)).toBe(9);
    expect(houseFrom(10, 1)).toBe(4);
  });
});

describe('explainArea', () => {
  it('leads with the dasha, and ties Mercury Mahadasha to career through the house it sits in', () => {
    const factors = explainArea('career', makeCtx());
    expect(factors[0]).toMatchObject({
      kind: 'dasha',
      level: 'mahadasha',
      planet: 'Mercury',
      textKey: 'why.dasha.mahadashaLinked',
      effect: 1,
    });
    // Its 'until' date comes from the running period.
    expect(factors[0]!.params).toMatchObject({ planet: 'Mercury', until: '2037-01-01' });
  });

  it('reads career transits from the Moon: Rahu in the 11th from Lagna, 8th from Moon, strains', () => {
    const factors = explainArea('career', makeCtx());
    const rahu = factors.find((f) => f.kind === 'transit' && f.planet === 'Rahu');
    expect(rahu).toMatchObject({ house: 8, effect: -1, textKey: 'why.transit' });
  });

  it('marks Jupiter in the 9th from the Moon as favourable for money and flags a retrograde transit', () => {
    const ctx = makeCtx({
      transits: [
        {
          planet: 'Jupiter',
          signIndex: 11,
          sign: 'Pisces',
          nakshatraIndex: 25,
          isRetrograde: true,
          houseFromLagna: 12,
          houseFromMoon: 9,
        },
      ],
    });
    const jupiter = explainArea('money', ctx).find(
      (f) => f.planet === 'Jupiter' && f.kind === 'transit',
    );
    expect(jupiter).toMatchObject({ effect: 1, textKey: 'why.transitRetro' });
  });

  it("describes the 10th lord's placement: Saturn (10th lord) in the 6th strains career", () => {
    const lordship = explainArea('career', makeCtx({ transits: [] })).find(
      (f) => f.kind === 'lordship',
    );
    expect(lordship).toMatchObject({ planet: 'Saturn', house: 10, effect: -1 });
    expect(lordship!.params).toMatchObject({ planet: 'Saturn', house: 10, placed: 6 });
  });

  it("adds the day's own Moon and tara for the overall reading only", () => {
    const overall = explainArea('overall', makeCtx());
    expect(overall.some((f) => f.textKey === 'why.moonToday')).toBe(true);
    const tara = overall.find((f) => f.textKey === 'why.tara');
    // (16 - 7) % 9 + 1 = 1 (Janma) — mixed, so neutral.
    expect(tara).toMatchObject({ kind: 'nakshatra', effect: 0, params: { tara: 1 } });
    expect(explainArea('career', makeCtx()).some((f) => f.textKey === 'why.moonToday')).toBe(false);
  });

  it('never returns more than five factors, and netEffect sums their direction', () => {
    const factors = explainArea('overall', makeCtx());
    expect(factors.length).toBeLessThanOrEqual(5);
    expect(netEffect(factors)).toBe(factors.reduce((s, f) => s + f.effect, 0));
  });

  it('is deterministic — the same chart gives the same explanation', () => {
    expect(explainArea('relationships', makeCtx())).toEqual(
      explainArea('relationships', makeCtx()),
    );
  });
});

describe('baselineBirthTimeConfidence', () => {
  it('ranks certificate > stated exact > approximate > part-of-day', () => {
    const pct = (accuracy: 'exact' | 'approximate' | 'unknown', source: string | null) =>
      baselineBirthTimeConfidence({
        timeOfBirth: '08:26',
        birthTimeAccuracy: accuracy,
        birthTimeSource: source,
      }).pct;
    expect(pct('exact', 'birth_certificate')).toBeGreaterThan(pct('exact', 'family_memory'));
    expect(pct('exact', 'family_memory')).toBeGreaterThan(pct('approximate', null));
    expect(pct('approximate', null)).toBeGreaterThan(pct('unknown', null));
  });

  it('reports 0 with no time at all, and levels by threshold', () => {
    expect(
      baselineBirthTimeConfidence({
        timeOfBirth: null,
        birthTimeAccuracy: null,
        birthTimeSource: null,
      }),
    ).toEqual({ pct: 0, level: 'low', basis: 'missing' });
    expect([levelFor(80), levelFor(60), levelFor(20)]).toEqual(['high', 'medium', 'low']);
  });
});
