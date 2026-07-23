import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generateAscendantReport } = await import('../src/lib/llm/flagship-ascendant-report.js');

const VALID_CTX = {
  ascendantSign: 'Leo',
  lordPlanet: 'Sun',
  lordSign: 'Aries',
  lordHouse: 9,
};

const VALID_JSON = JSON.stringify({
  intro: 'Your Leo rising gives you a natural warmth people notice right away.',
  personalityTraits: 'You carry yourself with quiet confidence and a strong sense of self.',
  appearance: 'You tend to have a commanding, well-put-together presence.',
  temperament: 'You approach challenges head-on, favoring bold action over hesitation.',
});

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateAscendantReport', () => {
  it('returns the parsed narrative + model', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    const result = await generateAscendantReport(VALID_CTX);

    expect(result.intro).toContain('Leo rising');
    expect(result.personalityTraits).toBeTruthy();
    expect(result.appearance).toBeTruthy();
    expect(result.temperament).toBeTruthy();
    expect(result.model).toBeTruthy();
  });

  it('includes the ascendant sign and lord placement facts in the astro_context block', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    await generateAscendantReport(VALID_CTX);

    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain('Ascendant (Rising) sign: Leo');
    expect(groundingMessage.content).toContain('Ascendant lord: Sun');
    expect(groundingMessage.content).toContain('house 9');
    expect(groundingMessage.content).toContain('Aries');
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(generateAscendantReport(VALID_CTX)).rejects.toThrow(
      'flagship ascendant LLM returned unparseable JSON',
    );
  });

  it('throws when a required narrative field is missing', async () => {
    state.generate.mockResolvedValueOnce(JSON.stringify({ intro: 'only an intro' }));

    await expect(generateAscendantReport(VALID_CTX)).rejects.toThrow(
      'flagship ascendant LLM returned unparseable JSON',
    );
  });
});
