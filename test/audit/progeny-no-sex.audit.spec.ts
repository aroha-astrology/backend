import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computeProgenyScores } from '../../src/lib/astro-engine/reports/progeny.js';
import type { ReportScoreContext } from '../../src/modules/reports/report-generator.types.js';

// =============================================================================
// Audit safety flag SF2 (docs/engine-audit/A-executive-verdict.md)
// =============================================================================
// The progeny report must not tell the reader the sex of a child, a lean towards a son or a
// daughter, or how many children they will have. No old text the audit opened gives a rule for
// either, and announcing a child's sex is a legal and reputational risk in India. The sex tally
// and the supported count stay inside the engine (they feed the coarse promise band); the
// narrative is not given them and is told never to say them.
// =============================================================================

const state = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock('../../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));
const { generateProgenyNarrative } = await import('../../src/lib/llm/reports/progeny.js');

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
const LORDS = [
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
];

function makeChart(overrides: Record<string, number> = {}): Record<string, unknown> {
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
  const signOf = (lon: number) => SIGNS[Math.floor((((lon % 360) + 360) % 360) / 30)];
  return {
    ascendant: { signIndex: 0, degree: 0, sign: 'Aries' },
    planets: Object.entries(longitudes).map(([planet, longitude]) => ({
      planet,
      longitude,
      sign: signOf(longitude),
    })),
    houses: SIGNS.map((sign, i) => ({ house: i + 1, sign, lord: LORDS[i] })),
  };
}

function ctxFor(dob: string): ReportScoreContext {
  return {
    chart: makeChart(),
    partnerChart: makeChart({ Sun: 200, Moon: 260, Jupiter: 20 }),
    personDob: dob,
    personGender: 'female',
    partnerName: 'Test Spouse',
  };
}

function sentToModel(): string {
  return state.generate.mock.calls
    .map((call) => (call[0].messages as { content: string }[]).map((m) => m.content).join('\n'))
    .join('\n');
}

const anySections = JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] });

describe('[SF2] the progeny narrative is given no sex and no count of children', () => {
  beforeEach(() => {
    state.generate.mockReset();
    state.generate.mockResolvedValue(anySections);
  });

  it.each([
    ['a reader under 35', '2000-01-01'],
    ['a reader 35 or older, who gets the children card', '1980-01-01'],
  ])(
    '%s: no sex tally, tendency, likely count or supported count in the facts',
    async (_n, dob) => {
      const scores = computeProgenyScores(ctxFor(dob), null);
      // The engine still computes them inside the stored scores.
      expect(scores.childSequence).not.toBeNull();
      await generateProgenyNarrative(scores);
      const sent = sentToModel();
      expect(sent).not.toMatch(/sex tally/i);
      expect(sent).not.toMatch(/male indications/i);
      expect(sent).not.toMatch(/tendency: (male|female|inconclusive)/i);
      expect(sent).not.toMatch(/Likely count/i);
      expect(sent).not.toMatch(/supports roughly/i);
      expect(sent).not.toMatch(/leans toward a daughter/i);
    },
  );

  it('every call carries the rule: never a sex, never a number of children', async () => {
    await generateProgenyNarrative(computeProgenyScores(ctxFor('1980-01-01'), null));
    expect(state.generate).toHaveBeenCalledTimes(3);
    for (const call of state.generate.mock.calls) {
      const all = (call[0].messages as { content: string }[]).map((m) => m.content).join('\n');
      expect(all).toMatch(/Never say or hint whether a child is or will be a son or a daughter/);
      expect(all).toMatch(/never say how many children/);
    }
  });
});
