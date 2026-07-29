import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthMonthlyScores } from '../src/lib/astro-engine/reports/health-monthly.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateHealthMonthlyNarrative, translateHealthMonthlyNarrative } =
  await import('../src/lib/llm/reports/health-monthly.js');

function makeScores(overrides: Partial<HealthMonthlyScores> = {}): HealthMonthlyScores {
  return {
    periodMonth: '2027-01',
    activeMahadashaLord: 'Jupiter',
    activeAntardashaLord: 'Saturn',
    monthScore: 60,
    keyHouses: [6, 1, 8],
    tone: 'mixed',
    doshaYoga: { positives: [], cautions: [] },
    subPeriods: [
      {
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        endDate: new Date('2027-01-10T00:00:00.000Z'),
        lord: 'Mars',
        score: 30,
      },
      {
        startDate: new Date('2027-01-10T00:00:00.000Z'),
        endDate: new Date('2027-02-01T00:00:00.000Z'),
        lord: 'Venus',
        score: 80,
      },
    ],
    connectedHouses: [8],
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateHealthMonthlyNarrative', () => {
  it('returns 3 sections from 1 LLM call', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [
          { heading: "This Month's Outlook", paragraphs: ['A mixed month.'] },
          { heading: 'What To Be Mindful Of', paragraphs: ['No doshas present.'] },
          { heading: 'Practical Guidance', paragraphs: ['Rest well.'] },
        ],
      }),
    );
    const sections = await generateHealthMonthlyNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(3);
  });

  it('instructs the model this is NOT medical advice', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateHealthMonthlyNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('not medical advice');
  });

  it('embeds the given dasha lords and tone', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateHealthMonthlyNarrative(
      makeScores({ activeMahadashaLord: 'Venus', tone: 'favorable' }),
    );
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Venus');
    expect(content).toContain('favorable');
  });

  it('embeds present doshas as GIVEN FACTS, or "none" when absent', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateHealthMonthlyNarrative(
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

    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateHealthMonthlyNarrative(
      makeScores({ doshaYoga: { positives: [], cautions: [] } }),
    );
    const call2 = state.generate.mock.calls[1]?.[0];
    const content2 = call2.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content2).toContain('Doshas present: none.');
  });

  it('embeds present supportive/protective factors as GIVEN FACTS, or "none" when absent (the doshaYoga.positives gap fix)', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateHealthMonthlyNarrative(
      makeScores({
        doshaYoga: {
          positives: [{ label: 'Malavya Yoga', detail: 'strong, Venus in own sign' }],
          cautions: [],
        },
      }),
    );
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Malavya Yoga');
    expect(content).toContain('strong, Venus in own sign');

    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateHealthMonthlyNarrative(
      makeScores({ doshaYoga: { positives: [], cautions: [] } }),
    );
    const call2 = state.generate.mock.calls[1]?.[0];
    const content2 = call2.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content2).toContain('Supportive/protective factors present: none.');
  });

  it('extends the "not medical advice" disclaimer to explicitly cover the dosha section', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateHealthMonthlyNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('not medical advice');
    expect(content).toContain('INCLUDING the dosha/yoga facts section');
    expect(content.toLowerCase()).toContain('never name a specific disease');
  });

  it('throws on an unparseable response', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateHealthMonthlyNarrative(makeScores())).rejects.toThrow();
  });

  it('embeds the given within-month sub-periods (dates, lord, score) as facts — answers "specific weeks I should be extra careful about"', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateHealthMonthlyNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Mars');
    expect(content).toContain('30');
    expect(content).toContain('Venus');
    expect(content).toContain('80');
    expect(content.toLowerCase()).toContain('specific weeks');
  });

  it('states plainly when no sub-periods are available, rather than silently omitting the question', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateHealthMonthlyNarrative(makeScores({ subPeriods: [] }));
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('no week-level breakdown');
  });

  it('embeds the given connectedHouses as the specific area needing attention', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateHealthMonthlyNarrative(makeScores({ connectedHouses: [6, 1] }));
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('which health areas need the most attention');
  });
});

describe('translateHealthMonthlyNarrative', () => {
  const sections = [{ heading: "This Month's Outlook", paragraphs: ['A mixed month.'] }];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'हिंदी', paragraphs: ['अनुवाद'] }] }),
    );
    const translated = await translateHealthMonthlyNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateHealthMonthlyNarrative(sections, 'hi')).rejects.toThrow();
  });
});
