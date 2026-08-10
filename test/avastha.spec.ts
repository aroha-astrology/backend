import { describe, it, expect } from 'vitest';
import {
  baladiAvastha,
  detectGrahaYuddha,
  calculateVimsopakaBala,
  AVASTHA_POTENCY,
} from '../src/lib/astro-engine/calculations/avastha.js';
import { avasthaAndWarFacts } from '../src/lib/chat-grounding.js';
import type { PlanetFact } from '../src/lib/chat-grounding.js';

describe('baladiAvastha', () => {
  it('runs forward through the five states in an odd sign', () => {
    // signIndex 0 = Aries = the 1st sign = odd.
    expect(baladiAvastha(3, 0)).toBe('Bala');
    expect(baladiAvastha(9, 0)).toBe('Kumara');
    expect(baladiAvastha(15, 0)).toBe('Yuva');
    expect(baladiAvastha(21, 0)).toBe('Vriddha');
    expect(baladiAvastha(27, 0)).toBe('Mrita');
  });

  it('runs backward in an even sign — the same degree means the opposite state', () => {
    // signIndex 1 = Taurus = the 2nd sign = even.
    expect(baladiAvastha(3, 1)).toBe('Mrita');
    expect(baladiAvastha(15, 1)).toBe('Yuva'); // the middle is symmetric
    expect(baladiAvastha(27, 1)).toBe('Bala');
  });

  it('clamps the final degree rather than falling off the sequence', () => {
    expect(baladiAvastha(29.999, 0)).toBe('Mrita');
    expect(baladiAvastha(30, 0)).toBe('Mrita');
  });

  it('gives full potency only to Yuva', () => {
    expect(AVASTHA_POTENCY.Yuva).toBe(1);
    expect(AVASTHA_POTENCY.Mrita).toBe(0);
    expect(AVASTHA_POTENCY.Bala).toBeLessThan(1);
    expect(AVASTHA_POTENCY.Vriddha).toBeLessThan(1);
  });
});

describe('detectGrahaYuddha', () => {
  it('declares a war when two true planets are within one degree', () => {
    const wars = detectGrahaYuddha([
      { planet: 'Mars', longitude: 100.0, latitude: 1.2 },
      { planet: 'Saturn', longitude: 100.6, latitude: 0.3 },
    ]);
    expect(wars).toHaveLength(1);
    // The more northerly planet wins.
    expect(wars[0]!.winner).toBe('Mars');
    expect(wars[0]!.loser).toBe('Saturn');
    expect(wars[0]!.separation).toBeCloseTo(0.6, 2);
  });

  it('ignores pairs more than a degree apart', () => {
    expect(
      detectGrahaYuddha([
        { planet: 'Mars', longitude: 100, latitude: 1 },
        { planet: 'Saturn', longitude: 102, latitude: 0 },
      ]),
    ).toEqual([]);
  });

  it('never puts the luminaries or the nodes into a war', () => {
    const wars = detectGrahaYuddha([
      { planet: 'Sun', longitude: 100, latitude: 0 },
      { planet: 'Moon', longitude: 100.1, latitude: 1 },
      { planet: 'Rahu', longitude: 100.2, latitude: 0 },
      { planet: 'Ketu', longitude: 100.3, latitude: 0 },
    ]);
    expect(wars).toEqual([]);
  });

  it('measures across the 0/360 boundary', () => {
    const wars = detectGrahaYuddha([
      { planet: 'Venus', longitude: 359.8, latitude: 2 },
      { planet: 'Mercury', longitude: 0.3, latitude: 1 },
    ]);
    expect(wars).toHaveLength(1);
    expect(wars[0]!.winner).toBe('Venus');
  });
});

describe('calculateVimsopakaBala', () => {
  it('returns nothing rather than throwing on an unusable chart', () => {
    expect(calculateVimsopakaBala(null)).toEqual([]);
    expect(calculateVimsopakaBala({})).toEqual([]);
  });
});

describe('avasthaAndWarFacts', () => {
  const planets: PlanetFact[] = [];

  it('stays silent when every planet is Yuva and nothing is at war', () => {
    const chart = {
      planets: [
        { planet: 'Sun', signDegree: 15, signIndex: 0, longitude: 15, latitude: 0 },
        { planet: 'Moon', signDegree: 15, signIndex: 2, longitude: 75, latitude: 0 },
      ],
    };
    const facts = avasthaAndWarFacts(chart, planets);
    expect(facts.some((f) => f.startsWith('Baladi Avastha'))).toBe(false);
    expect(facts.some((f) => f.startsWith('Graha Yuddha'))).toBe(false);
  });

  it('names the planets that are not at full potency', () => {
    const chart = {
      planets: [
        { planet: 'Saturn', signDegree: 2, signIndex: 0, longitude: 2, latitude: 0 },
        { planet: 'Jupiter', signDegree: 15, signIndex: 0, longitude: 15, latitude: 0 },
      ],
    };
    const facts = avasthaAndWarFacts(chart, planets).join('\n');
    expect(facts).toContain('Saturn is Bala');
    expect(facts).not.toContain('Jupiter is'); // Yuva, so unremarkable
  });

  it('reports a planetary war with winner and loser named', () => {
    const chart = {
      planets: [
        { planet: 'Mars', signDegree: 10, signIndex: 0, longitude: 10, latitude: 1.5 },
        { planet: 'Venus', signDegree: 10.4, signIndex: 0, longitude: 10.4, latitude: 0.2 },
      ],
    };
    const facts = avasthaAndWarFacts(chart, planets).join('\n');
    expect(facts).toContain('Graha Yuddha');
    expect(facts).toContain('Mars defeats Venus');
  });
});
