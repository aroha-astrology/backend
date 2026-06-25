import { describe, it, expect } from 'vitest';
import type { ChartData } from '@aroha-astrology/shared';
import {
  GEMSTONES,
  METALS,
  computeGemstoneScores,
  computeGemstoneScoresWithDignity,
  computeMetalScoresWithDignity,
  describeNumbers,
  describeColors,
  describeDays,
  describeDirections,
  describeMetal,
} from '@/lib/ai/luckyFactors';

// Minimal ChartData fixture: Aries ascendant, 9 planets placed sensibly.
const ARIES_CHART: ChartData = {
  ascendant: { sign: 'Aries', signIndex: 0, degree: 5, nakshatra: 'Ashwini', nakshatraPada: 1 },
  ayanamsa: 'lahiri',
  ayanamsaValue: 24.1,
  julianDay: 2451545,
  planets: [
    { planet: 'Sun',     longitude: 10,  latitude: 0, speed: 1,    sign: 'Aries',       signIndex: 0, signDegree: 10, nakshatra: 'Ashwini',  nakshatraIndex: 0, nakshatraPada: 3, nakshatraLord: 'Ketu',    isRetrograde: false, house: 1  },
    { planet: 'Moon',    longitude: 40,  latitude: 0, speed: 13,   sign: 'Taurus',      signIndex: 1, signDegree: 10, nakshatra: 'Rohini',   nakshatraIndex: 3, nakshatraPada: 1, nakshatraLord: 'Moon',    isRetrograde: false, house: 2  },
    { planet: 'Mars',    longitude: 10,  latitude: 0, speed: 0.5,  sign: 'Aries',       signIndex: 0, signDegree: 10, nakshatra: 'Ashwini',  nakshatraIndex: 0, nakshatraPada: 3, nakshatraLord: 'Ketu',    isRetrograde: false, house: 1  },
    { planet: 'Mercury', longitude: 170, latitude: 0, speed: 1.5,  sign: 'Virgo',       signIndex: 5, signDegree: 20, nakshatra: 'Hasta',    nakshatraIndex: 12, nakshatraPada: 3, nakshatraLord: 'Moon',   isRetrograde: false, house: 6  },
    { planet: 'Jupiter', longitude: 100, latitude: 0, speed: 0.1,  sign: 'Cancer',      signIndex: 3, signDegree: 10, nakshatra: 'Pushya',   nakshatraIndex: 7, nakshatraPada: 2, nakshatraLord: 'Saturn',  isRetrograde: false, house: 4  },
    { planet: 'Venus',   longitude: 340, latitude: 0, speed: 1.2,  sign: 'Pisces',      signIndex: 11, signDegree: 10, nakshatra: 'Revati',  nakshatraIndex: 26, nakshatraPada: 3, nakshatraLord: 'Mercury', isRetrograde: false, house: 12 },
    { planet: 'Saturn',  longitude: 190, latitude: 0, speed: 0.05, sign: 'Libra',       signIndex: 6, signDegree: 10, nakshatra: 'Swati',    nakshatraIndex: 14, nakshatraPada: 2, nakshatraLord: 'Rahu',    isRetrograde: false, house: 7  },
    { planet: 'Rahu',    longitude: 70,  latitude: 0, speed: -0.05, sign: 'Gemini',     signIndex: 2, signDegree: 10, nakshatra: 'Ardra',    nakshatraIndex: 5, nakshatraPada: 1, nakshatraLord: 'Rahu',    isRetrograde: true,  house: 3  },
    { planet: 'Ketu',    longitude: 250, latitude: 0, speed: -0.05, sign: 'Sagittarius', signIndex: 8, signDegree: 10, nakshatra: 'Moola',   nakshatraIndex: 18, nakshatraPada: 3, nakshatraLord: 'Ketu',   isRetrograde: true,  house: 9  },
  ],
  houses: Array.from({ length: 12 }, (_, i) => ({
    house: i + 1,
    cusp: i * 30,
    sign: (['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'] as const)[i],
    signIndex: i,
    lord: (['Mars','Venus','Mercury','Moon','Sun','Mercury','Venus','Mars','Jupiter','Saturn','Saturn','Jupiter'] as const)[i],
    planets: [],
  })),
};

// ─────────────────────────────────────────────
// GEMSTONES constant
// ─────────────────────────────────────────────

describe('GEMSTONES constant', () => {
  it('has entries for all 9 planets', () => {
    const planets = ['Sun','Moon','Mars','Mercury','Jupiter','Venus','Saturn','Rahu','Ketu'];
    for (const p of planets) {
      expect(GEMSTONES[p as keyof typeof GEMSTONES]).toBeDefined();
    }
  });

  it('each entry has required fields', () => {
    for (const entry of Object.values(GEMSTONES)) {
      expect(typeof entry.englishName).toBe('string');
      expect(typeof entry.stone).toBe('string');
      expect(typeof entry.finger).toBe('string');
      expect(typeof entry.metal).toBe('string');
      expect(typeof entry.day).toBe('string');
      expect(Array.isArray(entry.benefits)).toBe(true);
      expect(entry.benefits.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────
// METALS constant
// ─────────────────────────────────────────────

describe('METALS constant', () => {
  it('has entries for all 9 planets', () => {
    const planets = ['Sun','Moon','Mars','Mercury','Jupiter','Venus','Saturn','Rahu','Ketu'];
    for (const p of planets) {
      expect(METALS[p as keyof typeof METALS]).toBeDefined();
    }
  });
});

// ─────────────────────────────────────────────
// computeGemstoneScores
// ─────────────────────────────────────────────

describe('computeGemstoneScores', () => {
  it('returns 9 entries for a full chart', () => {
    const scores = computeGemstoneScores(ARIES_CHART);
    expect(scores).toHaveLength(9);
  });

  it('all scores are in [5, 99]', () => {
    for (const s of computeGemstoneScores(ARIES_CHART)) {
      expect(s.score).toBeGreaterThanOrEqual(5);
      expect(s.score).toBeLessThanOrEqual(99);
    }
  });

  it('results are sorted descending by score', () => {
    const scores = computeGemstoneScores(ARIES_CHART);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i - 1].score).toBeGreaterThanOrEqual(scores[i].score);
    }
  });

  it('each entry has a stone reference', () => {
    for (const s of computeGemstoneScores(ARIES_CHART)) {
      expect(s.stone).toBeDefined();
      expect(typeof s.stone.englishName).toBe('string');
    }
  });

  it('recommended flag is only set when score >= 70', () => {
    for (const s of computeGemstoneScores(ARIES_CHART)) {
      if (s.recommended) expect(s.score).toBeGreaterThanOrEqual(70);
    }
  });
});

// ─────────────────────────────────────────────
// computeGemstoneScoresWithDignity
// ─────────────────────────────────────────────

describe('computeGemstoneScoresWithDignity', () => {
  it('exalted planet raises score vs no dignity', () => {
    const baseScores = computeGemstoneScoresWithDignity(ARIES_CHART, {});
    const exaltedScores = computeGemstoneScoresWithDignity(ARIES_CHART, { Sun: 'Exalted' });
    const baseSun = baseScores.find((s) => s.planet === 'Sun')!;
    const exaltedSun = exaltedScores.find((s) => s.planet === 'Sun')!;
    expect(exaltedSun.score).toBeGreaterThan(baseSun.score);
  });

  it('debilitated planet lowers score vs no dignity', () => {
    const baseScores = computeGemstoneScoresWithDignity(ARIES_CHART, {});
    const debilScores = computeGemstoneScoresWithDignity(ARIES_CHART, { Sun: 'Debilitated' });
    const baseSun = baseScores.find((s) => s.planet === 'Sun')!;
    const debilSun = debilScores.find((s) => s.planet === 'Sun')!;
    expect(debilSun.score).toBeLessThan(baseSun.score);
  });

  it('returns 9 entries', () => {
    const scores = computeGemstoneScoresWithDignity(ARIES_CHART, {});
    expect(scores).toHaveLength(9);
  });

  it('all scores clamped to [5, 99]', () => {
    const scores = computeGemstoneScoresWithDignity(ARIES_CHART, {
      Sun: 'Exalted', Moon: 'Debilitated', Mars: 'Exalted', Jupiter: 'Exalted',
    });
    for (const s of scores) {
      expect(s.score).toBeGreaterThanOrEqual(5);
      expect(s.score).toBeLessThanOrEqual(99);
    }
  });
});

// ─────────────────────────────────────────────
// computeMetalScoresWithDignity
// ─────────────────────────────────────────────

describe('computeMetalScoresWithDignity', () => {
  it('returns 9 entries', () => {
    const scores = computeMetalScoresWithDignity(ARIES_CHART, {});
    expect(scores).toHaveLength(9);
  });

  it('all scores in [5, 99]', () => {
    for (const s of computeMetalScoresWithDignity(ARIES_CHART, {})) {
      expect(s.score).toBeGreaterThanOrEqual(5);
      expect(s.score).toBeLessThanOrEqual(99);
    }
  });

  it('each entry has a metal name', () => {
    for (const s of computeMetalScoresWithDignity(ARIES_CHART, {})) {
      expect(typeof s.metal.metal).toBe('string');
    }
  });
});

// ─────────────────────────────────────────────
// describeNumbers
// ─────────────────────────────────────────────

describe('describeNumbers', () => {
  it('returns a FactorDetail with title and intro', () => {
    const d = describeNumbers([1, 5, 9]);
    expect(d.title).toBe('Why these numbers');
    expect(typeof d.intro).toBe('string');
    expect(d.intro.length).toBeGreaterThan(0);
  });

  it('benefits list includes each input number', () => {
    const d = describeNumbers([3, 7]);
    expect(d.benefits.some((b) => b.startsWith('3'))).toBe(true);
    expect(d.benefits.some((b) => b.startsWith('7'))).toBe(true);
  });

  it('handles large numbers by wrapping (10 → same ruler as 1)', () => {
    const d = describeNumbers([10]);
    expect(d.benefits.some((b) => b.includes('10'))).toBe(true);
  });

  it('includes a notes field', () => {
    const d = describeNumbers([1]);
    expect(typeof d.notes).toBe('string');
  });
});

// ─────────────────────────────────────────────
// describeColors
// ─────────────────────────────────────────────

describe('describeColors', () => {
  it('returns a FactorDetail', () => {
    const d = describeColors(['Red', 'Yellow']);
    expect(d.title).toBe('Why these colours');
    expect(Array.isArray(d.benefits)).toBe(true);
  });

  it('includes each input color in benefits', () => {
    const d = describeColors(['Green', 'White']);
    expect(d.benefits.some((b) => b.includes('Green'))).toBe(true);
    expect(d.benefits.some((b) => b.includes('White'))).toBe(true);
  });

  it('handles unknown color gracefully', () => {
    expect(() => describeColors(['Chartreuse'])).not.toThrow();
  });
});

// ─────────────────────────────────────────────
// describeDays
// ─────────────────────────────────────────────

describe('describeDays', () => {
  it('returns a FactorDetail with title', () => {
    const d = describeDays(['Sunday', 'Thursday']);
    expect(typeof d.title).toBe('string');
    expect(Array.isArray(d.benefits)).toBe(true);
  });

  it('includes each day in benefits', () => {
    const d = describeDays(['Monday']);
    expect(d.benefits.some((b) => b.includes('Monday'))).toBe(true);
  });

  it('handles unknown day gracefully', () => {
    expect(() => describeDays(['Funday'])).not.toThrow();
  });
});

// ─────────────────────────────────────────────
// describeDirections
// ─────────────────────────────────────────────

describe('describeDirections', () => {
  it('returns a FactorDetail', () => {
    const d = describeDirections(['East', 'North']);
    expect(typeof d.title).toBe('string');
    expect(Array.isArray(d.benefits)).toBe(true);
  });

  it('includes each direction in benefits', () => {
    const d = describeDirections(['South']);
    expect(d.benefits.some((b) => b.includes('South'))).toBe(true);
  });
});

// ─────────────────────────────────────────────
// describeMetal
// ─────────────────────────────────────────────

describe('describeMetal', () => {
  it('returns a FactorDetail for Gold', () => {
    const d = describeMetal('Gold');
    expect(typeof d.title).toBe('string');
    expect(Array.isArray(d.benefits)).toBe(true);
  });

  it('returns a FactorDetail for Silver', () => {
    const d = describeMetal('Silver');
    expect(typeof d.title).toBe('string');
  });

  it('handles unknown metal gracefully', () => {
    expect(() => describeMetal('Unobtainium')).not.toThrow();
  });
});
