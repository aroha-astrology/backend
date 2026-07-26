import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RelationshipMonthlyScores } from '../src/lib/astro-engine/reports/relationship-monthly.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateRelationshipMonthlyNarrative, translateRelationshipMonthlyNarrative } =
  await import('../src/lib/llm/reports/relationship-monthly.js');

function makeScores(overrides: Partial<RelationshipMonthlyScores> = {}): RelationshipMonthlyScores {
  return {
    periodMonth: '2027-01',
    activeMahadashaLord: 'Venus',
    activeAntardashaLord: 'Moon',
    monthScore: 80,
    keyHouses: [7, 5],
    tone: 'favorable',
    doshaYoga: { positives: [], cautions: [] },
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateRelationshipMonthlyNarrative', () => {
  it('returns 3 sections from 1 LLM call', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [
          { heading: "This Month's Outlook", paragraphs: ['A favorable month for connection.'] },
          { heading: 'Practical Guidance', paragraphs: ['Make time together.'] },
          { heading: 'Blessings & Cautions', paragraphs: ['Nothing notable was flagged.'] },
        ],
      }),
    );
    const sections = await generateRelationshipMonthlyNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(3);
  });

  it('embeds the given dasha lords and tone as GIVEN FACTS', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateRelationshipMonthlyNarrative(makeScores({ activeAntardashaLord: 'Mars' }));
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Mars');
    expect(content.toUpperCase()).toContain('GIVEN FACT');
  });

  it('embeds a Mangal Dosha caution as a GIVEN FACT when present', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateRelationshipMonthlyNarrative(
      makeScores({
        doshaYoga: {
          positives: [],
          cautions: [{ label: 'Mangal Dosha', detail: 'high severity' }],
        },
      }),
    );
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Mangal Dosha');
  });

  it('states plainly that no standing caution was flagged when doshaYoga.cautions is empty', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateRelationshipMonthlyNarrative(
      makeScores({ doshaYoga: { positives: [], cautions: [] } }),
    );
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('No standing dosha caution was flagged');
  });

  it('throws on an unparseable response', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateRelationshipMonthlyNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateRelationshipMonthlyNarrative', () => {
  const sections = [
    { heading: "This Month's Outlook", paragraphs: ['A favorable month for connection.'] },
  ];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'हिंदी', paragraphs: ['अनुवाद'] }] }),
    );
    const translated = await translateRelationshipMonthlyNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateRelationshipMonthlyNarrative(sections, 'hi')).rejects.toThrow();
  });
});
