import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Coverage for wiring generate() up to the dead ai_usage table: every
// successful non-streaming call should record token/timing telemetry via
// insertAiUsage — and, critically, a failure in that telemetry write must
// NEVER surface from generate() itself (fire-and-forget, logged not thrown).
const state = vi.hoisted(() => ({
  insertAiUsage: vi.fn(),
  alertThrottled: vi.fn().mockResolvedValue(undefined),
}));

const fakeEnv = vi.hoisted(() => ({
  GEMINI_API_KEY: 'test-key',
  GEMINI_BASE_URL: 'https://gemini.test/v1beta/openai',
  GEMINI_MODEL: 'gemini-3.1-flash-lite',
  LOG_LEVEL: 'silent',
}));

vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));

vi.mock('../src/modules/admin/ai-usage.repo.js', () => ({
  insertAiUsage: state.insertAiUsage,
}));

vi.mock('../src/lib/notifications/alerts.js', () => ({
  alertThrottled: state.alertThrottled,
}));

const { generate } = await import('../src/lib/llm/gemini-client.js');

const PROFILE = {
  name: 'chat',
  temperature: 0.7,
  jsonMode: false,
  stream: false,
  maxTokens: 2048,
};

function mockFetchOnce(body: unknown, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      status,
      ok: status >= 200 && status < 300,
      headers: new Headers(),
      text: () => Promise.resolve(JSON.stringify(body)),
    }),
  );
}

beforeEach(() => {
  state.insertAiUsage.mockReset().mockResolvedValue(undefined);
  state.alertThrottled.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('generate() ai_usage telemetry', () => {
  it('records tokensIn/tokensOut/agent/model/durationMs when the response includes a usage block', async () => {
    mockFetchOnce({
      choices: [{ message: { content: 'hello there' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 42, completion_tokens: 17, total_tokens: 59 },
    });

    const result = await generate({
      profile: PROFILE,
      messages: [{ role: 'user', content: 'hi' }],
      userId: 'user-1',
    });

    expect(result).toBe('hello there');
    await vi.waitFor(() => expect(state.insertAiUsage).toHaveBeenCalledTimes(1));
    expect(state.insertAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        agent: 'chat',
        model: 'gemini-3.1-flash-lite',
        tokensIn: 42,
        tokensOut: 17,
      }),
    );
    const call = state.insertAiUsage.mock.calls[0]?.[0];
    expect(typeof call?.durationMs).toBe('number');
    expect(call?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('passes userId: null when the caller does not supply one', async () => {
    mockFetchOnce({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });

    await generate({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] });

    await vi.waitFor(() => expect(state.insertAiUsage).toHaveBeenCalledTimes(1));
    expect(state.insertAiUsage).toHaveBeenCalledWith(expect.objectContaining({ userId: null }));
  });

  it('does not call insertAiUsage when the response has no usage block', async () => {
    mockFetchOnce({ choices: [{ message: { content: 'no usage here' }, finish_reason: 'stop' } ] });

    await generate({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] });

    expect(state.insertAiUsage).not.toHaveBeenCalled();
  });

  it('never throws or blocks the return when insertAiUsage rejects', async () => {
    state.insertAiUsage.mockRejectedValue(new Error('db unavailable'));
    mockFetchOnce({
      choices: [{ message: { content: 'still returns' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    const result = await generate({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] });

    expect(result).toBe('still returns');
  });
});
