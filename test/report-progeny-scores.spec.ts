import { describe, expect, it } from 'vitest';
import { computeProgenyScores } from '../src/lib/astro-engine/reports/progeny.js';
import type { ReportScoreContext } from '../src/modules/reports/report-generator.types.js';

/** Whole-sign chart from an Aries ascendant, with real longitudes so D7 (Saptamsha) actually
 * computes — computeReportVargas needs `planets[].longitude`, unlike the sign/house-only
 * fixtures other report specs use (see match-risk-factors.spec.ts's makeChart). */
function makeChart(overrides: Partial<Record<string, number>> = {}): Record<string, unknown> {
  const longitudes: Record<string, number> = {
    Sun: 10,
    Moon: 40,
    Mars: 70,
    Mercury: 100,
    Jupiter: 130,
    Venus: 160,
    Saturn: 190,
    Rahu: 220,
    Ketu: 40,
    ...overrides,
  };
  const SIGNS = [
    'Aries',
    'Taurus',
    'Gemini',
    'Cancer',
    'Leo',
    'Virgo',
    'Libra',
    'Scorpio',
    'Sagittarius',
    'Capricorn',
    'Aquarius',
    'Pisces',
  ];
  const signOf = (lon: number) => SIGNS[Math.floor((((lon % 360) + 360) % 360) / 30)];
  return {
    ascendant: { signIndex: 0, degree: 0, sign: 'Aries' },
    planets: Object.entries(longitudes).map(([planet, longitude]) => ({
      planet,
      longitude,
      sign: signOf(longitude),
    })),
    houses: SIGNS.map((sign, i) => ({
      house: i + 1,
      sign,
      lord: [
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
      ][i],
    })),
  };
}

function baseCtx(overrides: Partial<ReportScoreContext> = {}): ReportScoreContext {
  return {
    chart: makeChart(),
    partnerChart: makeChart({ Sun: 200, Moon: 260, Jupiter: 20 }),
    personDob: '1990-01-01',
    personGender: 'female',
    partnerName: 'Test Spouse',
    ...overrides,
  };
}

describe('computeProgenyScores', () => {
  it("assigns motherPromise from the reader's own chart when personGender is female", () => {
    const scores = computeProgenyScores(baseCtx({ personGender: 'female' }), null);
    expect(scores.motherPromise).not.toBeNull();
    expect(scores.fatherPromise).not.toBeNull();
    // Mother's sphuta must be Kshetra (Moon+Mars+Jupiter), Father's must be Beeja (Sun+Venus+Jupiter).
    expect(scores.motherPromise!.sphuta?.kind).toBe('kshetra');
    expect(scores.fatherPromise!.sphuta?.kind).toBe('beeja');
    expect(['Strong', 'Moderate', 'Mixed', 'Weak']).toContain(scores.motherPromise!.band);
  });

  it('swaps which chart is mother/father when personGender is male', () => {
    const female = computeProgenyScores(baseCtx({ personGender: 'female' }), null);
    const male = computeProgenyScores(baseCtx({ personGender: 'male' }), null);
    // The reader's own chart's fifth-house lord is identical in both fixtures — but which
    // engine (mother vs father) it lands in must flip with gender.
    expect(female.motherPromise!.fifthHouseLord).toBe(male.fatherPromise!.fifthHouseLord);
    expect(female.fatherPromise!.fifthHouseLord).toBe(male.motherPromise!.fifthHouseLord);
  });

  it('leaves both promises null (an honest gap, not a guess) when gender is unknown', () => {
    const scores = computeProgenyScores(baseCtx({ personGender: null }), null);
    expect(scores.motherPromise).toBeNull();
    expect(scores.fatherPromise).toBeNull();
    // The couple-level facts must still be present even without a mother/father split.
    expect(scores.vargas?.length).toBeGreaterThan(0);
    expect(scores.partnerVargas?.length).toBeGreaterThan(0);
  });

  it('coupleConvergence is always one of the four documented bands', () => {
    const scores = computeProgenyScores(baseCtx(), null);
    expect(['Strong convergence', 'Moderate convergence', 'Mixed', 'Conflict']).toContain(
      scores.coupleConvergence,
    );
  });

  it('childrenCard is null for a reader under 35', () => {
    const scores = computeProgenyScores(baseCtx({ personDob: '2000-01-01' }), null);
    expect(scores.childrenCard).toBeNull();
  });

  it('childrenCard is populated for a reader 35 or older, with a real D7 behind it', () => {
    const scores = computeProgenyScores(baseCtx({ personDob: '1980-01-01' }), null);
    expect(scores.childSequence).not.toBeNull();
    expect(scores.childrenCard).not.toBeNull();
    expect(scores.childrenCard!.sequence.length).toBeGreaterThan(0);
    expect(['A', 'both']).toContain(scores.childrenCard!.method);
    for (const slot of scores.childrenCard!.sequence) {
      expect(['male', 'female', 'inconclusive']).toContain(slot.tendency);
      expect(['low', 'moderate']).toContain(slot.confidence);
    }
  });

  // Built as a plain "YYYY-MM-DD" string from LOCAL y/m/d (never via toISOString on a
  // Date built from local components) -- round-tripping through toISOString shifts the
  // calendar day in any timezone ahead of UTC, which would make this boundary test flaky
  // depending on the machine running it.
  function localDobString(yearsAgo: number, dayOffset: number): string {
    const now = new Date();
    const y = now.getFullYear() - yearsAgo;
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate() + dayOffset).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  it('exactly turns 35 today counts as 35+ (boundary check)', () => {
    const scores = computeProgenyScores(baseCtx({ personDob: localDobString(35, 0) }), null);
    expect(scores.childrenCard).not.toBeNull();
  });

  it('34 years and 364 days old does NOT get the card', () => {
    const scores = computeProgenyScores(baseCtx({ personDob: localDobString(35, 1) }), null);
    expect(scores.childrenCard).toBeNull();
  });

  it('degrades gracefully with no chart at all (chart: null)', () => {
    const scores = computeProgenyScores(baseCtx({ chart: null, partnerChart: null }), null);
    expect(scores.motherPromise).toBeNull();
    expect(scores.fatherPromise).toBeNull();
    expect(scores.childrenCard).toBeNull();
    expect(scores.childSequence).toBeNull();
  });
});
