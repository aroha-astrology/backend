import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

const { generateSummaryReport } = await import('../src/lib/llm/flagship-summary-report.js');

const VALID_CTX = {
  sectionDigests: {
    Career: 'Your 10th house strength points toward steady, recognition-driven growth.',
    Numerology: 'Life Path 7 favors introspection and deep expertise over broad networking.',
  },
};

const VALID_JSON = JSON.stringify({
  overallSummary:
    'Across your career and numerology sections, a consistent theme of patient mastery emerges.',
  keyStrengths: 'Your 10th house strength and Life Path 7 combine into a rare depth of focus.',
  areasToWatch:
    'Watch for over-isolating when networking would actually accelerate your recognition.',
  closingGuidance: 'Trust the slow build — it is already working in your favor.',
});

beforeEach(() => {
  state.generate.mockReset();
});

describe('generateSummaryReport', () => {
  it('returns the parsed narrative + model', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    const result = await generateSummaryReport(VALID_CTX);

    expect(result.overallSummary).toContain('patient mastery');
    expect(result.keyStrengths).toBeTruthy();
    expect(result.areasToWatch).toBeTruthy();
    expect(result.closingGuidance).toBeTruthy();
    expect(result.model).toBeTruthy();
  });

  it('includes every section digest in the astro_context block', async () => {
    state.generate.mockResolvedValueOnce(VALID_JSON);

    await generateSummaryReport(VALID_CTX);

    const call = state.generate.mock.calls[0]![0];
    const groundingMessage = call.messages.find((m: { content: string }) =>
      m.content.includes('astro_context'),
    );
    expect(groundingMessage.content).toContain(
      'Career: Your 10th house strength points toward steady, recognition-driven growth.',
    );
    expect(groundingMessage.content).toContain(
      'Numerology: Life Path 7 favors introspection and deep expertise over broad networking.',
    );
  });

  it('throws (never caches filler) when Gemini returns unparseable JSON', async () => {
    state.generate.mockResolvedValueOnce('not json at all');

    await expect(generateSummaryReport(VALID_CTX)).rejects.toThrow(
      'flagship summary LLM returned unparseable JSON',
    );
  });

  it('throws when a required narrative field is missing', async () => {
    state.generate.mockResolvedValueOnce(JSON.stringify({ overallSummary: 'only a summary' }));

    await expect(generateSummaryReport(VALID_CTX)).rejects.toThrow(
      'flagship summary LLM returned unparseable JSON',
    );
  });
});
