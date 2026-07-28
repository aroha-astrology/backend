import { describe, expect, it } from 'vitest';
import { computeNumerologyScores } from '../src/lib/astro-engine/reports/numerology.js';
import {
  calculateLifePath,
  calculateExpression,
  calculateSoulUrge,
  calculatePersonality,
  calculateLuckyNumbers,
} from '../src/lib/astro-engine/numerology/index.js';
import {
  calculateMulank,
  calculateBhagyank,
  calculateLoShuGrid,
  calculateChallengeNumbers,
  calculatePersonalYear,
  calculatePersonalMonth,
  generateMonthlyForecast,
  getNamePlanes,
  getKuaData,
} from '../src/lib/astro-engine/numerology/vedic.js';
import type { ReportScoreContext } from '../src/modules/reports/report-generator.types.js';

const NAME = 'JOHN SMITH';
const DOB = '1990-05-15';
const NOW = new Date('2026-07-27T00:00:00Z');

function makeCtx(overrides: Partial<ReportScoreContext> = {}): ReportScoreContext {
  return { chart: null, personName: NAME, personDob: DOB, personGender: 'male', ...overrides };
}

describe('computeNumerologyScores — core numbers delegate to the real engine functions', () => {
  it('computes mulank/bhagyank from the same DOB via calculateMulank/calculateBhagyank', () => {
    const dob = new Date(DOB);
    const scores = computeNumerologyScores(makeCtx(), null, NOW);
    expect(scores.mulank).toBe(calculateMulank(dob));
    expect(scores.bhagyank).toBe(calculateBhagyank(dob));
  });

  it('computes lifePath from the DOB string via calculateLifePath', () => {
    const scores = computeNumerologyScores(makeCtx(), null, NOW);
    expect(scores.lifePath).toBe(calculateLifePath(DOB));
  });

  it('computes expression/soulUrge/personality from the name via the real engine functions', () => {
    const scores = computeNumerologyScores(makeCtx(), null, NOW);
    expect(scores.expression).toBe(calculateExpression(NAME));
    expect(scores.soulUrge).toBe(calculateSoulUrge(NAME));
    expect(scores.personality).toBe(calculatePersonality(NAME));
  });

  it('computes luckyNumbers from its own computed lifePath', () => {
    const scores = computeNumerologyScores(makeCtx(), null, NOW);
    expect(scores.luckyNumbers).toEqual(calculateLuckyNumbers(scores.lifePath));
  });

  it('surfaces the exact name/dob actually used', () => {
    const scores = computeNumerologyScores(makeCtx(), null, NOW);
    expect(scores.name).toBe(NAME);
    expect(scores.dob).toBe(DOB);
  });
});

describe('computeNumerologyScores — Mulank/Bhagyank match the classical worked examples documented on vedic.ts', () => {
  it('Mulank: born on the 29th -> 2+9=11 -> 1+1=2 (vedic.ts calculateMulank doc comment)', () => {
    const scores = computeNumerologyScores(makeCtx({ personDob: '1990-05-29' }), null, NOW);
    expect(scores.mulank).toBe(2);
  });

  it('Bhagyank: 15/08/1987 -> 1+5+0+8+1+9+8+7=39 -> 3+9=12 -> 1+2=3 (vedic.ts calculateBhagyank doc comment)', () => {
    const scores = computeNumerologyScores(makeCtx({ personDob: '1987-08-15' }), null, NOW);
    expect(scores.bhagyank).toBe(3);
  });
});

describe('computeNumerologyScores — Lo Shu Grid, Challenge Numbers, Name Planes, Kua', () => {
  it('delegates the Lo Shu Grid to calculateLoShuGrid for the same DOB', () => {
    const scores = computeNumerologyScores(makeCtx(), null, NOW);
    expect(scores.loShuGrid).toEqual(calculateLoShuGrid(new Date(DOB)));
  });

  it('delegates Challenge Numbers to calculateChallengeNumbers for the same DOB', () => {
    const scores = computeNumerologyScores(makeCtx(), null, NOW);
    expect(scores.challengeNumbers).toEqual(calculateChallengeNumbers(new Date(DOB)));
  });

  it('delegates Name Planes to getNamePlanes for the same name', () => {
    const scores = computeNumerologyScores(makeCtx(), null, NOW);
    expect(scores.namePlanes).toEqual(getNamePlanes(NAME));
  });

  it('computes Kua data for a male using the given birth year', () => {
    const scores = computeNumerologyScores(makeCtx({ personGender: 'male' }), null, NOW);
    expect(scores.kua).toEqual(getKuaData(new Date(DOB).getUTCFullYear(), 'male'));
  });

  it('computes Kua data for a female using the given birth year', () => {
    const scores = computeNumerologyScores(makeCtx({ personGender: 'female' }), null, NOW);
    expect(scores.kua).toEqual(getKuaData(new Date(DOB).getUTCFullYear(), 'female'));
  });

  it('falls back to the male Kua formula when gender is "other" (documented judgment call — the classical formula is binary)', () => {
    const scores = computeNumerologyScores(makeCtx({ personGender: 'other' }), null, NOW);
    expect(scores.kua).toEqual(getKuaData(new Date(DOB).getUTCFullYear(), 'male'));
  });

  it('falls back to the male Kua formula when gender is missing', () => {
    const scores = computeNumerologyScores(makeCtx({ personGender: null }), null, NOW);
    expect(scores.kua).toEqual(getKuaData(new Date(DOB).getUTCFullYear(), 'male'));
  });
});

describe('computeNumerologyScores — Personal Year/Month + 12-month forecast', () => {
  it('computes the current Personal Year/Month as of the given `now`', () => {
    const scores = computeNumerologyScores(makeCtx(), null, NOW);
    const expectedYear = calculatePersonalYear(new Date(DOB), NOW.getUTCFullYear());
    expect(scores.personalYear).toBe(expectedYear);
    expect(scores.personalMonth).toBe(calculatePersonalMonth(expectedYear, NOW.getUTCMonth() + 1));
  });

  it("generates exactly 12 forecast months starting at `now`'s own calendar month/year", () => {
    const scores = computeNumerologyScores(makeCtx(), null, NOW);
    const expected = generateMonthlyForecast(
      new Date(DOB),
      NOW.getUTCFullYear(),
      NOW.getUTCMonth() + 1,
    );
    expect(scores.monthlyForecast).toEqual(expected);
    expect(scores.monthlyForecast).toHaveLength(12);
    expect(scores.monthlyForecast[0]?.calendarMonth).toBe(NOW.getUTCMonth() + 1);
  });
});

describe('computeNumerologyScores — defensive fallbacks (should never trigger in real production traffic)', () => {
  it('never throws when personName/personDob/personGender are all missing', () => {
    expect(() => computeNumerologyScores({ chart: null }, null, NOW)).not.toThrow();
  });

  it('falls back to a placeholder name when personName is missing', () => {
    const scores = computeNumerologyScores(makeCtx({ personName: null }), null, NOW);
    expect(scores.name).toBe('Unknown');
  });

  it('falls back to a placeholder name when personName is an empty/whitespace string', () => {
    const scores = computeNumerologyScores(makeCtx({ personName: '   ' }), null, NOW);
    expect(scores.name).toBe('Unknown');
  });

  it('falls back to the epoch DOB when personDob is missing', () => {
    const scores = computeNumerologyScores(makeCtx({ personDob: null }), null, NOW);
    expect(scores.dob).toBe('1970-01-01');
  });

  it('falls back to the epoch DOB when personDob is unparseable', () => {
    const scores = computeNumerologyScores(makeCtx({ personDob: 'not-a-date' }), null, NOW);
    expect(scores.dob).toBe('1970-01-01');
  });
});
