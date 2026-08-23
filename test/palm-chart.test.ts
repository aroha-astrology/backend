import { describe, it, expect } from 'vitest';
import {
  CHART_ANCHOR_TOLERANCE,
  chartDomainScores,
  clampToChart,
  crossCheckPalmAgainstChart,
} from '../src/lib/astro-engine/palm/palm-chart.js';
import type { PalmHandObservations, PalmMounts } from '../src/lib/astro-engine/palm/palm-types.js';

/** A chart shaped the way `kundli.chartData` actually is — enough for analyzePlanetStrengths
 * (which reads sign dignity off `planets`) and for the house-lord lookups. */
function makeChart(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    ascendant: { sign: 'Aries', signIndex: 0 },
    planets: [
      { planet: 'Sun', sign: 'Aries', house: 1, longitude: 10 },
      { planet: 'Moon', sign: 'Taurus', house: 2, longitude: 40 },
      { planet: 'Mars', sign: 'Capricorn', house: 10, longitude: 280 },
      { planet: 'Mercury', sign: 'Virgo', house: 6, longitude: 160 },
      { planet: 'Jupiter', sign: 'Cancer', house: 4, longitude: 100 },
      { planet: 'Venus', sign: 'Virgo', house: 6, longitude: 165 },
      { planet: 'Saturn', sign: 'Aries', house: 1, longitude: 20 },
      { planet: 'Rahu', sign: 'Gemini', house: 3, longitude: 70 },
      { planet: 'Ketu', sign: 'Sagittarius', house: 9, longitude: 250 },
    ],
    houses: Array.from({ length: 12 }, (_, i) => ({
      house: i + 1,
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
      sign: 'Aries',
    })),
    ...overrides,
  };
}

function makeHand(mounts: Partial<PalmMounts> = {}): PalmHandObservations {
  const base: PalmMounts = {
    jupiter: 'normal',
    saturn: 'normal',
    apollo: 'normal',
    mercury: 'normal',
    venus: 'normal',
    luna: 'normal',
    marsUpper: 'normal',
    marsLower: 'normal',
    rahuPlain: 'normal',
  };
  return {
    hand: 'right',
    imageQuality: { score: 8, lineVisibility: 8, lighting: 8, focus: 8, framing: 8 },
    handType: { element: 'Earth', palmShape: 'square', skinTexture: 'medium' },
    mounts: { ...base, ...mounts },
    majorLines: {
      lifeLine: { present: true },
      heartLine: { present: true },
      headLine: { present: true },
      fateLine: { present: true },
    },
    minorLines: {
      marriageLines: { count: 1 },
      childrenLines: { count: 0 },
      intuitionLine: { present: false },
      travelLines: { count: 0 },
    },
    thumb: { flexibility: 'normal', setAngle: 'medium' },
    fingerprints: [],
    specialMarkings: [],
  };
}

describe('chartDomainScores', () => {
  it('scores all six domains in the 0-10 range', () => {
    const scores = chartDomainScores(makeChart());
    expect(scores).not.toBeNull();
    for (const [domain, value] of Object.entries(scores!)) {
      expect(Number.isInteger(value), `${domain} should be an integer`).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(10);
    }
  });

  it('returns null for a chart with no planet data rather than inventing a baseline', () => {
    expect(chartDomainScores(null)).toBeNull();
    expect(chartDomainScores({ planets: [] })).toBeNull();
    expect(chartDomainScores({})).toBeNull();
  });
});

describe('clampToChart', () => {
  const chart = {
    career: 5,
    wealth: 5,
    marriage: 5,
    health: 5,
    fame: 5,
    spiritualGrowth: 5,
  };

  it('pulls a palm score that contradicts the chart back into the tolerance band', () => {
    const palm = { ...chart, marriage: 0, wealth: 10 };
    const result = clampToChart(palm, chart);
    expect(result.marriage).toBe(5 - CHART_ANCHOR_TOLERANCE);
    expect(result.wealth).toBe(5 + CHART_ANCHOR_TOLERANCE);
  });

  it('leaves a palm score that merely shades the chart untouched', () => {
    const palm = { ...chart, career: 6, health: 4 };
    const result = clampToChart(palm, chart);
    expect(result.career).toBe(6);
    expect(result.health).toBe(4);
  });

  it('never produces a score outside 0-10 even at the ends of the scale', () => {
    const extremes = { ...chart, career: 0, wealth: 10 };
    const result = clampToChart({ ...chart, career: 10, wealth: 0 }, extremes);
    expect(result.career).toBeGreaterThanOrEqual(0);
    expect(result.career).toBeLessThanOrEqual(10);
    expect(result.wealth).toBeGreaterThanOrEqual(0);
    expect(result.wealth).toBeLessThanOrEqual(10);
  });

  it('passes the palm scores through untouched when there is no chart baseline', () => {
    const palm = { ...chart, marriage: 0, wealth: 10 };
    expect(clampToChart(palm, null)).toEqual(palm);
  });
});

describe('crossCheckPalmAgainstChart', () => {
  it('emits nothing for an all-normal hand — there is nothing to agree or disagree with', () => {
    expect(crossCheckPalmAgainstChart(makeHand(), makeChart())).toEqual([]);
  });

  it('emits nothing when the chart is unusable', () => {
    expect(crossCheckPalmAgainstChart(makeHand({ venus: 'prominent' }), null)).toEqual([]);
    expect(crossCheckPalmAgainstChart(makeHand({ venus: 'prominent' }), { planets: [] })).toEqual(
      [],
    );
  });

  it('labels every emitted fact as either a corroboration or a conflict, never both', () => {
    const facts = crossCheckPalmAgainstChart(
      makeHand({ jupiter: 'prominent', saturn: 'flat', venus: 'prominent' }),
      makeChart(),
    );
    for (const fact of facts) {
      const isCorroboration = fact.key.endsWith('.corroborated');
      const isConflict = fact.key.endsWith('.conflict');
      expect(isCorroboration !== isConflict).toBe(true);
      expect(fact.key.startsWith('chart.mount.')).toBe(true);
      expect(fact.source).toBe('Palm/chart cross-validation');
      expect(fact.evidence.length).toBeGreaterThan(0);
      expect(fact.meaning.length).toBeGreaterThan(0);
    }
  });

  it('names a disagreement instead of silently dropping the mount', () => {
    // Venus is in Virgo here — debilitated, so analyzePlanetStrengths reads it as weak, while
    // the hand shows a prominent Mount of Venus. That is exactly the case that used to be
    // resolved silently in the prompt.
    const facts = crossCheckPalmAgainstChart(makeHand({ venus: 'prominent' }), makeChart());
    const venusFact = facts.find((f) => f.key.startsWith('chart.mount.venus.'));
    expect(venusFact).toBeDefined();
    expect(venusFact!.key).toBe('chart.mount.venus.conflict');
    expect(venusFact!.meaning).toMatch(/disagree/i);
  });
});
