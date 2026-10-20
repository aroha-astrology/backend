import { describe, it, expect } from 'vitest';
import {
  calculateChart,
  calculateVimshottariDasha,
  detectAllYogas,
  calculateAshtakavarga,
} from '../src/lib/astro-engine/index.js';
import { analyzeAllDoshas } from '../src/lib/astro-engine/doshas/index.js';
import { buildGroundingFacts, type GroundingSource } from '../src/lib/chat-grounding.js';

/**
 * Bug (2026-10-20, owner's phone): asked about Jupiter's move into Leo, Baba Ji
 * said "August 8, 2027". The real ingress is 31 Oct 2026 (Drik Panchang: 12:50 PM
 * IST, the engine 12:03). Chat only ever saw today's sign per planet, so it had
 * no date to quote and invented one. These assert the chat grounding now carries
 * the real dates, with the house for the user's own chart.
 */
const SLOW = 120_000;
const NOW = new Date('2026-10-20T09:00:00Z'); // 14:30 IST, the day of the report

async function sourceFor(): Promise<GroundingSource> {
  const chart = await calculateChart(1985, 3, 12, 4, 32, 5.5, 19.076, 72.8777);
  const moon = chart.planets.find((p) => p.planet === 'Moon')!;
  const saturn = chart.planets.find((p) => p.planet === 'Saturn')!;
  return {
    chart: chart as unknown as Record<string, unknown>,
    dasha: {
      vimshottari: calculateVimshottariDasha(
        moon.longitude,
        new Date(Date.UTC(1985, 2, 11, 23, 2)),
      ),
    },
    yogas: { yogas: detectAllYogas(chart) },
    doshas: analyzeAllDoshas(chart, saturn.longitude) as unknown as Record<string, unknown>,
    ashtakavarga: calculateAshtakavarga(chart) as unknown as Record<string, unknown>,
  };
}

describe('chat grounding: upcoming transit dates', () => {
  it(
    'gives chat the real Jupiter, Saturn and Rahu dates, with nakshatra and house',
    async () => {
      const src = await sourceFor();
      const chart = src.chart as unknown as {
        ascendant: { signIndex: number };
        planets: Array<{ planet: string; signIndex: number }>;
      };
      const asc = chart.ascendant.signIndex;
      const moon = chart.planets.find((p) => p.planet === 'Moon')!.signIndex;
      const leo = 4;
      const house = (sign: number, from: number) => ((sign - from + 12) % 12) + 1;

      const facts = await buildGroundingFacts(src, undefined, NOW, null, undefined, 'full');
      const jupiter = facts.find((f) => f.startsWith('Jupiter — now in Cancer'));
      expect(jupiter, 'no Jupiter transit line in the chat grounding').toBeDefined();

      // Dates checked against Drik Panchang (New Delhi) on 2026-10-20.
      expect(jupiter).toContain(
        `enters Leo 31 Oct 2026, 12:03 IST (Magha nakshatra; house ${house(leo, asc)} from your Lagna, house ${house(leo, moon)} from your Moon)`,
      );
      expect(jupiter).toContain('turns retrograde 13 Dec 2026');
      expect(jupiter).toContain('moves back into Cancer 25 Jan 2027');
      expect(jupiter).toContain('enters Leo 26 Jun 2027');
      expect(jupiter).toContain('enters Virgo 26 Nov 2027');
      expect(jupiter).not.toContain('8 Aug 2027'); // the date chat made up

      const saturn = facts.find((f) => f.startsWith('Saturn — '));
      expect(saturn).toContain('enters Aries 3 Jun 2027');
      expect(saturn).toContain('moves back into Pisces 20 Oct 2027');
      const rahu = facts.find((f) => f.startsWith('Rahu — '));
      expect(rahu).toContain('enters Capricorn 5 Dec 2026');
      const ketu = facts.find((f) => f.startsWith('Ketu — '));
      expect(ketu).toContain('enters Cancer 5 Dec 2026');

      // The whole fact set must fit the chat prompt's 36,000-char clip
      // (MAX_CONTEXT_CHARS in scholar.ts), with room for the extra facts
      // appended after it, or the tail is silently cut.
      const block = facts.map((f) => `- ${f}`).join('\n');
      expect(block.indexOf('UPCOMING TRANSITS')).toBeGreaterThan(-1);
      expect(block.length).toBeLessThan(36_000 - 3_000);
    },
    SLOW,
  );

  it(
    'leaves the horoscope (periodic scope) unchanged',
    async () => {
      const facts = await buildGroundingFacts(
        await sourceFor(),
        '2026-10-20',
        NOW,
        null,
        undefined,
        'periodic',
      );
      expect(facts.some((f) => f.startsWith('UPCOMING TRANSITS'))).toBe(false);
    },
    SLOW,
  );
});
