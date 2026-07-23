import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generateNameCorrectionReport, translateNameCorrectionContent } =
  await import('../src/lib/llm/name-correction-report.js');

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateNameCorrectionReport', () => {
  it('computes deterministic alignment + variants and returns the parsed narrative + model', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'Your name carries a steady, grounded energy.',
        analysis:
          'Your current spelling reduces to a number that sits just outside your core numbers.',
        // 'SSubir' (doubling the leading consonant) is the actual deterministic
        // variant generateDeterministicVariants produces for 'Subir' + this DOB
        // (confirmed via manual check) — the LLM's variantNotes must reference a
        // real known variant to count as a match.
        variantNotes: [
          {
            variant: 'SSubir',
            note: 'This small addition realigns the name with your destiny number.',
          },
        ],
      }),
    );

    const result = await generateNameCorrectionReport({
      dateOfBirth: '1993-04-17',
      fullName: 'Subir',
    });

    expect(result.intro).toContain('steady');
    expect(result.analysis).toContain('reduces');
    expect(Array.isArray(result.variants)).toBe(true);
    expect(result.model).toBeTruthy();
  });

  it('feeds mulank/bhagyank/alignment facts into the grounding context sent to Gemini', async () => {
    // Must include a note for the real deterministic variant ('SSubir') so this
    // response is valid — 'Subir' + this DOB is misaligned and produces one
    // known variant, so an empty variantNotes array would (correctly) throw.
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'x',
        analysis: 'y',
        variantNotes: [{ variant: 'SSubir', note: 'note' }],
      }),
    );

    await generateNameCorrectionReport({ dateOfBirth: '1993-04-17', fullName: 'Subir' });

    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain('Mulank');
    expect(groundingMessage.content).toContain('Bhagyank');
    expect(groundingMessage.content).toContain('Alignment status');
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(
      generateNameCorrectionReport({ dateOfBirth: '1993-04-17', fullName: 'Subir' }),
    ).rejects.toThrow('name-correction LLM returned unparseable JSON');
  });

  it('throws when variants were expected but the response has zero valid variant notes', async () => {
    // 'Subir' with this DOB is very unlikely to already be perfectly aligned,
    // so the engine should produce at least one deterministic variant to match against.
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'x',
        analysis: 'y',
        variantNotes: [{ variant: 'not-a-real-variant', note: 'n' }],
      }),
    );

    await expect(
      generateNameCorrectionReport({ dateOfBirth: '1993-04-17', fullName: 'Subir' }),
    ).rejects.toThrow('name-correction LLM returned unparseable JSON');
  });
});

describe('translateNameCorrectionContent', () => {
  const original = {
    intro: 'Your name carries a steady, grounded energy.',
    analysis: 'Your current spelling reduces to a number that sits just outside your core numbers.',
    variants: [{ variant: 'Subirh', chaldean: 3, note: 'This small addition realigns the name.' }],
  };

  it('returns the translated narrative on a valid response, keeping variant/chaldean unchanged', async () => {
    state.generate.mockResolvedValueOnce(
      JSON.stringify({
        intro: 'नमस्ते इंट्रो',
        analysis: 'विश्लेषण',
        variants: [
          {
            variant: 'Subirh',
            chaldean: 3,
            note: 'यह छोटा सा बदलाव नाम को फिर से संरेखित करता है।',
          },
        ],
      }),
    );

    const result = await translateNameCorrectionContent(original, 'hi');
    expect(result.intro).toBe('नमस्ते इंट्रो');
    expect(result.variants[0]!.variant).toBe('Subirh');
    expect(result.variants[0]!.chaldean).toBe(3);
    expect(result.variants[0]!.note).toContain('संरेखित');
  });

  it('throws on an unparseable translation response', async () => {
    state.generate.mockResolvedValueOnce('garbage');

    await expect(translateNameCorrectionContent(original, 'hi')).rejects.toThrow(
      'name-correction translation returned unparseable JSON (target=hi)',
    );
  });
});
