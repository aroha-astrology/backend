import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CareerMonthlyScores } from '../src/lib/astro-engine/reports/career-monthly.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateCareerMonthlyNarrative, translateCareerMonthlyNarrative } =
  await import('../src/lib/llm/reports/career-monthly.js');

function makeScores(overrides: Partial<CareerMonthlyScores> = {}): CareerMonthlyScores {
  return {
    periodMonth: '2027-01',
    activeMahadashaLord: 'Jupiter',
    activeAntardashaLord: 'Mercury',
    monthScore: 75,
    keyHouses: [10, 6],
    tone: 'favorable',
    workArchetype: {
      label: 'Work Style Archetype',
      description:
        "Classically, this placement's sign (Gemini) suggests someone curious, communicative, and drawn to a mentally stimulating partner.",
      traits: [
        { label: 'Discipline', score: 6 },
        { label: 'Ambition', score: 9 },
        { label: 'Creativity', score: 6 },
        { label: 'Risk-tolerance', score: 3 },
        { label: 'Collaboration', score: 6 },
      ],
    },
    doshaYoga: {
      positives: [{ label: 'Raja Yoga', detail: 'strong, status-elevating' }],
      cautions: [],
    },
    industryFit: {
      likelyIndustries: ['communication', 'writing', 'trade', 'analytics'],
      note: 'Classical industry associations for the 10th-house lord, Mercury.',
    },
    subPeriods: [
      {
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        endDate: new Date('2027-01-12T00:00:00.000Z'),
        lord: 'Venus',
        score: 82,
      },
    ],
    ...overrides,
  } as unknown as CareerMonthlyScores;
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateCareerMonthlyNarrative', () => {
  it('returns 4 sections from 1 LLM call', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [
          { heading: "This Month's Outlook", paragraphs: ['A favorable month.'] },
          { heading: 'Your Work Style', paragraphs: ['Driven and disciplined.'] },
          { heading: "What's Supporting You", paragraphs: ['A Raja Yoga is present.'] },
          { heading: 'Industries That Fit', paragraphs: ['Communication and trade suit you.'] },
        ],
      }),
    );
    const sections = await generateCareerMonthlyNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(4);
  });

  it('embeds the given dasha lords and tone as GIVEN FACTS', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateCareerMonthlyNarrative(makeScores({ activeMahadashaLord: 'Saturn' }));
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Saturn');
    expect(content.toUpperCase()).toContain('GIVEN FACT');
  });

  it('embeds the workArchetype label/traits, doshaYoga, and industryFit list as facts', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateCareerMonthlyNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Work Style Archetype');
    expect(content).toContain('Discipline 6');
    expect(content).toContain('Raja Yoga');
    expect(content).toContain('communication, writing, trade, analytics');
    expect(content.toLowerCase()).toContain('never invent an industry');
  });

  it('tells the model to explain the absence of an industry list without naming one, when empty', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateCareerMonthlyNarrative(
      makeScores({
        industryFit: {
          likelyIndustries: [],
          note: '10th-house lord is unavailable on this chart.',
        },
      }),
    );
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Classically-associated industries: none available.');
  });

  it('embeds present dosha cautions (obstacles) as GIVEN FACTS, or "none" when absent (the doshaYoga.cautions gap fix)', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateCareerMonthlyNarrative(
      makeScores({
        doshaYoga: {
          positives: [],
          cautions: [{ label: 'Sade Sati', detail: 'peak phase, high severity' }],
        },
      }),
    );
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Sade Sati');
    expect(content).toContain('peak phase, high severity');
    expect(content.toLowerCase()).toContain('obstacle');

    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateCareerMonthlyNarrative(
      makeScores({ doshaYoga: { positives: [], cautions: [] } }),
    );
    const call2 = state.generate.mock.calls[1]?.[0];
    const content2 = call2.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content2).toContain('Doshas present: none.');
  });

  it('throws on an unparseable response', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateCareerMonthlyNarrative(makeScores())).rejects.toThrow();
  });

  it('embeds the given within-month sub-periods as facts — answers "specific dates this month best for important career moves"', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateCareerMonthlyNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Venus');
    expect(content).toContain('82');
    expect(content.toLowerCase()).toContain('specific dates');
  });

  it('instructs the model to describe how colleagues/superiors will treat you this month', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateCareerMonthlyNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('colleagues');
    expect(content.toLowerCase()).toContain('superiors');
  });

  it('instructs the model to apply the work-style archetype specifically to how this month plays out, not just describe it as an abstract trait', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateCareerMonthlyNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain("how you'll handle this month");
  });
});

describe('translateCareerMonthlyNarrative', () => {
  const sections = [{ heading: "This Month's Outlook", paragraphs: ['A favorable month.'] }];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'हिंदी', paragraphs: ['अनुवाद'] }] }),
    );
    const translated = await translateCareerMonthlyNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateCareerMonthlyNarrative(sections, 'hi')).rejects.toThrow();
  });
});
