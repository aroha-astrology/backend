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
    subPeriods: [
      {
        startDate: new Date('2027-01-05T00:00:00.000Z'),
        endDate: new Date('2027-01-20T00:00:00.000Z'),
        lord: 'Venus',
        score: 88,
      },
    ],
    ...overrides,
  } as unknown as RelationshipMonthlyScores;
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateRelationshipMonthlyNarrative', () => {
  it('returns 4 sections from 1 LLM call', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [
          { heading: "This Month's Outlook", paragraphs: ['A favorable month for connection.'] },
          { heading: 'Practical Guidance', paragraphs: ['Make time together.'] },
          { heading: 'Blessings & Cautions', paragraphs: ['Nothing notable was flagged.'] },
          {
            heading: 'Friction, Reconciliation & Dating',
            paragraphs: [
              'Some friction is possible; reconciliation looks supported; singles should stay open.',
            ],
          },
        ],
      }),
    );
    const sections = await generateRelationshipMonthlyNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(4);
    expect(sections.map((s) => s.heading)).toEqual([
      "This Month's Outlook",
      'Practical Guidance',
      'Blessings & Cautions',
      'Friction, Reconciliation & Dating',
    ]);
  });

  it('instructs the model to cover friction causes, reconciliation timing, and single/dating readers in the 4th section using the same given facts (no new fact needed)', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateRelationshipMonthlyNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('friction');
    expect(content.toLowerCase()).toContain('reconciliation');
    expect(content.toLowerCase()).toContain('single');
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

  it('embeds the given within-month sub-periods as facts — answers "specific days this month best for important relationship talks", the previously-flagged gap', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateRelationshipMonthlyNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Venus');
    expect(content).toContain('88');
    expect(content.toLowerCase()).toContain('specific days');
  });

  it('instructs the model to give a pointer for strengthening emotional closeness this month', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateRelationshipMonthlyNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('emotional closeness');
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
