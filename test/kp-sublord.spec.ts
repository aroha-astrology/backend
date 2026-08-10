import { describe, it, expect } from 'vitest';
import {
  kpLordsFor,
  kpLordsForPlanets,
  cuspalSubLords,
} from '../src/lib/astro-engine/calculations/kp-sublord.js';

describe('kpLordsFor: star lord', () => {
  it('matches the nakshatra lord sequence, which starts Ketu-Venus-Sun', () => {
    // Ashwini 0-13.33 -> Ketu; Bharani 13.33-26.67 -> Venus; Krittika -> Sun.
    expect(kpLordsFor(1).starLord).toBe('Ketu');
    expect(kpLordsFor(15).starLord).toBe('Venus');
    expect(kpLordsFor(28).starLord).toBe('Sun');
  });

  it('repeats the 9-lord cycle every 9 nakshatras', () => {
    // Nakshatra 0 and nakshatra 9 (Magha) share Ketu as star lord.
    expect(kpLordsFor(0.5).starLord).toBe('Ketu');
    expect(kpLordsFor(9 * (360 / 27) + 0.5).starLord).toBe('Ketu');
  });
});

describe('kpLordsFor: sub lord', () => {
  it('starts each nakshatra with its own lord as the first sub', () => {
    // The sub sequence begins AT the star lord, so the very start of Ashwini
    // is Ketu star / Ketu sub.
    const k = kpLordsFor(0.01);
    expect(k.starLord).toBe('Ketu');
    expect(k.subLord).toBe('Ketu');
  });

  it("sizes Ketu's sub in proportion to its 7/120 Vimshottari share", () => {
    // 7/120 of 13.3333 deg = 0.7778 deg. Just inside is still Ketu; just past
    // it must have moved on to Venus, the next lord in sequence.
    expect(kpLordsFor(0.77).subLord).toBe('Ketu');
    expect(kpLordsFor(0.79).subLord).toBe('Venus');
  });

  it('gives Venus the widest sub, matching its 20/120 share', () => {
    // Venus sub in Ashwini spans 0.7778 -> 0.7778 + 2.2222 = 3.0 deg.
    expect(kpLordsFor(1.5).subLord).toBe('Venus');
    expect(kpLordsFor(2.99).subLord).toBe('Venus');
    expect(kpLordsFor(3.01).subLord).toBe('Sun');
  });

  it('ends every nakshatra on the lord preceding the star lord in sequence', () => {
    // Ashwini is Ketu-starred; the cycle Ketu..Mercury ends on Mercury.
    expect(kpLordsFor(13.3).subLord).toBe('Mercury');
  });

  it('never returns an empty or unknown lord anywhere in the zodiac', () => {
    const valid = new Set([
      'Ketu',
      'Venus',
      'Sun',
      'Moon',
      'Mars',
      'Rahu',
      'Jupiter',
      'Saturn',
      'Mercury',
    ]);
    for (let deg = 0; deg < 360; deg += 0.37) {
      const k = kpLordsFor(deg);
      expect(valid.has(k.starLord), `star @${deg}`).toBe(true);
      expect(valid.has(k.subLord), `sub @${deg}`).toBe(true);
      expect(valid.has(k.subSubLord), `subsub @${deg}`).toBe(true);
    }
  });
});

describe('kpLordsFor: sub-sub lord', () => {
  it('starts each sub with that sub lord as its own first sub-sub', () => {
    const k = kpLordsFor(0.01);
    expect(k.subLord).toBe('Ketu');
    expect(k.subSubLord).toBe('Ketu');
  });

  it('subdivides within the sub, changing faster than the sub does', () => {
    // Across Venus's sub (0.78 -> 3.0), the sub stays Venus while the sub-sub
    // must move through more than one lord.
    // Stop short of the 3.0 boundary: stepping by 0.05 accumulates float error
    // and would otherwise land just past it, where the sub is legitimately Sun.
    const seen = new Set<string>();
    for (let d = 0.8; d < 2.95; d += 0.05) {
      const k = kpLordsFor(d);
      expect(k.subLord, `sub @${d}`).toBe('Venus');
      seen.add(k.subSubLord);
    }
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('kp helpers', () => {
  it('normalises longitudes outside 0-360', () => {
    expect(kpLordsFor(360.5)).toEqual(kpLordsFor(0.5));
    expect(kpLordsFor(-359.5)).toEqual(kpLordsFor(0.5));
  });

  it('skips planets with an unusable longitude rather than guessing', () => {
    const out = kpLordsForPlanets([{ planet: 'Sun', longitude: 100 }, { planet: 'Rahu' }]);
    expect(out).toHaveLength(1);
    expect(out[0]!.planet).toBe('Sun');
  });

  it('returns one entry per cusp, capped at 12', () => {
    const cusps = Array.from({ length: 14 }, (_, i) => i * 30);
    const out = cuspalSubLords(cusps);
    expect(out).toHaveLength(12);
    expect(out[0]!.house).toBe(1);
    expect(out[11]!.house).toBe(12);
  });
});
