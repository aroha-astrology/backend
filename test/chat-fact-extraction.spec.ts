import { beforeEach, describe, expect, it, vi } from 'vitest';

// Coverage for chat-fact-extraction.ts's extractTurnFacts(): extracts durable
// personal facts from a single chat exchange, every turn (no turn-count
// threshold, unlike chat-compaction.ts's summary folding). Parsing is
// defensive throughout: a malformed LLM response or a thrown error must
// never throw, only degrade to an empty facts list.

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const { extractTurnFacts } = await import('../src/lib/chat-fact-extraction.js');

beforeEach(() => {
  state.generate.mockReset();
});

describe('extractTurnFacts', () => {
  it('returns facts as {fact, followUpQuestion} objects, defaulting followUpQuestion to null when omitted', async () => {
    state.generate.mockResolvedValue(
      JSON.stringify({
        facts: [
          { fact: 'Has an eldest son' },
          { fact: 'Is married', followUpQuestion: null },
          {
            fact: 'Planning to conceive 2-3 months after starting a new job',
            followUpQuestion: 'Did the new job start yet?',
          },
        ],
      }),
    );

    const result = await extractTurnFacts('I have a son', 'That is wonderful', [], 'user-1');

    expect(result).toEqual([
      { fact: 'Has an eldest son', followUpQuestion: null },
      { fact: 'Is married', followUpQuestion: null },
      {
        fact: 'Planning to conceive 2-3 months after starting a new job',
        followUpQuestion: 'Did the new job start yet?',
      },
    ]);
  });

  it('returns an empty array when nothing durable was shared', async () => {
    state.generate.mockResolvedValue(JSON.stringify({ facts: [] }));

    const result = await extractTurnFacts(
      'What does my Jupiter transit mean?',
      'reply',
      [],
      'user-1',
    );

    expect(result).toEqual([]);
  });

  it('passes existing facts into the prompt so the model can avoid re-extracting duplicates', async () => {
    state.generate.mockResolvedValue(JSON.stringify({ facts: [] }));

    await extractTurnFacts(
      'my husband and I are doing well',
      'reply',
      [{ fact: 'Is married', followUpQuestion: null }],
      'user-1',
    );

    const call = state.generate.mock.calls[0] as any[];
    expect(call[0].messages[0].content).toContain('Is married');
  });

  // A user came back two weeks later, was given a different marriage date than
  // the one committed to before, and when challenged the assistant invented a
  // distinction ("October was about career, not marriage") to reconcile them.
  // It had no way to know: user_facts is the ONLY memory that survives across
  // sessions, and this prompt used to forbid storing astrological conclusions
  // outright — so the one thing the user would hold it to was the one thing
  // never kept. Dated commitments must be extractable; general readings and
  // remedies must still not be.
  it('asks for dated timings the assistant committed to, without opening the door to general readings', async () => {
    state.generate.mockResolvedValue(JSON.stringify({ facts: [] }));

    await extractTurnFacts('when will I marry?', 'October 2026 looks strong.', [], 'user-1');

    const prompt = (state.generate.mock.calls[0] as any[])[0].messages[0].content as string;
    expect(prompt).toContain('PREVIOUSLY TOLD THEM');
    expect(prompt).toMatch(/SPECIFIC DATED TIMING/);
    expect(prompt).toMatch(/never a general reading, a remedy, a planetary placement/i);
    // The blanket ban must still be stated — the exception narrows it, not replaces it.
    expect(prompt).toContain('Never include astrological conclusions');
  });

  it('parses a stored commitment through unchanged', async () => {
    state.generate.mockResolvedValue(
      JSON.stringify({
        facts: [
          {
            fact: 'PREVIOUSLY TOLD THEM: their marriage window is October 2026',
            followUpQuestion: null,
          },
        ],
      }),
    );

    const result = await extractTurnFacts('when will I marry?', 'October 2026.', [], 'user-1');

    expect(result).toEqual([
      {
        fact: 'PREVIOUSLY TOLD THEM: their marriage window is October 2026',
        followUpQuestion: null,
      },
    ]);
  });

  it('drops malformed fact entries (non-string fact, or a bare string instead of an object) rather than throwing', async () => {
    state.generate.mockResolvedValue(
      JSON.stringify({
        facts: [
          { fact: 'valid fact', followUpQuestion: null },
          { fact: 42 },
          'a bare string, not an object',
          null,
          { followUpQuestion: 'no fact field' },
        ],
      }),
    );

    const result = await extractTurnFacts('msg', 'reply', [], 'user-1');

    expect(result).toEqual([{ fact: 'valid fact', followUpQuestion: null }]);
  });

  it('normalizes a non-string followUpQuestion to null rather than throwing', async () => {
    state.generate.mockResolvedValue(
      JSON.stringify({ facts: [{ fact: 'valid fact', followUpQuestion: 12345 }] }),
    );

    const result = await extractTurnFacts('msg', 'reply', [], 'user-1');

    expect(result).toEqual([{ fact: 'valid fact', followUpQuestion: null }]);
  });

  it('returns an empty array when the response is not valid JSON', async () => {
    state.generate.mockResolvedValue('not json at all');

    const result = await extractTurnFacts('msg', 'reply', [], 'user-1');

    expect(result).toEqual([]);
  });

  it('returns an empty array when the LLM call itself throws', async () => {
    state.generate.mockRejectedValue(new Error('network down'));

    const result = await extractTurnFacts('msg', 'reply', [], 'user-1');

    expect(result).toEqual([]);
  });
});
