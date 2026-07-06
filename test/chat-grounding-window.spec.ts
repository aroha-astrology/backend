import { describe, expect, it } from 'vitest';
import { buildGroundingFacts, type GroundingSource } from '../src/lib/chat-grounding.js';

/** Same synthetic mahadasha sequence as test/dasha-window.spec.ts. */
function makeDasha(now: Date) {
  const planets = ['Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus'];
  const years: Record<string, number> = {
    Sun: 6,
    Moon: 10,
    Mars: 7,
    Rahu: 18,
    Jupiter: 16,
    Saturn: 19,
    Mercury: 17,
    Ketu: 7,
    Venus: 20,
  };
  let cursor = new Date(now.getTime());
  const mahadashas = planets.map((planet) => {
    const startDate = new Date(cursor.getTime());
    const endDate = new Date(cursor.getTime() + years[planet]! * 365.25 * 86_400_000);
    cursor = endDate;
    return {
      planet,
      startDate,
      endDate,
      isActive: false,
      level: 'mahadasha' as const,
      subPeriods: [],
    };
  });
  mahadashas[0]!.isActive = true;
  return { vimshottari: { mahadashas, currentMahadasha: mahadashas[0] } };
}

function chartWithSeventhLordVenus(): Record<string, unknown> {
  const houses = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((house) => ({
    house,
    lord: house === 7 ? 'Venus' : 'Mars',
    sign: 'Aries',
  }));
  return { houses, planets: [], ascendant: { sign: 'Aries', signIndex: 0 } };
}

describe('buildGroundingFacts forward-looking favorable windows', () => {
  it('surfaces a marriage window fact when Venus (7th lord) appears in the dasha lookahead', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const src: GroundingSource = {
      chart: chartWithSeventhLordVenus(),
      dasha: makeDasha(now),
      yogas: null,
      doshas: null,
      ashtakavarga: null,
    };
    const facts = await buildGroundingFacts(src);
    expect(facts.some((f) => /Nearest traditionally favorable window for marriage/.test(f))).toBe(
      true,
    );
  });

  it('omits the marriage window fact when the dasha has no data', async () => {
    const src: GroundingSource = {
      chart: chartWithSeventhLordVenus(),
      dasha: null,
      yogas: null,
      doshas: null,
      ashtakavarga: null,
    };
    const facts = await buildGroundingFacts(src);
    expect(facts.some((f) => /favorable window/.test(f))).toBe(false);
  });
});
