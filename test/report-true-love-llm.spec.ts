import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrueLoveScores } from '../src/lib/astro-engine/reports/true-love.js';

const state = vi.hoisted(() => ({ generate: vi.fn() }));

vi.mock('../src/lib/llm/gemini-client.js', () => ({ generate: state.generate }));

const { generateTrueLoveNarrative, translateTrueLoveNarrative } = await import(
  '../src/lib/llm/reports/true-love.js'
);

function makeScores(overrides: Partial<TrueLoveScores> = {}): TrueLoveScores {
  return {
    romanceScore: 75,
    partnershipScore: 60,
    venusInKeyHouse: true,
    loveVsArrangedTilt: 7,
    ...overrides,
  };
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateTrueLoveNarrative', () => {
  it('makes exactly 1 LLM call for both sections', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        sections: [
          { heading: 'What This Means For You', paragraphs: ['A hybrid leaning.'] },
          { heading: 'Family Blessing', paragraphs: ['Family looks supportive.'] },
        ],
      }),
    );
    const sections = await generateTrueLoveNarrative(makeScores());
    expect(state.generate).toHaveBeenCalledTimes(1);
    expect(sections).toHaveLength(2);
  });

  it('embeds the given tilt/romance/partnership facts as GIVEN FACTS', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'H', paragraphs: ['p'] }] }),
    );
    await generateTrueLoveNarrative(makeScores({ loveVsArrangedTilt: 9, romanceScore: 88 }));
    const call = state.generate.mock.calls[0]?.[0];
    const content = call.messages.map((m: { content: string }) => m.content).join('\n');
    expect(content).toContain('9');
    expect(content).toContain('88');
    expect(content.toUpperCase()).toContain('GIVEN FACT');
  });

  it('throws on an unparseable response', async () => {
    state.generate.mockResolvedValueOnce('not json');
    await expect(generateTrueLoveNarrative(makeScores())).rejects.toThrow();
  });
});

describe('translateTrueLoveNarrative', () => {
  const sections = [{ heading: 'What This Means For You', paragraphs: ['A hybrid leaning.'] }];

  it('parses a valid translated response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ sections: [{ heading: 'हिंदी', paragraphs: ['अनुवाद'] }] }),
    );
    const translated = await translateTrueLoveNarrative(sections, 'hi');
    expect(translated[0]?.heading).toBe('हिंदी');
  });

  it('throws on an unparseable translated response', async () => {
    state.generate.mockResolvedValueOnce('garbage');
    await expect(translateTrueLoveNarrative(sections, 'hi')).rejects.toThrow();
  });
});
