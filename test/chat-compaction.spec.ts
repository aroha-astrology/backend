import { beforeEach, describe, expect, it, vi } from 'vitest';

// Coverage for chat-compaction.ts's compactHistory(): folds old turns into a
// running summary once history exceeds COMPACT_THRESHOLD (8), and separately
// extracts durable "facts" the user shared. Facts are now `{fact,
// followUpQuestion}` objects instead of bare strings — followUpQuestion is a
// natural, non-intrusive question worth asking again once the topic recurs
// (e.g. "Did the new job start yet?"), or null when the fact needs no
// follow-up. Parsing is defensive throughout: a malformed LLM response must
// never throw, only degrade to an empty facts list / raw-text summary.

const state = vi.hoisted(() => ({
  generate: vi.fn(),
}));

vi.mock('../src/lib/llm/gemini-client.js', () => ({
  generate: state.generate,
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const { compactHistory } = await import('../src/lib/chat-compaction.js');

function turns(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `turn ${i}`,
  }));
}

beforeEach(() => {
  state.generate.mockReset();
});

describe('compactHistory — below threshold', () => {
  it('passes history through unchanged and returns no facts when at or under the threshold', async () => {
    const history = turns(8);

    const result = await compactHistory(history, 'existing summary');

    expect(state.generate).not.toHaveBeenCalled();
    expect(result).toEqual({
      recentHistory: history,
      summary: 'existing summary',
      changed: false,
      facts: [],
    });
  });
});

describe('compactHistory — fact extraction shape', () => {
  it('returns facts as {fact, followUpQuestion} objects, defaulting followUpQuestion to null when omitted', async () => {
    state.generate.mockResolvedValue(
      JSON.stringify({
        summary: 'User discussed career.',
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

    const result = await compactHistory(turns(10), undefined);

    expect(result.changed).toBe(true);
    expect(result.summary).toBe('User discussed career.');
    expect(result.facts).toEqual([
      { fact: 'Has an eldest son', followUpQuestion: null },
      { fact: 'Is married', followUpQuestion: null },
      {
        fact: 'Planning to conceive 2-3 months after starting a new job',
        followUpQuestion: 'Did the new job start yet?',
      },
    ]);
  });

  it('drops malformed fact entries (non-string fact, or a bare string instead of an object) rather than throwing', async () => {
    state.generate.mockResolvedValue(
      JSON.stringify({
        summary: 'ok',
        facts: [
          { fact: 'valid fact', followUpQuestion: null },
          { fact: 42 },
          'a bare string, not an object',
          null,
          { followUpQuestion: 'no fact field' },
        ],
      }),
    );

    const result = await compactHistory(turns(10), undefined);

    expect(result.facts).toEqual([{ fact: 'valid fact', followUpQuestion: null }]);
  });

  it('normalizes a non-string followUpQuestion to null rather than throwing', async () => {
    state.generate.mockResolvedValue(
      JSON.stringify({
        summary: 'ok',
        facts: [{ fact: 'valid fact', followUpQuestion: 12345 }],
      }),
    );

    const result = await compactHistory(turns(10), undefined);

    expect(result.facts).toEqual([{ fact: 'valid fact', followUpQuestion: null }]);
  });

  it('strips a markdown fence around the JSON response before parsing', async () => {
    state.generate.mockResolvedValue(
      '```json\n' + JSON.stringify({ summary: 'ok', facts: [{ fact: 'fenced fact' }] }) + '\n```',
    );

    const result = await compactHistory(turns(10), undefined);

    expect(result.facts).toEqual([{ fact: 'fenced fact', followUpQuestion: null }]);
  });

  it('falls back to raw text as the summary with empty facts when the response is not valid JSON', async () => {
    state.generate.mockResolvedValue('not json at all');

    const result = await compactHistory(turns(10), undefined);

    expect(result.summary).toBe('not json at all');
    expect(result.facts).toEqual([]);
    expect(result.changed).toBe(true);
  });

  it('falls back to the untrimmed history with no facts when the LLM call itself throws', async () => {
    state.generate.mockRejectedValue(new Error('network down'));
    const history = turns(10);

    const result = await compactHistory(history, 'prior summary');

    expect(result).toEqual({
      recentHistory: history,
      summary: 'prior summary',
      changed: false,
      facts: [],
    });
  });
});
