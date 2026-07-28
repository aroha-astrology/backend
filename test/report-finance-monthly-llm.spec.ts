import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceMonthlyScores } from '../src/lib/astro-engine/reports/finance-monthly.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateFinanceMonthlyNarrative, translateFinanceMonthlyNarrative } =
  await import('../src/lib/llm/reports/finance-monthly.js');

function makeScores(overrides: Partial<FinanceMonthlyScores> = {}): FinanceMonthlyScores {
  return {
    periodMonth: '2027-01',
    activeMahadashaLord: 'Venus',
    activeAntardashaLord: 'Mercury',
    monthScore: 60,
    keyHouses: [2, 11],
    tone: 'mixed',
    doshaYoga: {
      positives: [{ label: 'Dhana Yoga', detail: 'Wealth-giving combination.' }],
      cautions: [],
    },
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateFinanceMonthlyNarrative', () => {
  it('returns 3 sections from 1 LLM call', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [
          { heading: "This Month's Outlook", paragraphs: ['A mixed money month.'] },
          {
            heading: 'Dosha & Yoga Check',
            paragraphs: ['A Dhana Yoga supports gains this month.'],
          },
          { heading: 'Practical Guidance', paragraphs: ['Stay measured.'] },
        ],
      }),
    );
    const sections = await generateFinanceMonthlyNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(3);
  });

  it('instructs the model this is NOT financial advice', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateFinanceMonthlyNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('not financial advice');
  });

  it('embeds the given doshaYoga facts, never inventing a finding when both are empty', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateFinanceMonthlyNarrative(
      makeScores({ doshaYoga: { positives: [], cautions: [] } }),
    );
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('none found');
  });

  it('embeds a present Dhana yoga fact verbatim', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateFinanceMonthlyNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Dhana Yoga');
    expect(content).toContain('Wealth-giving combination.');
  });

  it('embeds a present dosha caution fact verbatim and instructs framing it as a money-stress heads-up (the dosha-caution instruction gap fix)', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateFinanceMonthlyNarrative(
      makeScores({
        doshaYoga: {
          positives: [],
          cautions: [{ label: 'Kemdruma Dosha', detail: 'moderate severity' }],
        },
      }),
    );
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('Kemdruma Dosha');
    expect(content).toContain('moderate severity');
    expect(content.toLowerCase()).toContain('money stress');
  });

  it('throws on an unparseable response', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateFinanceMonthlyNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateFinanceMonthlyNarrative', () => {
  const sections = [{ heading: "This Month's Outlook", paragraphs: ['A mixed money month.'] }];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'हिंदी', paragraphs: ['अनुवाद'] }] }),
    );
    const translated = await translateFinanceMonthlyNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateFinanceMonthlyNarrative(sections, 'hi')).rejects.toThrow();
  });
});
