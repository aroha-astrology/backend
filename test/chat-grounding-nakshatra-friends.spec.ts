import { describe, expect, it } from 'vitest';
import { buildGroundingFacts, type GroundingSource } from '../src/lib/chat-grounding.js';

function chartWithMoonNakshatra(): Record<string, unknown> {
  const houses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((house) => ({
    house,
    lord: 'Mars',
    sign: 'Aries',
  }));
  return {
    houses,
    ascendant: { sign: 'Aries', signIndex: 0 },
    planets: [
      {
        planet: 'Moon',
        sign: 'Taurus',
        signIndex: 1,
        house: 2,
        nakshatra: 'Rohini',
        nakshatraPada: 3,
        nakshatraLord: 'Moon',
      },
    ],
  };
}

describe('buildGroundingFacts — Janma Nakshatra', () => {
  it('surfaces the natal Moon nakshatra as a Janma Nakshatra fact', async () => {
    const src: GroundingSource = {
      chart: chartWithMoonNakshatra(),
      dasha: null,
      yogas: null,
      doshas: null,
      ashtakavarga: null,
    };
    const facts = await buildGroundingFacts(src);
    const nakshatraFact = facts.find((f) => f.startsWith('Janma Nakshatra'));
    expect(nakshatraFact).toBeDefined();
    expect(nakshatraFact).toContain('Rohini');
    expect(nakshatraFact).toContain('pada 3');
    expect(nakshatraFact).toContain('Moon');
  });

  it('omits the fact when the chart has no nakshatra data on the Moon', async () => {
    const chart = chartWithMoonNakshatra();

    (chart.planets as any[])[0].nakshatra = undefined;
    const src: GroundingSource = {
      chart,
      dasha: null,
      yogas: null,
      doshas: null,
      ashtakavarga: null,
    };
    const facts = await buildGroundingFacts(src);
    expect(facts.some((f) => f.startsWith('Janma Nakshatra'))).toBe(false);
  });
});

describe('buildGroundingFacts — Friendships domain', () => {
  it('always emits a Friendships/Community Window Confidence fact', async () => {
    const src: GroundingSource = {
      chart: chartWithMoonNakshatra(),
      dasha: null,
      yogas: null,
      doshas: null,
      ashtakavarga: null,
    };
    const facts = await buildGroundingFacts(src);
    expect(facts.some((f) => f.startsWith('Friendships/Community Window Confidence'))).toBe(true);
  });
});
