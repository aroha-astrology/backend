import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompatibilityFacts } from '../src/lib/astro-engine/compatibility.js';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generateCompatibilityNarrative, translateCompatibilityContent } =
  await import('../src/lib/llm/compatibility-report.js');

const FACTS: CompatibilityFacts = {
  totalScore: 24,
  maxScore: 36,
  compatibility: 'Good',
  kutaDetails: [
    { name: 'Varna', obtained: 1, maximum: 1, description: 'Ego and work compatibility.' },
    { name: 'Nadi', obtained: 8, maximum: 8, description: 'Health of progeny.' },
  ],
  flags: { nadiDosha: false, bhakootDosha: false },
  mangalDosha: { person1: false, person2: false, matched: true },
  recommendation:
    'No Nadi, Bhakoot, or Mangal Dosha mismatch was found, and the overall Guna score is strong.',
};

const VALID_JSON = JSON.stringify({
  intro: 'The two of you naturally balance each other in how you approach daily life.',
  kootaHighlight:
    'Your Nadi score is a perfect match, which traditionally supports long-term harmony.',
  overallStory: 'Overall the chart comparison points to a steady, complementary connection.',
  guidance: 'Keep communicating openly during the early stages, as your styles differ in pace.',
});

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateCompatibilityNarrative', () => {
  it('returns the parsed narrative + model', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    const result = await generateCompatibilityNarrative({ facts: FACTS, partnerLabel: 'Riya' });

    expect(result.intro).toContain('balance');
    expect(result.kootaHighlight).toContain('Nadi');
    expect(result.overallStory).toBeTruthy();
    expect(result.guidance).toBeTruthy();
    expect(result.model).toBeTruthy();
  });

  it('feeds the deterministic facts (score, kootas, recommendation) into the grounding context', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    await generateCompatibilityNarrative({ facts: FACTS, partnerLabel: 'Riya' });

    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain('24');
    expect(groundingMessage.content).toContain('Nadi');
    expect(groundingMessage.content).toContain('Riya');
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(
      generateCompatibilityNarrative({ facts: FACTS, partnerLabel: 'Riya' }),
    ).rejects.toThrow('compatibility LLM returned unparseable JSON');
  });

  it('throws when a required narrative field is missing', async () => {
    state.generate.mockResolvedValueOnce(JSON.stringify({ intro: 'only an intro' }));

    await expect(
      generateCompatibilityNarrative({ facts: FACTS, partnerLabel: 'Riya' }),
    ).rejects.toThrow('compatibility LLM returned unparseable JSON');
  });
});

describe('translateCompatibilityContent', () => {
  const original = {
    intro: 'The two of you naturally balance each other in how you approach daily life.',
    kootaHighlight:
      'Your Nadi score is a perfect match, which traditionally supports long-term harmony.',
    overallStory: 'Overall the chart comparison points to a steady, complementary connection.',
    guidance: 'Keep communicating openly during the early stages, as your styles differ in pace.',
  };

  it('returns the translated narrative on a valid response', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'नमस्ते',
        kootaHighlight: 'नाड़ी',
        overallStory: 'कहानी',
        guidance: 'मार्गदर्शन',
      }),
    );

    const result = await translateCompatibilityContent(original, 'hi');
    expect(result.intro).toBe('नमस्ते');
    expect(result.guidance).toBe('मार्गदर्शन');
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translateCompatibilityContent(original, 'hi')).rejects.toThrow(
      'compatibility translation returned unparseable JSON (target=hi)',
    );
  });
});
