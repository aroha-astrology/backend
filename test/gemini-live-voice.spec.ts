import { describe, expect, it, vi, beforeEach } from 'vitest';

// The voice Yogi Baba speaks in is pinned into the ephemeral token at mint
// time — the browser holds that token and sends a model-only setup frame, so
// whatever is NOT constrained here is either Google's default or the client's
// choice. Two things can silently go wrong, and neither shows up in tsc:
//
//   1. speechConfig goes missing  -> Gemini picks its own default voice again,
//      which is the exact bug this was added to fix.
//   2. a languageCode gets added -> it would override the per-call locale that
//      rides in on the system instruction, breaking every non-English call.
//
// Both are asserted below against the real request body.

const fakeEnv = {
  GEMINI_LIVE_ENABLED: true,
  GEMINI_LIVE_MODEL: 'gemini-3.1-flash-live-preview',
  GEMINI_LIVE_VOICE: 'Algieba',
  GEMINI_LIVE_BASE_URL: 'https://example.invalid/v1beta',
  LOG_LEVEL: 'silent',
};

vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));
vi.mock('../src/lib/logger.js', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock('../src/lib/notifications/alerts.js', () => ({ alertThrottled: vi.fn() }));
vi.mock('../src/lib/llm/paid-usage.js', () => ({ recordPaidKeyUse: vi.fn() }));
vi.mock('../src/lib/llm/gemini-key-pool.js', () => ({
  pickKey: vi.fn(() => Promise.resolve({ key: 'test-key', index: 0, tier: 'free' })),
  markRateLimited: vi.fn(),
  poolSize: () => 1,
}));

const { mintLiveToken } = await import('../src/lib/llm/gemini-live-token.js');

function sentBody(fetchMock: ReturnType<typeof vi.fn>): any {
  return JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
}

describe('mintLiveToken: voice pinning', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        // The mint reads text() and JSON.parses it itself — it never calls json().
        text: () => Promise.resolve(JSON.stringify({ name: 'auth_tokens/abc123' })),
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
  });

  it('pins the configured voice into the mint request', async () => {
    await mintLiveToken({ systemInstruction: 'be Baba', resumptionHandle: undefined });

    const speechConfig = sentBody(fetchMock).bidiGenerateContentSetup.generationConfig.speechConfig;
    expect(speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Algieba');
  });

  it('never pins a languageCode — the call language comes from the system instruction', async () => {
    await mintLiveToken({ systemInstruction: 'be Baba', resumptionHandle: undefined });

    const { generationConfig } = sentBody(fetchMock).bidiGenerateContentSetup;
    expect(generationConfig.speechConfig).not.toHaveProperty('languageCode');
    expect(generationConfig.responseModalities).toEqual(['AUDIO']);
  });

  it('follows the env var, so the voice can be swapped without a deploy', async () => {
    fakeEnv.GEMINI_LIVE_VOICE = 'Charon';
    await mintLiveToken({ systemInstruction: 'be Baba', resumptionHandle: undefined });

    const speechConfig = sentBody(fetchMock).bidiGenerateContentSetup.generationConfig.speechConfig;
    expect(speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Charon');
    fakeEnv.GEMINI_LIVE_VOICE = 'Algieba';
  });

  it('draws from the paid reserve first, not the shared free pool', async () => {
    const { pickKey } = await import('../src/lib/llm/gemini-key-pool.js');
    await mintLiveToken({ systemInstruction: 'be Baba', resumptionHandle: undefined });

    expect(pickKey).toHaveBeenCalledWith(expect.any(Set), true);
  });
});
