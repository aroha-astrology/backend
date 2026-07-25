import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceMonthlyScores } from '../src/lib/astro-engine/reports/finance-monthly.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateFinanceMonthlyNarrative, translateFinanceMonthlyNarrative } = await import(
  '../src/lib/llm/reports/finance-monthly.js'
);

function makeScores(overrides: Partial<FinanceMonthlyScores> = {}): FinanceMonthlyScores {
  return {
    periodMonth: '2027-01',
    activeMahadashaLord: 'Venus',
    activeAntardashaLord: 'Mercury',
    monthScore: 60,
    keyHouses: [2, 11],
    tone: 'mixed',
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateFinanceMonthlyNarrative', () => {
  it('returns 2 sections from 1 LLM call', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [
          { heading: "This Month's Outlook", paragraphs: ['A mixed money month.'] },
          { heading: 'Practical Guidance', paragraphs: ['Stay measured.'] },
        ],
      }),
    );
    const sections = await generateFinanceMonthlyNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(2);
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
