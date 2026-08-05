import { beforeEach, describe, expect, it, vi } from 'vitest';

// Coverage for chat-compaction.ts's compactHistory(): folds old turns into a
// running summary once history exceeds COMPACT_THRESHOLD (8). Fact
// extraction used to be bundled into this same call but now lives in
// chat-fact-extraction.ts (see that file's own spec) — this file only covers
// summary folding. Parsing is defensive throughout: a malformed LLM response
// must never throw, only degrade to the raw text as the summary.

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
  it('passes history through unchanged when at or under the threshold', async () => {
    const history = turns(8);

    const result = await compactHistory(history, 'existing summary');

    expect(state.generate).not.toHaveBeenCalled();
    expect(result).toEqual({
      recentHistory: history,
      summary: 'existing summary',
      changed: false,
    });
  });
});

describe('compactHistory — summary folding', () => {
  it('folds older turns into a summary once past the threshold', async () => {
    state.generate.mockResolvedValue(JSON.stringify({ summary: 'User discussed career.' }));

    const result = await compactHistory(turns(10), undefined);

    expect(result.changed).toBe(true);
    expect(result.summary).toBe('User discussed career.');
    expect(result.recentHistory).toHaveLength(4);
  });

  it('strips a markdown fence around the JSON response before parsing', async () => {
    state.generate.mockResolvedValue('```json\n' + JSON.stringify({ summary: 'fenced' }) + '\n```');

    const result = await compactHistory(turns(10), undefined);

    expect(result.summary).toBe('fenced');
  });

  it('falls back to raw text as the summary when the response is not valid JSON', async () => {
    state.generate.mockResolvedValue('not json at all');

    const result = await compactHistory(turns(10), undefined);

    expect(result.summary).toBe('not json at all');
    expect(result.changed).toBe(true);
  });

  it('falls back to the untrimmed history when the LLM call itself throws', async () => {
    state.generate.mockRejectedValue(new Error('network down'));
    const history = turns(10);

    const result = await compactHistory(history, 'prior summary');

    expect(result).toEqual({
      recentHistory: history,
      summary: 'prior summary',
      changed: false,
    });
  });
});
