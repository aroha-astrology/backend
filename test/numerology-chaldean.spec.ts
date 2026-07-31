import { describe, it, expect } from 'vitest';
import {
  CHALDEAN_MAP,
  NUMBER_RULER,
  reduceToSingleDigit,
  moolank,
  bhagyank,
  namank,
  dayVibration,
  dailyNumerology,
  buildChaldeanProfile,
} from '../src/lib/astro-engine/numerology/chaldean.js';

describe('CHALDEAN_MAP', () => {
  it('matches the published Chaldean letter groupings exactly', () => {
    expect(CHALDEAN_MAP.A).toBe(1);
    expect(CHALDEAN_MAP.I).toBe(1);
    expect(CHALDEAN_MAP.J).toBe(1);
    expect(CHALDEAN_MAP.Q).toBe(1);
    expect(CHALDEAN_MAP.Y).toBe(1);
    expect(CHALDEAN_MAP.B).toBe(2);
    expect(CHALDEAN_MAP.K).toBe(2);
    expect(CHALDEAN_MAP.R).toBe(2);
    expect(CHALDEAN_MAP.C).toBe(3);
    expect(CHALDEAN_MAP.G).toBe(3);
    expect(CHALDEAN_MAP.L).toBe(3);
    expect(CHALDEAN_MAP.S).toBe(3);
    expect(CHALDEAN_MAP.D).toBe(4);
    expect(CHALDEAN_MAP.M).toBe(4);
    expect(CHALDEAN_MAP.T).toBe(4);
    expect(CHALDEAN_MAP.E).toBe(5);
    expect(CHALDEAN_MAP.H).toBe(5);
    expect(CHALDEAN_MAP.N).toBe(5);
    expect(CHALDEAN_MAP.X).toBe(5);
    expect(CHALDEAN_MAP.U).toBe(6);
    expect(CHALDEAN_MAP.V).toBe(6);
    expect(CHALDEAN_MAP.W).toBe(6);
    expect(CHALDEAN_MAP.O).toBe(7);
    expect(CHALDEAN_MAP.Z).toBe(7);
    expect(CHALDEAN_MAP.P).toBe(8);
    expect(CHALDEAN_MAP.F).toBe(8);
  });

  it('never assigns 9 to any letter -- 9 is sacred, only reachable via reduction', () => {
    expect(Object.values(CHALDEAN_MAP)).not.toContain(9);
  });

  it('covers all 26 letters exactly once', () => {
    const letters = Object.keys(CHALDEAN_MAP).sort();
    expect(letters).toEqual('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').sort());
  });
});

describe('reduceToSingleDigit', () => {
  it('leaves single digits 1-9 unchanged', () => {
    for (let n = 1; n <= 9; n++) expect(reduceToSingleDigit(n)).toBe(n);
  });

  it('sums digits repeatedly until a single digit remains', () => {
    expect(reduceToSingleDigit(29)).toBe(2); // 2+9=11 -> 1+1=2
    expect(reduceToSingleDigit(18)).toBe(9); // 1+8=9
    expect(reduceToSingleDigit(33)).toBe(6); // 3+3=6
  });
});

describe('moolank', () => {
  it('reduces the day of birth alone', () => {
    expect(moolank('1985-03-12')).toBe(3); // day 12 -> 1+2=3
    expect(moolank('1990-08-15')).toBe(6); // day 15 -> 1+5=6
  });

  it('reduces a single-digit day unchanged', () => {
    expect(moolank('2000-01-05')).toBe(5);
  });
});

describe('bhagyank', () => {
  it('sums every digit of day+month+year, then reduces', () => {
    // 1985-03-12: digits of "12" + "3" + "1985" = 1,2,3,1,9,8,5 = 29 -> 2+9=11 -> 2
    expect(bhagyank('1985-03-12')).toBe(2);
    // 1990-08-15: digits of "15" + "8" + "1990" = 1,5,8,1,9,9,0 = 33 -> 6
    expect(bhagyank('1990-08-15')).toBe(6);
  });

  it('is generally different from moolank for the same date (distinct systems)', () => {
    expect(moolank('1985-03-12')).not.toBe(bhagyank('1985-03-12'));
  });
});

describe('namank', () => {
  it('sums Chaldean letter values, returning both compound and reduced', () => {
    // J=1, O=7, H=5, N=5 -> 18 -> 9
    const result = namank('JOHN');
    expect(result.compound).toBe(18);
    expect(result.reduced).toBe(9);
  });

  it('is case-insensitive', () => {
    expect(namank('john')).toEqual(namank('JOHN'));
  });

  it('ignores spaces and non-letter characters', () => {
    expect(namank('John Doe')).toEqual(namank('JohnDoe'));
    expect(namank("O'Brien")).toEqual(namank('OBrien'));
  });

  it('strips non-Latin script entirely rather than guessing a mapping', () => {
    const result = namank('अनन्या');
    expect(result.compound).toBe(0);
    expect(result.reduced).toBe(9); // reduceToSingleDigit(0) -> 9
  });
});

describe('NUMBER_RULER', () => {
  it('maps every number 1-9 to a distinct planet', () => {
    const planets = Object.values(NUMBER_RULER);
    expect(planets).toHaveLength(9);
    expect(new Set(planets).size).toBe(9);
  });

  it('matches the audit-specified ruler assignments', () => {
    expect(NUMBER_RULER[1]).toBe('Sun');
    expect(NUMBER_RULER[2]).toBe('Moon');
    expect(NUMBER_RULER[3]).toBe('Jupiter');
    expect(NUMBER_RULER[4]).toBe('Rahu');
    expect(NUMBER_RULER[5]).toBe('Mercury');
    expect(NUMBER_RULER[6]).toBe('Venus');
    expect(NUMBER_RULER[7]).toBe('Ketu');
    expect(NUMBER_RULER[8]).toBe('Saturn');
    expect(NUMBER_RULER[9]).toBe('Mars');
  });
});

describe('dayVibration', () => {
  it('is favorable when the day ruler equals the Moolank ruler', () => {
    const result = dayVibration(new Date('2026-08-01T00:00:00Z'), 1); // day 1 -> Sun; moolank 1 -> Sun
    expect(result.dayRuler).toBe('Sun');
    expect(result.moolankRuler).toBe('Sun');
    expect(result.compatibility).toBe('favorable');
  });

  it('is favorable when the day ruler is a natural friend of the Moolank ruler', () => {
    // Day 2 -> Moon. Moolank 1 -> Sun. Sun and Moon are natural friends.
    const result = dayVibration(new Date('2026-08-02T00:00:00Z'), 1);
    expect(result.dayRuler).toBe('Moon');
    expect(result.compatibility).toBe('favorable');
  });

  it('is challenging when the day ruler is a natural enemy of the Moolank ruler', () => {
    // Day 6 -> Venus. Moolank 1 -> Sun. Venus is Sun's enemy.
    const result = dayVibration(new Date('2026-08-06T00:00:00Z'), 1);
    expect(result.dayRuler).toBe('Venus');
    expect(result.compatibility).toBe('challenging');
  });

  it('varies the dayNumber genuinely day to day, unlike the retired implementations', () => {
    const day1 = dayVibration(new Date('2026-08-01T00:00:00Z'), 5);
    const day2 = dayVibration(new Date('2026-08-02T00:00:00Z'), 5);
    expect(day1.dayNumber).not.toBe(day2.dayNumber);
  });
});

describe('dailyNumerology', () => {
  it('produces a luckyNumber equal to the day number and a color from the day ruler', () => {
    const result = dailyNumerology(new Date('2026-08-01T00:00:00Z'), 3);
    expect(result.luckyNumber).toBe(1);
    expect(result.luckyColor).toBe('Gold'); // Sun's color
  });

  it("changes across consecutive days for the SAME user's Moolank -- the exact bug being fixed", () => {
    const moolankValue = 4;
    const day1 = dailyNumerology(new Date('2026-08-01T00:00:00Z'), moolankValue);
    const day2 = dailyNumerology(new Date('2026-08-02T00:00:00Z'), moolankValue);
    expect(day1.luckyNumber).not.toBe(day2.luckyNumber);
  });
});

describe('buildChaldeanProfile', () => {
  it('assembles moolank/bhagyank/namank with their planetary rulers', () => {
    const profile = buildChaldeanProfile('1985-03-12', 'JOHN');
    expect(profile.moolank).toBe(3);
    expect(profile.moolankRuler).toBe('Jupiter');
    expect(profile.bhagyank).toBe(2);
    expect(profile.bhagyankRuler).toBe('Moon');
    expect(profile.namank.compound).toBe(18);
    expect(profile.namank.reduced).toBe(9);
    expect(profile.namankRuler).toBe('Mars');
  });
});
