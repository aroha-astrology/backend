import { describe, expect, it } from 'vitest';
import { computeCompatibilityFacts } from '../src/lib/astro-engine/compatibility.js';

// Fixture charts. Real output was verified via a scratch `npx tsx` run of
// computeCompatibilityFacts against these exact fixtures before writing the
// concrete regression-guard assertion below (CHART_A vs CHART_B observed
// totalScore: 23/36, "good"; Nadi 8/8, Bhakoot 7/7, both charts Manglik).
const CHART_A: Record<string, unknown> = {
  ascendant: { signIndex: 0, sign: 'Aries' },
  planets: [
    { planet: 'Moon', sign: 'Aries', signIndex: 0, nakshatraIndex: 0, house: 1 },
    { planet: 'Mars', sign: 'Taurus', signIndex: 1, house: 2 },
    { planet: 'Venus', sign: 'Pisces', signIndex: 11, house: 12 },
  ],
};

const CHART_B: Record<string, unknown> = {
  ascendant: { signIndex: 6, sign: 'Libra' },
  planets: [
    { planet: 'Moon', sign: 'Cancer', signIndex: 3, nakshatraIndex: 8, house: 10 },
    { planet: 'Mars', sign: 'Leo', signIndex: 4, house: 11 },
    { planet: 'Venus', sign: 'Virgo', signIndex: 5, house: 12 },
  ],
};

describe('computeCompatibilityFacts', () => {
  it('returns a total score within the valid Ashtakoota range (0-36)', () => {
    const facts = computeCompatibilityFacts(CHART_A, CHART_B);
    expect(facts.totalScore).toBeGreaterThanOrEqual(0);
    expect(facts.totalScore).toBeLessThanOrEqual(facts.maxScore);
    expect(facts.maxScore).toBe(36);
  });

  it('includes all 8 Koota names', () => {
    const facts = computeCompatibilityFacts(CHART_A, CHART_B);
    const names = facts.kutaDetails.map((k) => k.name);
    expect(names).toHaveLength(8);
    expect(names).toContain('Nadi');
    expect(names).toContain('Bhakoot');
  });

  it('flags nadiDosha true only when the Nadi koota scored 0', () => {
    const facts = computeCompatibilityFacts(CHART_A, CHART_B);
    const nadi = facts.kutaDetails.find((k) => k.name === 'Nadi');
    expect(facts.flags.nadiDosha).toBe(nadi?.obtained === 0);
  });

  it('reports mangalDosha.matched as true iff both persons have the same present/absent state', () => {
    const facts = computeCompatibilityFacts(CHART_A, CHART_B);
    expect(facts.mangalDosha.matched).toBe(facts.mangalDosha.person1 === facts.mangalDosha.person2);
  });

  it('produces a non-empty deterministic recommendation string', () => {
    const facts = computeCompatibilityFacts(CHART_A, CHART_B);
    expect(facts.recommendation.length).toBeGreaterThan(0);
  });

  it('handles a null chart gracefully (defaults to Aries/nakshatra 0) without throwing', () => {
    expect(() => computeCompatibilityFacts(null, CHART_B)).not.toThrow();
  });

  // Concrete regression-guard: actual observed output for CHART_A vs CHART_B,
  // captured by actually running computeCompatibilityFacts (not guessed) —
  // see the fixture comment above. Locks in the exact Ashtakoota math so a
  // future change to ashtakoota.ts/mangalDosha.ts (or an accidental swap of
  // this module for a different implementation) gets caught immediately.
  it('matches the actual observed Ashtakoota result for CHART_A vs CHART_B', () => {
    const facts = computeCompatibilityFacts(CHART_A, CHART_B);
    expect(facts.totalScore).toBe(23);
    expect(facts.compatibility).toBe('good');
    expect(facts.kutaDetails.find((k) => k.name === 'Nadi')).toMatchObject({
      obtained: 8,
      maximum: 8,
    });
    expect(facts.kutaDetails.find((k) => k.name === 'Bhakoot')).toMatchObject({
      obtained: 7,
      maximum: 7,
    });
    expect(facts.flags).toEqual({ nadiDosha: false, bhakootDosha: false });
    expect(facts.mangalDosha).toEqual({ person1: true, person2: true, matched: true });
  });
});
