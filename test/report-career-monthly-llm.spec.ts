import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CareerMonthlyScores } from '../src/lib/astro-engine/reports/career-monthly.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateCareerMonthlyNarrative, translateCareerMonthlyNarrative } = await import(
  '../src/lib/llm/reports/career-monthly.js'
);

function makeScores(overrides: Partial<CareerMonthlyScores> = {}): CareerMonthlyScores {
  return {
    periodMonth: '2027-01',
    activeMahadashaLord: 'Jupiter',
    activeAntardashaLord: 'Mercury',
    monthScore: 75,
    keyHouses: [10, 6],
    tone: 'favorable',
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateCareerMonthlyNarrative', () => {
  it('returns 2 sections from 1 LLM call', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [
          { heading: "This Month's Outlook", paragraphs: ['A favorable month.'] },
          { heading: 'Practical Guidance', paragraphs: ['Push forward.'] },
        ],
      }),
    );
    const sections = await generateCareerMonthlyNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(2);
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

  it('throws on an unparseable response', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateCareerMonthlyNarrative(makeScores())).rejects.toThrow();
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
