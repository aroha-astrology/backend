import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The free fallback tier (lib/llm/fallback-llm.ts): when every Gemini free key is
// cooling down, chat and report calls try NVIDIA then OpenRouter before the
// billed reserve is touched. Anything else must behave exactly as it did before.
const state = vi.hoisted(() => ({
  insertAiUsage: vi.fn(),
  alertThrottled: vi.fn().mockResolvedValue(undefined),
  pickKey: vi.fn(),
  markRateLimited: vi.fn(),
  earliestAvailableAt: vi.fn(),
  poolSize: vi.fn(),
}));

const fakeEnv = vi.hoisted(() => ({
  GEMINI_API_KEY: 'test-key',
  GEMINI_BASE_URL: 'https://gemini.test/v1beta/openai',
  GEMINI_MODEL: 'gemini-3.1-flash-lite',
  GEMINI_REASONING_MODEL: '',
  NVIDIA_API_KEYS: ['nvapi-test'] as string[],
  OPENROUTER_API_KEYS: ['sk-or-test-1', 'sk-or-test-2'] as string[],
  FALLBACK_NVIDIA_MODEL: 'nvidia/nemotron-3-ultra-550b-a55b',
  FALLBACK_OPENROUTER_MODEL: 'nvidia/nemotron-3-ultra-550b-a55b:free',
  FALLBACK_LLM_PROFILES: ['chat', 'chat-summary', 'report', 'report-translation'] as string[],
  LOG_LEVEL: 'silent',
}));

vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));
vi.mock('../src/modules/admin/ai-usage.repo.js', () => ({ insertAiUsage: state.insertAiUsage }));
vi.mock('../src/lib/notifications/alerts.js', () => ({ alertThrottled: state.alertThrottled }));
vi.mock('../src/lib/llm/gemini-key-pool.js', () => ({
  pickKey: state.pickKey,
  markRateLimited: state.markRateLimited,
  earliestAvailableAt: state.earliestAvailableAt,
  poolSize: state.poolSize,
}));

const { generate, stream } = await import('../src/lib/llm/gemini-client.js');
const { __resetFallbackForTests } = await import('../src/lib/llm/fallback-llm.js');

const CHAT = { name: 'chat', temperature: 0.7, jsonMode: false, stream: false, maxTokens: 512 };
const REPORT = { name: 'report', temperature: 0.3, jsonMode: true, stream: false, maxTokens: 4096 };
const PALM = { name: 'palm-observe', temperature: 0.2, jsonMode: true, stream: false, maxTokens: 2048 };
const MESSAGES = [{ role: 'user', content: 'hello' }];

function reply(content: string, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(),
    text: () =>
      Promise.resolve(
        JSON.stringify({
          choices: [{ message: { content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        }),
      ),
  };
}

function failure(status: number, body = '{"error":"x"}') {
  return {
    status,
    ok: false,
    headers: new Headers(),
    text: () => Promise.resolve(body),
  };
}

function urlsCalled(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => String(call[0]));
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetFallbackForTests();
  state.poolSize.mockReturnValue(1);
  state.insertAiUsage.mockResolvedValue(undefined);
  // Free pool exhausted, a paid reserve key available.
  state.pickKey.mockResolvedValue({ index: 1, key: 'paid-key', tier: 'paid' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Skipped while FALLBACK_ENABLED is false in lib/llm/fallback-llm.ts.
describe.skip('free fallback tier', () => {
  it('serves a chat call from NVIDIA before the paid key is used', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('namaste from nemotron'));
    vi.stubGlobal('fetch', fetchMock);

    const out = await generate({ profile: CHAT, messages: MESSAGES });

    expect(out).toBe('namaste from nemotron');
    expect(urlsCalled(fetchMock)).toEqual(['https://integrate.api.nvidia.com/v1/chat/completions']);
    expect(state.insertAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'nvidia/nemotron-3-ultra-550b-a55b', tier: 'free' }),
    );
  });

  it('turns thinking off for chat on NVIDIA but not for reports', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply('chat reply'))
      .mockResolvedValueOnce(reply('{"verdict":"ok"}'));
    vi.stubGlobal('fetch', fetchMock);

    await generate({ profile: CHAT, messages: MESSAGES });
    await generate({ profile: REPORT, messages: MESSAGES });

    const bodies = fetchMock.mock.calls.map(
      (call) => JSON.parse((call[1] as { body: string }).body) as Record<string, unknown>,
    );
    expect(bodies[0]?.chat_template_kwargs).toEqual({ enable_thinking: false });
    expect(bodies[1]?.chat_template_kwargs).toBeUndefined();
  });

  it('moves on to OpenRouter when NVIDIA is rate limited', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failure(429))
      .mockResolvedValueOnce(reply('from openrouter'));
    vi.stubGlobal('fetch', fetchMock);

    const out = await generate({ profile: CHAT, messages: MESSAGES });

    expect(out).toBe('from openrouter');
    expect(urlsCalled(fetchMock)).toEqual([
      'https://integrate.api.nvidia.com/v1/chat/completions',
      'https://openrouter.ai/api/v1/chat/completions',
    ]);
  });

  it('tries the second OpenRouter key when the first is rate limited', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failure(429))
      .mockResolvedValueOnce(failure(429, 'free-models-per-day limit'))
      .mockResolvedValueOnce(reply('second key'));
    vi.stubGlobal('fetch', fetchMock);

    const out = await generate({ profile: CHAT, messages: MESSAGES });

    expect(out).toBe('second key');
    const auth = fetchMock.mock.calls.map(
      (call) => (call[1] as { headers: Record<string, string> }).headers.Authorization,
    );
    expect(auth).toEqual(['Bearer nvapi-test', 'Bearer sk-or-test-1', 'Bearer sk-or-test-2']);
  });

  it('returns a report reply only if it is valid JSON, stripping fences', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('```json\n{"verdict":"ok"}\n```'));
    vi.stubGlobal('fetch', fetchMock);

    const out = await generate({ profile: REPORT, messages: MESSAGES });

    expect(JSON.parse(out)).toEqual({ verdict: 'ok' });
    const body = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as { body: string }).body,
    ) as Record<string, unknown>;
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('discards a non-JSON report reply and falls through to the next provider', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply('Sure! Here is your report in plain prose.'))
      .mockResolvedValueOnce(reply('{"verdict":"from openrouter"}'));
    vi.stubGlobal('fetch', fetchMock);

    const out = await generate({ profile: REPORT, messages: MESSAGES });

    expect(JSON.parse(out)).toEqual({ verdict: 'from openrouter' });
    expect(urlsCalled(fetchMock)[1]).toBe('https://openrouter.ai/api/v1/chat/completions');
  });

  it('falls back to the paid key when every free provider fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failure(500)) // nvidia
      .mockResolvedValueOnce(failure(500)) // openrouter key 1
      .mockResolvedValueOnce(failure(500)) // openrouter key 2
      .mockResolvedValueOnce(reply('paid answer')); // gemini paid
    vi.stubGlobal('fetch', fetchMock);

    const out = await generate({ profile: CHAT, messages: MESSAGES });

    expect(out).toBe('paid answer');
    expect(urlsCalled(fetchMock)[3]).toContain('gemini.test');
    expect(state.insertAiUsage).toHaveBeenCalledWith(expect.objectContaining({ tier: 'paid' }));
  });

  it('never uses the fallback for a profile outside the allow list (palm)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('{"ok":true}'));
    vi.stubGlobal('fetch', fetchMock);

    await generate({ profile: PALM, messages: MESSAGES });

    expect(urlsCalled(fetchMock).every((u) => u.includes('gemini.test'))).toBe(true);
  });

  it('never sends image content to the fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('seen'));
    vi.stubGlobal('fetch', fetchMock);

    await generate({
      profile: CHAT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'what is this' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
          ],
        },
      ],
    });

    expect(urlsCalled(fetchMock).every((u) => u.includes('gemini.test'))).toBe(true);
  });

  it('is skipped entirely while a free Gemini key is still available', async () => {
    state.pickKey.mockResolvedValue({ index: 0, key: 'free-key', tier: 'free' });
    const fetchMock = vi.fn().mockResolvedValue(reply('gemini free'));
    vi.stubGlobal('fetch', fetchMock);

    const out = await generate({ profile: CHAT, messages: MESSAGES });

    expect(out).toBe('gemini free');
    expect(urlsCalled(fetchMock).every((u) => u.includes('gemini.test'))).toBe(true);
  });

  it('is a no-op when no fallback keys are configured', async () => {
    const saved = [fakeEnv.NVIDIA_API_KEYS, fakeEnv.OPENROUTER_API_KEYS];
    fakeEnv.NVIDIA_API_KEYS = [];
    fakeEnv.OPENROUTER_API_KEYS = [];
    try {
      const fetchMock = vi.fn().mockResolvedValue(reply('paid answer'));
      vi.stubGlobal('fetch', fetchMock);

      const out = await generate({ profile: CHAT, messages: MESSAGES });

      expect(out).toBe('paid answer');
      expect(urlsCalled(fetchMock)).toHaveLength(1);
    } finally {
      [fakeEnv.NVIDIA_API_KEYS, fakeEnv.OPENROUTER_API_KEYS] = saved as [string[], string[]];
    }
  });

  it('streams the fallback reply as a single chunk', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('whole reply'));
    vi.stubGlobal('fetch', fetchMock);

    const chunks: string[] = [];
    for await (const chunk of stream({ profile: CHAT, messages: MESSAGES })) chunks.push(chunk);

    expect(chunks).toEqual(['whole reply']);
    expect(urlsCalled(fetchMock)).toEqual(['https://integrate.api.nvidia.com/v1/chat/completions']);
  });
});
