import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Coverage for wiring generate() up to the dead ai_usage table: every
// successful non-streaming call should record token/timing telemetry via
// insertAiUsage — and, critically, a failure in that telemetry write must
// NEVER surface from generate() itself (fire-and-forget, logged not thrown).
//
// gemini-key-pool.ts is mocked directly (rather than exercised for real via a
// fake Redis) so these tests can deterministically control exactly which key
// index gets picked and whether it's "cooling down" per call — the pool
// module's own Redis/cooldown/fallback correctness is covered thoroughly and
// independently in test/gemini-key-pool.spec.ts.
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
  LOG_LEVEL: 'silent',
}));

vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));

vi.mock('../src/modules/admin/ai-usage.repo.js', () => ({
  insertAiUsage: state.insertAiUsage,
}));

vi.mock('../src/lib/notifications/alerts.js', () => ({
  alertThrottled: state.alertThrottled,
}));

vi.mock('../src/lib/llm/gemini-key-pool.js', () => ({
  pickKey: state.pickKey,
  markRateLimited: state.markRateLimited,
  earliestAvailableAt: state.earliestAvailableAt,
  poolSize: state.poolSize,
}));

const { generate, stream, GeminiError } = await import('../src/lib/llm/gemini-client.js');
const { runWithRequestContext } = await import('../src/lib/request-context.js');

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

/** Round-robin-ish stand-in for the real pickKey(): first untried, non-excluded index. */
function roundRobinPickKey(keys: string[]) {
  return (exclude?: Set<number>) => {
    const excluded = exclude ?? new Set<number>();
    for (let i = 0; i < keys.length; i++) {
      if (!excluded.has(i)) return Promise.resolve({ index: i, key: keys[i] });
    }
    return Promise.resolve(null);
  };
}

/** A successful SSE response carrying the given delta chunks, for stream() tests. */
function makeSseResponse(deltas: string[]) {
  const encoder = new TextEncoder();
  const lines = deltas.map(
    (d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`,
  );
  lines.push('data: [DONE]\n\n');
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(line));
      controller.close();
    },
  });
  return {
    status: 200,
    ok: true,
    headers: new Headers(),
    body,
    text: () => Promise.resolve(''),
  };
}

async function drainStream(gen: AsyncGenerator<string, void, unknown>): Promise<string> {
  let out = '';
  for await (const chunk of gen) out += chunk;
  return out;
}

beforeEach(() => {
  state.insertAiUsage.mockReset().mockResolvedValue(undefined);
  state.alertThrottled.mockReset().mockResolvedValue(undefined);
  state.markRateLimited.mockReset().mockResolvedValue(undefined);
  // Generous default so earliestAvailableAt's cap never binds unless a test
  // deliberately wants to exercise it.
  state.earliestAvailableAt
    .mockReset()
    .mockImplementation(() => Promise.resolve(Date.now() + 60_000));
  // Default: a pool of exactly one key (matching the pre-rotation world) so
  // every pre-existing test below keeps behaving exactly as it did before
  // gemini-client.ts grew a key pool at all.
  state.poolSize.mockReset().mockReturnValue(1);
  state.pickKey.mockReset().mockResolvedValue({ index: 0, key: 'test-key', tier: 'free' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
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

  it('bills thinking tokens as output, since completion_tokens leaves them out', async () => {
    // Real numbers observed from the live API on 2026-08-03 with
    // reasoning_effort: high — 61 + 650 does not reach total_tokens 2052, and
    // the 1341-token gap is thinking, which Google bills at the OUTPUT rate.
    // Recording completion_tokens alone understated this call's billed output
    // by ~3x on the most expensive side of the bill.
    mockFetchOnce({
      choices: [{ message: { content: 'reasoned answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 61, completion_tokens: 650, total_tokens: 2052 },
    });

    await generate({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] });

    await vi.waitFor(() => expect(state.insertAiUsage).toHaveBeenCalledTimes(1));
    expect(state.insertAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ tokensIn: 61, tokensOut: 1991 }),
    );
  });

  it('never lets a missing total_tokens report LESS output than completion_tokens', async () => {
    mockFetchOnce({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 250 },
    });

    await generate({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] });

    await vi.waitFor(() => expect(state.insertAiUsage).toHaveBeenCalledTimes(1));
    expect(state.insertAiUsage).toHaveBeenCalledWith(expect.objectContaining({ tokensOut: 250 }));
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
    mockFetchOnce({ choices: [{ message: { content: 'no usage here' }, finish_reason: 'stop' }] });

    await generate({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] });

    expect(state.insertAiUsage).not.toHaveBeenCalled();
  });

  it('never throws or blocks the return when insertAiUsage rejects', async () => {
    state.insertAiUsage.mockRejectedValue(new Error('db unavailable'));
    mockFetchOnce({
      choices: [{ message: { content: 'still returns' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    const result = await generate({
      profile: PROFILE,
      messages: [{ role: 'user', content: 'hi' }],
    });

    expect(result).toBe('still returns');
  });
});

describe('generate() key pool regression: pool of size 1', () => {
  // Critical regression requirement: with a pool of size 1, behavior must be
  // IDENTICAL to the pre-rotation world. pickKey() either returns the sole
  // key (not cooling) or null (cooling) — either way there is no OTHER key to
  // fail over to, so a 429 must fall straight through to the existing
  // sleep-and-retry path, unchanged, exactly like every other test in this
  // file already implicitly exercises (they all use the default pool-of-1 mock
  // configured in the top-level beforeEach above).
  it('sleeps and retries the SAME key on a 429 — no instant failover, because there is nothing to fail over to', async () => {
    vi.useFakeTimers();
    state.poolSize.mockReturnValue(1);
    state.pickKey.mockResolvedValue({ index: 0, key: 'solo-key' });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 429,
        ok: false,
        headers: new Headers({ 'Retry-After': '2' }),
        text: () => Promise.resolve('rate limited'),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers(),
        text: () =>
          Promise.resolve(
            JSON.stringify({
              choices: [{ message: { content: 'ok after retry' }, finish_reason: 'stop' }],
            }),
          ),
      });
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = generate({
      profile: PROFILE,
      messages: [{ role: 'user', content: 'hi' }],
    });

    // The retry can only happen after the Retry-After-driven sleep actually
    // elapses — same as it did before this pool existed.
    await vi.advanceTimersByTimeAsync(2100);
    const result = await resultPromise;

    expect(result).toBe('ok after retry');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Both calls used the one and only key — nothing to rotate to.
    const authHeaders = fetchMock.mock.calls.map(
      (call) => (call[1] as { headers: Record<string, string> }).headers.Authorization,
    );
    expect(new Set(authHeaders)).toEqual(new Set(['Bearer solo-key']));
    expect(state.markRateLimited).toHaveBeenCalledWith(0, 2000);
  });

  it('never calls fetch when pickKey() reports the sole key is cooling down, capping the wait via earliestAvailableAt() rather than sleeping the full blind schedule', async () => {
    vi.useFakeTimers();
    state.poolSize.mockReturnValue(1);
    // The sole key is always cooling — never returns a key to try.
    state.pickKey.mockResolvedValue(null);
    // Recomputed fresh each call (not frozen at test start), so the capped
    // wait stays a small ~300ms every cycle instead of drifting negative as
    // fake time advances. rateLimitBackoff's blind schedule alone would be
    // 2000/4000/8000/... ms — this proves the cap actually binds.
    state.earliestAvailableAt.mockImplementation(() => Promise.resolve(Date.now() + 300));

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = generate({
      profile: PROFILE,
      messages: [{ role: 'user', content: 'hi' }],
    }).catch((err: unknown) => err);

    // 6 capped ~300ms waits comfortably fit in well under a second of fake
    // time, versus the ~2s the blind schedule's first step alone would need.
    await vi.advanceTimersByTimeAsync(3000);

    const err = await resultPromise;
    expect(err).toBeInstanceOf(GeminiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('generate() key pool: multi-key failover on 429', () => {
  it('fails over to the next key instantly (no sleep) when one key 429s, using a different Authorization header', async () => {
    state.poolSize.mockReturnValue(4);
    state.pickKey.mockImplementation(roundRobinPickKey(['key-0', 'key-1', 'key-2', 'key-3']));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 429,
        ok: false,
        headers: new Headers({ 'Retry-After': '5' }),
        text: () => Promise.resolve('rate limited'),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers(),
        text: () =>
          Promise.resolve(
            JSON.stringify({
              choices: [{ message: { content: 'served by key-1' }, finish_reason: 'stop' }],
            }),
          ),
      });
    vi.stubGlobal('fetch', fetchMock);

    const startedAt = performance.now();
    const result = await generate({
      profile: PROFILE,
      messages: [{ role: 'user', content: 'hi' }],
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result).toBe('served by key-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const authHeaders = fetchMock.mock.calls.map(
      (call) => (call[1] as { headers: Record<string, string> }).headers.Authorization,
    );
    expect(authHeaders).toEqual(['Bearer key-0', 'Bearer key-1']);
    expect(new Set(authHeaders).size).toBe(2);
    // No sleep/timer for the failover itself — real wall-clock time must stay tiny.
    expect(elapsedMs).toBeLessThan(500);
    expect(state.markRateLimited).toHaveBeenCalledWith(0, 5000);
  });
});

describe('generate() key pool: whole-pool exhaustion', () => {
  it('throws and alerts once every key has been simultaneously rate limited past the retry budget', async () => {
    vi.useFakeTimers();
    state.poolSize.mockReturnValue(4);
    state.pickKey.mockImplementation(roundRobinPickKey(['key-0', 'key-1', 'key-2', 'key-3']));

    const fetchMock = vi.fn().mockResolvedValue({
      status: 429,
      ok: false,
      headers: new Headers({ 'Retry-After': '1' }),
      text: () => Promise.resolve('still limited'),
    });
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = generate({
      profile: PROFILE,
      messages: [{ role: 'user', content: 'hi' }],
    }).catch((err: unknown) => err);

    // 6 pool-exhaustion backoff waits of ~1s each (Retry-After: 1) before the
    // 7th exhaustion check trips MAX_RATE_LIMIT_RETRIES.
    await vi.advanceTimersByTimeAsync(10_000);

    const err = await resultPromise;
    expect(err).toBeInstanceOf(GeminiError);
    expect((err as InstanceType<typeof GeminiError>).message).toMatch(/pool-exhaustion waits/);
    expect(state.alertThrottled).toHaveBeenCalledWith(
      'gemini:quota',
      'Gemini key pool exhausted',
      expect.stringContaining('entire key pool'),
    );
    // Every one of the 4 keys was tried on each of the 7 exhaustion cycles.
    expect(fetchMock.mock.calls.length).toBe(4 * 7);
  });
});

describe('stream() ai_usage telemetry', () => {
  /** An SSE response whose final chunk carries the usage block, as Gemini sends it. */
  function makeSseResponseWithUsage(
    deltas: string[],
    usage: { prompt_tokens: number; completion_tokens: number },
  ) {
    const encoder = new TextEncoder();
    const lines = deltas.map(
      (d) => `data: ${JSON.stringify({ choices: [{ delta: { content: d } }] })}\n\n`,
    );
    lines.push(
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage })}\n\n`,
    );
    lines.push('data: [DONE]\n\n');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines) controller.enqueue(encoder.encode(line));
        controller.close();
      },
    });
    return { status: 200, ok: true, headers: new Headers(), body, text: () => Promise.resolve('') };
  }

  it('asks for usage on streamed requests, since Gemini omits it otherwise', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      makeSseResponseWithUsage(['hi'], {
        prompt_tokens: 1,
        completion_tokens: 1,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await drainStream(stream({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] }));

    const body = JSON.parse((fetchMock.mock.calls[0]![1] as { body: string }).body) as {
      stream: boolean;
      stream_options?: { include_usage?: boolean };
    };
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
  });

  it('records the streamed call in ai_usage — chat used to leave no trace at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeSseResponseWithUsage(['Hello ', 'world'], {
          prompt_tokens: 1234,
          completion_tokens: 567,
        }),
      ),
    );

    const out = await drainStream(
      stream({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] }),
    );

    expect(out).toBe('Hello world');
    expect(state.insertAiUsage).toHaveBeenCalledTimes(1);
    expect(state.insertAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'chat',
        model: 'gemini-3.1-flash-lite',
        tokensIn: 1234,
        tokensOut: 567,
        tier: 'free',
      }),
    );
  });

  it('marks the row as paid when the reserve tier served the stream', async () => {
    state.pickKey.mockResolvedValue({ index: 7, key: 'paid-key', tier: 'paid' });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          makeSseResponseWithUsage(['x'], { prompt_tokens: 10, completion_tokens: 20 }),
        ),
    );

    await drainStream(stream({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] }));

    expect(state.insertAiUsage).toHaveBeenCalledWith(expect.objectContaining({ tier: 'paid' }));
  });

  it('abandoning a stream early records nothing rather than a bogus partial row', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeSseResponseWithUsage(['a', 'b', 'c'], {
          prompt_tokens: 99,
          completion_tokens: 3,
        }),
      ),
    );

    // Consume one chunk then walk away, as an aborted chat request would. The
    // usage block only arrives on the final chunk, so a consumer that leaves
    // before it has genuinely told us nothing about what was burned — better a
    // missing row than an invented one. The insert lives in the reader's
    // `finally` so it still fires whenever usage HAS been seen, abort or not.
    const gen = stream({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] });
    await gen.next();
    await expect(gen.return(undefined)).resolves.toEqual({ done: true, value: undefined });

    expect(state.insertAiUsage).not.toHaveBeenCalled();
  });

  it('never lets a telemetry failure break the stream', async () => {
    state.insertAiUsage.mockRejectedValue(new Error('db down'));
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          makeSseResponseWithUsage(['ok'], { prompt_tokens: 1, completion_tokens: 1 }),
        ),
    );

    await expect(
      drainStream(stream({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] })),
    ).resolves.toBe('ok');
  });

  it('stays silent when the provider sends no usage block', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeSseResponse(['no usage here'])));

    await drainStream(stream({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] }));

    expect(state.insertAiUsage).not.toHaveBeenCalled();
  });
});

describe('ai_usage attribution from the ambient request context', () => {
  it('attributes the call to the request user without the call site passing one', async () => {
    mockFetchOnce({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
    });

    await runWithRequestContext({ userId: 'user-abc' }, () =>
      generate({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] }),
    );

    expect(state.insertAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-abc' }),
    );
  });

  it('lets an explicit opts.userId win over the ambient one', async () => {
    mockFetchOnce({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
    });

    await runWithRequestContext({ userId: 'ambient' }, () =>
      generate({
        profile: PROFILE,
        messages: [{ role: 'user', content: 'hi' }],
        userId: 'explicit',
      }),
    );

    expect(state.insertAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'explicit' }),
    );
  });

  it('qualifies the agent with the feature so report types stop collapsing into one row', async () => {
    mockFetchOnce({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
    });

    await runWithRequestContext({ userId: 'u1', feature: 'marriage' }, () =>
      generate({
        profile: { ...PROFILE, name: 'report' },
        messages: [{ role: 'user', content: 'hi' }],
      }),
    );

    expect(state.insertAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'report:marriage' }),
    );
  });

  it('records a null user outside any request context, e.g. in a cron job', async () => {
    mockFetchOnce({
      choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 5 },
    });

    await generate({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] });

    expect(state.insertAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: null, agent: 'chat' }),
    );
  });
});

describe('429 cooldown length reflects WHY Google refused', () => {
  // Real shape of a Gemini quota refusal: a QuotaFailure naming the violated
  // quota, plus a RetryInfo. The quota id is the only thing that distinguishes
  // "too fast this minute" (retry in seconds) from "out until the Pacific-
  // midnight reset" (retry in hours) — before this, both got ~10s.
  function quotaBody(quotaId: string, retryDelay: string) {
    return JSON.stringify({
      error: {
        code: 429,
        message: 'Resource has been exhausted',
        status: 'RESOURCE_EXHAUSTED',
        details: [
          {
            '@type': 'type.googleapis.com/google.rpc.QuotaFailure',
            violations: [
              {
                quotaMetric:
                  'generativelanguage.googleapis.com/generate_content_free_tier_requests',
                quotaId,
              },
            ],
          },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
        ],
      },
    });
  }

  /** One key 429s with the given body, the next serves the request. */
  function mock429ThenSuccess(body: string, headers = new Headers()) {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 429,
        ok: false,
        headers,
        text: () => Promise.resolve(body),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers(),
        text: () =>
          Promise.resolve(
            JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] }),
          ),
      });
    vi.stubGlobal('fetch', fetchMock);
    state.poolSize.mockReturnValue(2);
    state.pickKey.mockImplementation(roundRobinPickKey(['key-0', 'key-1']));
    return fetchMock;
  }

  it('sidelines a DAY-exhausted key for hours, not seconds', async () => {
    mock429ThenSuccess(quotaBody('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '32s'));

    await generate({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] });

    expect(state.markRateLimited).toHaveBeenCalledTimes(1);
    const [index, cooldownMs] = state.markRateLimited.mock.calls[0] as [number, number];
    expect(index).toBe(0);
    // Runs to the next Pacific midnight. The exact figure moves with the clock,
    // so assert the property that matters: it is hours away, not the old 60s
    // ceiling that had us re-offering a dead key to users all day.
    expect(cooldownMs).toBeGreaterThan(60 * 60 * 1000);
    expect(cooldownMs).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("uses the body's retryDelay for a per-MINUTE limit when no Retry-After header is sent", async () => {
    mock429ThenSuccess(quotaBody('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '18s'));

    await generate({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] });

    expect(state.markRateLimited).toHaveBeenCalledWith(0, 18_000);
  });

  it('still prefers an explicit Retry-After header over the body hint', async () => {
    mock429ThenSuccess(
      quotaBody('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '18s'),
      new Headers({ 'Retry-After': '5' }),
    );

    await generate({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] });

    expect(state.markRateLimited).toHaveBeenCalledWith(0, 5000);
  });

  it('caps a per-minute cooldown at 60s however large the hint', async () => {
    mock429ThenSuccess(quotaBody('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '900s'));

    await generate({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] });

    expect(state.markRateLimited).toHaveBeenCalledWith(0, 60_000);
  });

  it('falls back to the 10s default for an unparseable body', async () => {
    mock429ThenSuccess('<html>502 from some proxy</html>');

    await generate({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] });

    expect(state.markRateLimited).toHaveBeenCalledWith(0, 10_000);
  });
});

describe('pool exhausted past the deadline fails fast instead of parking the request', () => {
  it('throws immediately rather than sleeping out the 90s budget when nothing frees up in time', async () => {
    // What a whole-pool DAILY exhaustion now looks like: every key, paid
    // reserve included, is cooling for hours. Sleeping would hold the request
    // (and the user's screen) for the full elapsed-time budget and then throw
    // anyway — so this must return in milliseconds, on real timers.
    state.poolSize.mockReturnValue(8);
    state.pickKey.mockResolvedValue(null);
    state.earliestAvailableAt.mockResolvedValue(Date.now() + 8 * 60 * 60 * 1000);

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const startedAt = performance.now();
    const err = await generate({
      profile: PROFILE,
      messages: [{ role: 'user', content: 'hi' }],
    }).catch((e: unknown) => e);
    const elapsedMs = performance.now() - startedAt;

    expect(err).toBeInstanceOf(GeminiError);
    expect((err as InstanceType<typeof GeminiError>).message).toMatch(/until quota reset/);
    expect((err as InstanceType<typeof GeminiError>).statusCode).toBe(429);
    expect(elapsedMs).toBeLessThan(500);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.alertThrottled).toHaveBeenCalledWith(
      'gemini:quota',
      'Gemini key pool exhausted',
      expect.stringContaining('paid reserve included'),
    );
  });

  it('still backs off and retries when a key frees up before the deadline', async () => {
    // The complement of the test above: a short, ordinary per-minute cooldown
    // must keep the existing wait-and-retry behaviour, not fail fast.
    vi.useFakeTimers();
    state.poolSize.mockReturnValue(2);
    state.pickKey.mockResolvedValue(null);
    state.earliestAvailableAt.mockImplementation(() => Promise.resolve(Date.now() + 300));

    const resultPromise = generate({
      profile: PROFILE,
      messages: [{ role: 'user', content: 'hi' }],
    }).catch((err: unknown) => err);

    await vi.advanceTimersByTimeAsync(5000);

    const err = await resultPromise;
    expect(err).toBeInstanceOf(GeminiError);
    expect((err as InstanceType<typeof GeminiError>).message).toMatch(/pool-exhaustion waits/);
  });
});

describe("stream() key pool wiring (mirrors generate()'s failover logic)", () => {
  it('pool of size 1: sleeps and retries the same key on a 429 — no instant failover', async () => {
    vi.useFakeTimers();
    state.poolSize.mockReturnValue(1);
    state.pickKey.mockResolvedValue({ index: 0, key: 'solo-key' });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 429,
        ok: false,
        headers: new Headers({ 'Retry-After': '2' }),
        text: () => Promise.resolve('rate limited'),
      })
      .mockResolvedValueOnce(makeSseResponse(['hello ', 'there']));
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = drainStream(
      stream({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] }),
    );
    await vi.advanceTimersByTimeAsync(2100);
    const result = await resultPromise;

    expect(result).toBe('hello there');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const authHeaders = fetchMock.mock.calls.map(
      (call) => (call[1] as { headers: Record<string, string> }).headers.Authorization,
    );
    expect(new Set(authHeaders)).toEqual(new Set(['Bearer solo-key']));
  });

  it('fails over to the next key instantly (no sleep) when one key 429s', async () => {
    state.poolSize.mockReturnValue(4);
    state.pickKey.mockImplementation(roundRobinPickKey(['key-0', 'key-1', 'key-2', 'key-3']));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        status: 429,
        ok: false,
        headers: new Headers({ 'Retry-After': '5' }),
        text: () => Promise.resolve('rate limited'),
      })
      .mockResolvedValueOnce(makeSseResponse(['served by key-1']));
    vi.stubGlobal('fetch', fetchMock);

    const startedAt = performance.now();
    const result = await drainStream(
      stream({ profile: PROFILE, messages: [{ role: 'user', content: 'hi' }] }),
    );
    const elapsedMs = performance.now() - startedAt;

    expect(result).toBe('served by key-1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const authHeaders = fetchMock.mock.calls.map(
      (call) => (call[1] as { headers: Record<string, string> }).headers.Authorization,
    );
    expect(authHeaders).toEqual(['Bearer key-0', 'Bearer key-1']);
    expect(elapsedMs).toBeLessThan(500);
    expect(state.markRateLimited).toHaveBeenCalledWith(0, 5000);
  });
});
