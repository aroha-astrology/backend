import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PastLifeScores } from '../src/lib/astro-engine/reports/past-life.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generatePastLifeNarrative, translatePastLifeNarrative } = await import(
  '../src/lib/llm/reports/past-life.js'
);

function makeScores(overrides: Partial<PastLifeScores> = {}): PastLifeScores {
  return {
    rahuHouse: 3,
    rahuSign: 'Gemini',
    ketuHouse: 9,
    ketuSign: 'Sagittarius',
    twelfthLordStrength: 'average',
    conjunctPlanets: [],
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generatePastLifeNarrative', () => {
  it('makes exactly 1 LLM call (thinnest-margin report — kept to 1 call)', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'Your Karmic Pattern', paragraphs: ['A pattern.'] }] }),
    );
    await generatePastLifeNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
  });

  it('returns the single "Your Karmic Pattern" section', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'Your Karmic Pattern', paragraphs: ['A pattern.'] }] }),
    );
    const sections = await generatePastLifeNarrative(makeScores());
    expect(sections).toHaveLength(1);
    expect(sections[0]?.heading).toBe('Your Karmic Pattern');
  });

  it('embeds the given Rahu/Ketu house+sign facts', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generatePastLifeNarrative(makeScores({ rahuHouse: 7, rahuSign: 'Libra' }));
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('7');
    expect(content).toContain('Libra');
  });

  it('throws on an unparseable response rather than returning filler', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generatePastLifeNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translatePastLifeNarrative', () => {
  const sections = [{ heading: 'Your Karmic Pattern', paragraphs: ['A pattern.'] }];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'हिंदी', paragraphs: ['पैटर्न'] }] }),
    );
    const translated = await translatePastLifeNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translatePastLifeNarrative(sections, 'hi')).rejects.toThrow();
  });
});
