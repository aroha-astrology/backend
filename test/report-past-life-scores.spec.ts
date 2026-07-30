import { describe, expect, it } from 'vitest';
import { computePastLifeScores } from '../src/lib/astro-engine/reports/past-life.js';

function makeChart(
  opts: {
    rahu?: { house: number; sign: string };
    ketu?: { house: number; sign: string };
    extraPlanets?: Array<{ planet: string; house: number; sign?: string }>;
    twelfthLord?: string;
    twelfthLordSign?: string;
  } = {},
): Record<string, unknown> {
  const planets: Record<string, unknown>[] = [];
  if (opts.rahu) planets.push({ planet: 'Rahu', house: opts.rahu.house, sign: opts.rahu.sign });
  if (opts.ketu) planets.push({ planet: 'Ketu', house: opts.ketu.house, sign: opts.ketu.sign });
  for (const p of opts.extraPlanets ?? []) planets.push(p);
  if (opts.twelfthLord)
    planets.push({ planet: opts.twelfthLord, sign: opts.twelfthLordSign ?? 'Aries' });

  return {
    planets,
    houses: opts.twelfthLord ? [{ house: 12, lord: opts.twelfthLord, sign: 'Pisces' }] : [],
  };
}

describe('computePastLifeScores', () => {
  it('reads Rahu house + sign directly from chart data', () => {
    const chart = makeChart({ rahu: { house: 3, sign: 'Gemini' } });
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.rahuHouse).toBe(3);
    expect(scores.rahuSign).toBe('Gemini');
  });

  it('reads Ketu house + sign directly from chart data — verified from data, not assumed opposite', () => {
    // Deliberately NOT the geometric opposite of the Rahu fixture above, to prove this function
    // reads Ketu's own chart entry rather than deriving/assuming it from Rahu's position.
    const chart = makeChart({
      rahu: { house: 3, sign: 'Gemini' },
      ketu: { house: 9, sign: 'Sagittarius' },
    });
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.ketuHouse).toBe(9);
    expect(scores.ketuSign).toBe('Sagittarius');
  });

  it('reports the 12th-lord strength via analyzePlanetStrengths + chart-facts house lookup', () => {
    // Mercury in own sign Virgo => strong.
    const chart = makeChart({ twelfthLord: 'Mercury', twelfthLordSign: 'Virgo' });
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.twelfthLordStrength).toBe('strong');
  });

  it('defaults 12th-lord strength to average when house data is missing', () => {
    const chart = makeChart({});
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.twelfthLordStrength).toBe('average');
  });

  it('flags planets conjunct Rahu or Ketu (same house), excluding Rahu/Ketu themselves', () => {
    const chart = makeChart({
      rahu: { house: 3, sign: 'Gemini' },
      ketu: { house: 9, sign: 'Sagittarius' },
      extraPlanets: [
        { planet: 'Mars', house: 3 }, // conjunct Rahu
        { planet: 'Jupiter', house: 9 }, // conjunct Ketu
        { planet: 'Venus', house: 5 }, // not conjunct either
      ],
    });
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.conjunctPlanets.sort()).toEqual(['Jupiter', 'Mars']);
  });

  it('returns an empty conjunctPlanets array when nothing conjuncts Rahu/Ketu', () => {
    const chart = makeChart({
      rahu: { house: 3, sign: 'Gemini' },
      ketu: { house: 9, sign: 'Sagittarius' },
      extraPlanets: [{ planet: 'Venus', house: 5 }],
    });
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.conjunctPlanets).toEqual([]);
  });

  it('handles a null chart defensively without throwing', () => {
    expect(() => computePastLifeScores({ chart: null, partnerChart: null }, null)).not.toThrow();
    const scores = computePastLifeScores({ chart: null, partnerChart: null }, null);
    expect(scores.rahuHouse).toBeNull();
    expect(scores.ketuHouse).toBeNull();
    expect(scores.conjunctPlanets).toEqual([]);
  });
});

describe('computePastLifeScores — karmicArchetype (house-axis theme)', () => {
  it.each([
    [1, 'Self & Partnership Axis'],
    [7, 'Self & Partnership Axis'],
    [2, 'Resources & Shared Transformation Axis'],
    [8, 'Resources & Shared Transformation Axis'],
    [3, 'Effort & Belief Axis'],
    [9, 'Effort & Belief Axis'],
    [4, 'Roots & Career Axis'],
    [10, 'Roots & Career Axis'],
    [5, 'Creative Self & Community Axis'],
    [11, 'Creative Self & Community Axis'],
    [6, 'Service & Release Axis'],
    [12, 'Service & Release Axis'],
  ])('maps Rahu house %i to the "%s" theme', (house, label) => {
    const chart = makeChart({ rahu: { house, sign: 'Aries' } });
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.karmicArchetype.label).toBe(label);
    expect(scores.karmicArchetype.description.length).toBeGreaterThan(0);
  });

  it("derives the axis from Ketu's house when Rahu's house is unavailable", () => {
    const chart = makeChart({ ketu: { house: 10, sign: 'Capricorn' } });
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.karmicArchetype.label).toBe('Roots & Career Axis');
  });

  it("prefers Rahu's house over Ketu's when both are present (same axis either way in practice)", () => {
    const chart = makeChart({
      rahu: { house: 5, sign: 'Leo' },
      ketu: { house: 11, sign: 'Aquarius' },
    });
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.karmicArchetype.label).toBe('Creative Self & Community Axis');
  });

  it('falls back to a generic archetype when neither Rahu nor Ketu house is available', () => {
    const scores = computePastLifeScores({ chart: null, partnerChart: null }, null);
    expect(scores.karmicArchetype.label).toBe('Karmic Axis');
    expect(scores.karmicArchetype.description.length).toBeGreaterThan(0);
  });
});

describe('computePastLifeScores — doshaYoga (Kaal Sarp check)', () => {
  it('flags Kaal Sarp Dosha as a caution when present in ctx.doshaData', () => {
    const chart = makeChart({
      rahu: { house: 3, sign: 'Gemini' },
      ketu: { house: 9, sign: 'Sagittarius' },
    });
    const doshaData = {
      kaalSarp: { present: true, severity: 'high', isPartial: false, name: 'Anant Kaal Sarp' },
    };
    const scores = computePastLifeScores({ chart, partnerChart: null, doshaData }, null);
    expect(scores.doshaYoga.cautions).toHaveLength(1);
    expect(scores.doshaYoga.cautions[0]?.label).toBe('Kaal Sarp Dosha');
  });

  it('reports no cautions when Kaal Sarp Dosha is not present', () => {
    const chart = makeChart({ rahu: { house: 3, sign: 'Gemini' } });
    const doshaData = { kaalSarp: { present: false } };
    const scores = computePastLifeScores({ chart, partnerChart: null, doshaData }, null);
    expect(scores.doshaYoga.cautions).toEqual([]);
  });

  it('never surfaces yoga positives (relevantYogaTypes is intentionally empty for this report)', () => {
    const chart = makeChart({ rahu: { house: 3, sign: 'Gemini' } });
    const yogaData = { yogas: [{ type: 'raja', name: 'Test', present: true, description: 'x' }] };
    const scores = computePastLifeScores({ chart, partnerChart: null, yogaData }, null);
    expect(scores.doshaYoga.positives).toEqual([]);
  });

  it('degrades to an empty dosha summary when doshaData/yogaData are null/missing, without throwing', () => {
    const chart = makeChart({ rahu: { house: 3, sign: 'Gemini' } });
    expect(() => computePastLifeScores({ chart, partnerChart: null }, null)).not.toThrow();
    const scores = computePastLifeScores({ chart, partnerChart: null }, null);
    expect(scores.doshaYoga).toEqual({ positives: [], cautions: [] });
  });

  it('handles a null chart defensively for doshaYoga/karmicArchetype too', () => {
    expect(() => computePastLifeScores({ chart: null, partnerChart: null }, null)).not.toThrow();
    const scores = computePastLifeScores({ chart: null, partnerChart: null }, null);
    expect(scores.doshaYoga).toEqual({ positives: [], cautions: [] });
    expect(scores.karmicArchetype.label).toBe('Karmic Axis');
  });
});
