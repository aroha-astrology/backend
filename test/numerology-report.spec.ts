import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generateNumerologyReport, translateNumerologyContent } =
  await import('../src/lib/llm/numerology-report.js');

const VALID_JSON = JSON.stringify({
  intro: 'Your numbers point to a life built on steady, patient effort.',
  lifePathStory: 'You keep circling back to the same lesson: finish what you start.',
  expressionStory: 'People already come to you first when something needs organizing.',
  soulUrgeStory: 'Underneath the plans, what you actually want is to feel needed.',
  personalityStory: 'Strangers read you as calm before they ever hear you speak.',
});

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateNumerologyReport', () => {
  it('computes the deterministic numbers and returns the parsed narrative + model', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    const result = await generateNumerologyReport({
      dateOfBirth: '1993-04-17',
      fullName: 'Subir Dutta',
    });

    expect(result.intro).toContain('steady');
    expect(result.lifePathStory).toContain('finish');
    expect(result.model).toBeTruthy();
  });

  it('feeds the computed numbers into the grounding context sent to Gemini', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    await generateNumerologyReport({ dateOfBirth: '1993-04-17', fullName: 'Subir Dutta' });

    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain('Life Path number:');
    expect(groundingMessage.content).toContain('Lucky numbers:');
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(
      generateNumerologyReport({ dateOfBirth: '1993-04-17', fullName: 'Subir Dutta' }),
    ).rejects.toThrow('numerology LLM returned unparseable JSON');
  });

  it('throws when a required narrative field is missing from an otherwise-valid JSON response', async () => {
    state.generate.mockResolvedValueOnce(JSON.stringify({ intro: 'Only an intro, nothing else.' }));

    await expect(
      generateNumerologyReport({ dateOfBirth: '1993-04-17', fullName: 'Subir Dutta' }),
    ).rejects.toThrow('numerology LLM returned unparseable JSON');
  });
});

describe('translateNumerologyContent', () => {
  const original = {
    intro: 'Your numbers point to a life built on steady, patient effort.',
    lifePathStory: 'You keep circling back to the same lesson: finish what you start.',
    expressionStory: 'People already come to you first when something needs organizing.',
    soulUrgeStory: 'Underneath the plans, what you actually want is to feel needed.',
    personalityStory: 'Strangers read you as calm before they ever hear you speak.',
  };

  it('returns the translated narrative on a valid response', async () => {
    const translated = {
      intro: 'नमस्ते इंट्रो',
      lifePathStory: 'लाइफ पाथ कहानी',
      expressionStory: 'एक्सप्रेशन कहानी',
      soulUrgeStory: 'सोल अर्ज कहानी',
      personalityStory: 'पर्सनालिटी कहानी',
    };
    state.generate.mockResolvedValueOnce(JSON.stringify(translated));

    const result = await translateNumerologyContent(original, 'hi');
    expect(result).toEqual(translated);
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translateNumerologyContent(original, 'hi')).rejects.toThrow(
      'numerology translation returned unparseable JSON (target=hi)',
    );
  });
});
