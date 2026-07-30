import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// checkGemini() used to build its own Authorization header directly off
// env.GEMINI_API_KEY, bypassing the multi-key pool entirely. It now goes
// through gemini-key-pool.ts's pickKey() like everything else that talks to
// Gemini — this covers that wiring in isolation from gemini-client.ts's own
// (much more involved) retry/failover behavior, since this is just a single,
// no-retry pick for a low-volume health check.
const state = vi.hoisted(() => ({
  pickKey: vi.fn(),
}));

const fakeEnv = vi.hoisted(() => ({
  GEMINI_BASE_URL: 'https://gemini.test/v1beta/openai',
  LOG_LEVEL: 'silent',
}));

vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));

vi.mock('../src/lib/llm/gemini-key-pool.js', () => ({
  pickKey: state.pickKey,
}));

const { checkGemini } = await import('../src/modules/health-report/health-report.checks.js');

beforeEach(() => {
  state.pickKey.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkGemini', () => {
  it('uses the key returned by pickKey() in the Authorization header', async () => {
    state.pickKey.mockResolvedValue({ index: 2, key: 'pool-key-2' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkGemini();

    expect(state.pickKey).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gemini.test/v1beta/openai/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer pool-key-2' },
      }),
    );
    expect(result.status).toBe('ok');
  });

  it('reports a failure (not a throw) when the whole pool is cooling down', async () => {
    state.pickKey.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkGemini();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/pool exhausted/i);
  });

  it('reports a failure when the picked key gets a non-ok response', async () => {
    state.pickKey.mockResolvedValue({ index: 0, key: 'pool-key-0' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    const result = await checkGemini();

    expect(result.status).toBe('fail');
    expect(result.message).toMatch(/401/);
  });
});
