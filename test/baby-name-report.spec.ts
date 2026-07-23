import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generateBabyNameReport, translateBabyNameContent, BABY_NAME_STYLES } =
  await import('../src/lib/llm/baby-name-report.js');

beforeEach(() => {
  state.generate.mockReset();
});

describe('BABY_NAME_STYLES', () => {
  it('has exactly the 4 supported styles', () => {
    expect(BABY_NAME_STYLES).toEqual([
      'ancient-indian',
      'modern-indian',
      'western',
      'mythological',
    ]);
  });
});

describe('generateBabyNameReport', () => {
  it('returns the parsed narrative + model, keeping only names starting with the syllable', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'Names starting with "Chu" suit this baby\'s nakshatra beautifully.',
        suggestions: [
          { name: 'Chunmun', meaning: 'A traditional pet name meaning lively.' },
          { name: 'Rohan', meaning: 'This one does not match and must be dropped.' },
          { name: 'Chuck', meaning: 'A Western name.' },
          { name: 'Chirag', meaning: 'Means "lamp" in Sanskrit.' },
        ],
      }),
    );

    const result = await generateBabyNameReport({
      syllable: 'Chu',
      style: 'ancient-indian',
      gender: null,
    });

    expect(result.intro).toContain('Chu');
    const names = result.suggestions.map((s) => s.name);
    expect(names).toContain('Chunmun');
    expect(names).toContain('Chuck');
    expect(names).toContain('Chirag');
    expect(names).not.toContain('Rohan');
    expect(result.model).toBeTruthy();
  });

  it('feeds the syllable, style, and gender into the grounding context sent to Gemini', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'x',
        suggestions: [
          { name: 'Chu1', meaning: 'a' },
          { name: 'Chu2', meaning: 'b' },
          { name: 'Chu3', meaning: 'c' },
        ],
      }),
    );

    await generateBabyNameReport({ syllable: 'Chu', style: 'western', gender: 'female' });

    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain('Chu');
    expect(groundingMessage.content).toContain('female');
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(
      generateBabyNameReport({ syllable: 'Chu', style: 'western', gender: null }),
    ).rejects.toThrow('baby-name LLM returned unparseable JSON');
  });

  it('throws when fewer than 3 suggestions actually match the required syllable', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'x',
        suggestions: [
          { name: 'Rohan', meaning: 'does not match' },
          { name: 'Priya', meaning: 'does not match either' },
        ],
      }),
    );

    await expect(
      generateBabyNameReport({ syllable: 'Chu', style: 'western', gender: null }),
    ).rejects.toThrow('baby-name LLM returned unparseable JSON');
  });
});

describe('translateBabyNameContent', () => {
  const original = {
    intro: 'Names starting with "Chu" suit this baby.',
    suggestions: [
      { name: 'Chunmun', meaning: 'A traditional pet name meaning lively.' },
      { name: 'Chirag', meaning: 'Means "lamp" in Sanskrit.' },
    ],
  };

  it('translates intro + meanings, keeping names unchanged and in order', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'नमस्ते',
        meanings: ['जीवंत के लिए एक पारंपरिक उपनाम।', 'संस्कृत में "दीपक" का अर्थ है।'],
      }),
    );

    const result = await translateBabyNameContent(original, 'hi');
    expect(result.intro).toBe('नमस्ते');
    expect(result.suggestions[0]!.name).toBe('Chunmun');
    expect(result.suggestions[0]!.meaning).toContain('जीवंत');
    expect(result.suggestions[1]!.name).toBe('Chirag');
  });

  it('throws when the translated meanings array length does not match', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({ intro: 'नमस्ते', meanings: ['only one'] }),
    );

    await expect(translateBabyNameContent(original, 'hi')).rejects.toThrow(
      'baby-name translation returned unparseable JSON (target=hi)',
    );
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translateBabyNameContent(original, 'hi')).rejects.toThrow(
      'baby-name translation returned unparseable JSON (target=hi)',
    );
  });
});
