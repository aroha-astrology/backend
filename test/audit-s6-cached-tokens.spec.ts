import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Audit L10: ai_usage logged input and output tokens but dropped the cached-token count that the
// compat endpoint reports in usage.prompt_tokens_details.cached_tokens (field verified live on
// 2026-11-05 against gemini-3.1-flash-lite and gemini-3.5-flash-lite; it is OMITTED when 0).
// Without it nobody can tell whether implicit caching already discounts chat input (O1).
const state = vi.hoisted(() => ({
  insertAiUsage: vi.fn(),
  pickKey: vi.fn(),
}));

vi.mock('../src/config/env.js', () => ({
  env: {
    GEMINI_BASE_URL: 'https://gemini.test/v1beta/openai',
    GEMINI_MODEL: 'gemini-3.1-flash-lite',
    GEMINI_REASONING_MODEL: '',
    LOG_LEVEL: 'silent',
  },
  isProduction: false,
  isTest: true,
}));
vi.mock('../src/modules/admin/ai-usage.repo.js', () => ({ insertAiUsage: state.insertAiUsage }));
vi.mock('../src/lib/notifications/alerts.js', () => ({
  alertThrottled: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/lib/llm/gemini-key-pool.js', () => ({
  pickKey: state.pickKey,
  markRateLimited: vi.fn(),
  earliestAvailableAt: vi.fn().mockResolvedValue(Date.now() + 60_000),
  poolSize: vi.fn().mockReturnValue(1),
  paidKeyNameAt: () => null,
}));

const { generate, stream } = await import('../src/lib/llm/gemini-client.js');

const PROFILE = { name: 'chat', temperature: 0.7, jsonMode: false, stream: false, maxTokens: 2048 };
const MESSAGES = [{ role: 'user', content: 'hi' }];

type Usage = Record<string, unknown>;

function jsonResponse(usage: Usage) {
  return {
    status: 200,
    ok: true,
    headers: new Headers(),
    text: () =>
      Promise.resolve(
        JSON.stringify({
          choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
          usage,
        }),
      ),
  };
}

function sseResponse(usage: Usage) {
  const enc = new TextEncoder();
  const lines = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: 'hi' } }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage })}\n\n`,
    'data: [DONE]\n\n',
  ];
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const l of lines) c.enqueue(enc.encode(l));
      c.close();
    },
  });
  return { status: 200, ok: true, headers: new Headers(), body, text: () => Promise.resolve('') };
}

beforeEach(() => {
  state.insertAiUsage.mockReset().mockResolvedValue(undefined);
  state.pickKey.mockReset().mockResolvedValue({ index: 0, key: 'k', tier: 'free' });
});
afterEach(() => vi.unstubAllGlobals());

describe('ai_usage records the cached input tokens (audit L10)', () => {
  it('generate(): copies prompt_tokens_details.cached_tokens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          prompt_tokens: 10205,
          completion_tokens: 6,
          total_tokens: 10211,
          prompt_tokens_details: { cached_tokens: 6123 },
        }),
      ),
    );
    await generate({ profile: PROFILE, messages: MESSAGES });
    await vi.waitFor(() => expect(state.insertAiUsage).toHaveBeenCalledTimes(1));
    expect(state.insertAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ tokensIn: 10205, cachedTokens: 6123 }),
    );
  });

  it('generate(): records 0 (not undefined) when the API leaves the field out', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ prompt_tokens: 100, completion_tokens: 5, total_tokens: 105 }),
        ),
    );
    await generate({ profile: PROFILE, messages: MESSAGES });
    await vi.waitFor(() => expect(state.insertAiUsage).toHaveBeenCalledTimes(1));
    expect(state.insertAiUsage).toHaveBeenCalledWith(expect.objectContaining({ cachedTokens: 0 }));
  });

  it('generate(): a garbled value never becomes NaN or more than the prompt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          prompt_tokens: 100,
          completion_tokens: 5,
          total_tokens: 105,
          prompt_tokens_details: { cached_tokens: 'lots' },
        }),
      ),
    );
    await generate({ profile: PROFILE, messages: MESSAGES });
    await vi.waitFor(() => expect(state.insertAiUsage).toHaveBeenCalledTimes(1));
    expect(state.insertAiUsage).toHaveBeenCalledWith(expect.objectContaining({ cachedTokens: 0 }));
  });

  it('stream(): copies the cached count from the final usage chunk (chat is a stream)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse({
          prompt_tokens: 10206,
          completion_tokens: 25,
          total_tokens: 10231,
          prompt_tokens_details: { cached_tokens: 8163 },
        }),
      ),
    );
    for await (const _ of stream({ profile: PROFILE, messages: MESSAGES })) void _;
    await vi.waitFor(() => expect(state.insertAiUsage).toHaveBeenCalledTimes(1));
    expect(state.insertAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ tokensIn: 10206, cachedTokens: 8163 }),
    );
  });
});
