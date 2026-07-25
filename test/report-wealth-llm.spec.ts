import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WealthScores } from '../src/lib/astro-engine/reports/wealth.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateWealthNarrative, translateWealthNarrative } = await import(
  '../src/lib/llm/reports/wealth.js'
);

function makeScores(overrides: Partial<WealthScores> = {}): WealthScores {
  return {
    wealthScore: 65,
    secondLordStrength: 'average',
    eleventhLordStrength: 'strong',
    jupiterStrength: 'average',
    jupiterHouse: 10,
    wealthPattern: 'volatile_gains',
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateWealthNarrative', () => {
  it('returns 2 sections from 1-2 LLM calls', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [
          { heading: 'Wealth Pattern', paragraphs: ['Gains arrive in bursts.'] },
          { heading: 'Practical Guidance', paragraphs: ['Consider steady saving habits.'] },
        ],
      }),
    );
    const sections = await generateWealthNarrative(makeScores());
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.heading)).toEqual(['Wealth Pattern', 'Practical Guidance']);
  });

  it('instructs the model NOT to give financial advice (disclaimer requirement)', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateWealthNarrative(makeScores());
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content.toLowerCase()).toContain('not financial advice');
  });

  it('embeds the given wealthScore/wealthPattern facts', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateWealthNarrative(makeScores({ wealthScore: 82, wealthPattern: 'steady_accumulation' }));
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('82');
    expect(content).toContain('steady_accumulation');
  });

  it('throws on an unparseable response', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateWealthNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateWealthNarrative', () => {
  const sections = [{ heading: 'Wealth Pattern', paragraphs: ['Gains arrive in bursts.'] }];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'हिंदी', paragraphs: ['अनुवाद'] }] }),
    );
    const translated = await translateWealthNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateWealthNarrative(sections, 'hi')).rejects.toThrow();
  });
});
