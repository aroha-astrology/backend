import { describe, expect, it } from 'vitest';
import {
  computeArchetype,
  SIGN_TEMPERAMENT,
  type Archetype,
} from '../src/lib/astro-engine/reports/report-archetype.js';
import { computeMarriageScores } from '../src/lib/astro-engine/reports/marriage.js';
import type { PlanetAnalysis } from '../src/lib/astro-engine/gemstones.js';

function makeAnalyses(strengths: Record<string, PlanetAnalysis['strength']>): PlanetAnalysis[] {
  return Object.entries(strengths).map(([planet, strength]) => ({
    planet,
    strength,
    reason: 'test fixture',
    needsGemstone: false,
    preference: 50,
  }));
}

describe('SIGN_TEMPERAMENT', () => {
  it('has an entry for all 12 zodiac signs', () => {
    const signs = [
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
    for (const sign of signs) {
      expect(SIGN_TEMPERAMENT[sign]).toBeDefined();
      expect(SIGN_TEMPERAMENT[sign]!.length).toBeGreaterThan(0);
    }
  });

  it('is the exact same table marriage.ts now imports (moved, not duplicated)', () => {
    // Regression guard for the Step 3 relocation: marriage.ts's 7th-house temperament sketch
    // must keep working identically after importing SIGN_TEMPERAMENT from report-archetype.ts
    // instead of defining it locally.
    const chart = {
      ascendant: { signIndex: 0 },
      planets: [],
      houses: [{ house: 7, lord: 'Mars', sign: 'Aries' }],
      julianDay: 2440588,
    };
    const scores = computeMarriageScores({ chart, partnerChart: null }, null);
    expect(scores.seventhHouseTemperament).toBe(SIGN_TEMPERAMENT.Aries);
  });
});

describe('computeArchetype', () => {
  const traitLabels: [string, string, string, string, string] = [
    'Warmth',
    'Discipline',
    'Intellect',
    'Sensuality',
    'Ambition',
  ];
  const traitSignificators: [string, string, string, string, string] = [
    'Venus',
    'Saturn',
    'Mercury',
    'Moon',
    'Mars',
  ];

  it('scales weak/average/strong to 3/6/9 out of 10 (STRENGTH_SCORE/10)', () => {
    const analyses = makeAnalyses({
      Venus: 'weak',
      Saturn: 'average',
      Mercury: 'strong',
      Moon: 'weak',
      Mars: 'average',
    });
    const archetype: Archetype = computeArchetype(
      'Aries',
      'The Quiet Strategist',
      traitLabels,
      traitSignificators,
      analyses,
    );
    expect(archetype.traits).toEqual([
      { label: 'Warmth', score: 3 },
      { label: 'Discipline', score: 6 },
      { label: 'Intellect', score: 9 },
      { label: 'Sensuality', score: 3 },
      { label: 'Ambition', score: 6 },
    ]);
  });

  it('defaults a planet missing from `analyses` to average (score 6)', () => {
    const analyses = makeAnalyses({}); // no planets classified at all
    const archetype = computeArchetype(
      'Leo',
      'The Radiant Host',
      traitLabels,
      traitSignificators,
      analyses,
    );
    for (const trait of archetype.traits) {
      expect(trait.score).toBe(6);
    }
  });

  it('preserves trait label order exactly as given (5 entries)', () => {
    const analyses = makeAnalyses({});
    const archetype = computeArchetype('Leo', 'X', traitLabels, traitSignificators, analyses);
    expect(archetype.traits).toHaveLength(5);
    expect(archetype.traits.map((t) => t.label)).toEqual(traitLabels);
  });

  it('threads the given archetypeLabel straight through as `label`', () => {
    const archetype = computeArchetype(
      'Leo',
      'The Radiant Host',
      traitLabels,
      traitSignificators,
      [],
    );
    expect(archetype.label).toBe('The Radiant Host');
  });

  it("builds a one-sentence description from the house sign's SIGN_TEMPERAMENT entry", () => {
    const archetype = computeArchetype('Scorpio', 'X', traitLabels, traitSignificators, []);
    expect(archetype.description).toContain(SIGN_TEMPERAMENT.Scorpio);
    expect(archetype.description).toContain('Scorpio');
  });

  it('degrades gracefully (no throw) when houseSign is undefined', () => {
    expect(() =>
      computeArchetype(undefined, 'X', traitLabels, traitSignificators, []),
    ).not.toThrow();
    const archetype = computeArchetype(undefined, 'X', traitLabels, traitSignificators, []);
    expect(archetype.description.length).toBeGreaterThan(0);
  });

  it('falls back to a generic temperament line for a sign not present in SIGN_TEMPERAMENT', () => {
    const archetype = computeArchetype('NotASign', 'X', traitLabels, traitSignificators, []);
    expect(archetype.description).toContain("a distinct temperament shaped by this house's sign");
  });
});
