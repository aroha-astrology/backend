import { beforeEach, describe, expect, it, vi } from 'vitest';

// The paid keys are a reserve, so the first time one is used is a real
// operational event ("the free pool ran dry and we started billing to stay
// up"), not a routine metric. These tests pin that it fires exactly once per
// budget day and can never break the request that triggered it.
const state = vi.hoisted(() => ({
  alertThrottled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/config/env.js', () => ({
  env: { LOG_LEVEL: 'silent' },
  isProduction: false,
  isTest: true,
}));

vi.mock('../src/lib/notifications/alerts.js', () => ({
  alertThrottled: state.alertThrottled,
}));

let counters: Map<string, number>;
let redisShouldFail = false;

vi.mock('../src/config/redis.js', () => ({
  getRedis: () => {
    if (redisShouldFail) {
      return {
        incr: () => Promise.reject(new Error('redis down')),
        expire: () => Promise.reject(new Error('redis down')),
        get: () => Promise.reject(new Error('redis down')),
      };
    }
    return {
      incr: (key: string) => {
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        return Promise.resolve(next);
      },
      expire: () => Promise.resolve(1),
      get: (key: string) => Promise.resolve(counters.get(key)?.toString() ?? null),
    };
  },
}));

const { recordPaidKeyUse, paidRequestsToday } = await import('../src/lib/llm/paid-usage.js');

beforeEach(() => {
  counters = new Map();
  redisShouldFail = false;
  state.alertThrottled.mockReset().mockResolvedValue(undefined);
});

describe('recordPaidKeyUse', () => {
  it('alerts on the first billed request of a budget day', async () => {
    await recordPaidKeyUse('chat');

    expect(state.alertThrottled).toHaveBeenCalledTimes(1);
    const [signature, title, message] = state.alertThrottled.mock.calls[0] as string[];
    expect(signature).toBe('gemini:paid:first');
    expect(title).toBe('Gemini paid reserve activated');
    expect(message).toContain('chat');
    // Ops must not read this as an outage — it is spend, and users are fine.
    expect(message).toContain('Users are unaffected');
  });

  it('stays quiet for ordinary follow-up requests', async () => {
    for (let i = 0; i < 40; i++) await recordPaidKeyUse('report');

    expect(state.alertThrottled).toHaveBeenCalledTimes(1); // just the first one
  });

  it('reports a running total every 500 requests', async () => {
    for (let i = 0; i < 500; i++) await recordPaidKeyUse('report');

    expect(state.alertThrottled).toHaveBeenCalledTimes(2);
    const [signature, , message] = state.alertThrottled.mock.calls[1] as string[];
    expect(signature).toBe('gemini:paid:milestone');
    expect(message).toContain('500 billed requests');
  });

  it('never throws or alerts when Redis is unreachable', async () => {
    redisShouldFail = true;

    await expect(recordPaidKeyUse('chat')).resolves.toBeUndefined();
    expect(state.alertThrottled).not.toHaveBeenCalled();
  });

  it('scopes the counter to the Pacific budget day, not the UTC or IST one', async () => {
    vi.useFakeTimers();
    // 05:00 UTC on the 3rd is still 22:00 on the 2nd in Pacific.
    vi.setSystemTime(Date.parse('2026-08-03T05:00:00Z'));
    await recordPaidKeyUse('chat');
    expect([...counters.keys()]).toEqual(['gemini:paid:reqs:2026-08-02']);

    // Cross the Pacific midnight: a fresh day, so it alerts as "first" again.
    vi.setSystemTime(Date.parse('2026-08-03T08:00:00Z'));
    await recordPaidKeyUse('chat');
    expect([...counters.keys()]).toContain('gemini:paid:reqs:2026-08-03');
    expect(state.alertThrottled).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('paidRequestsToday', () => {
  it('returns the current budget day count', async () => {
    await recordPaidKeyUse('chat');
    await recordPaidKeyUse('chat');

    expect(await paidRequestsToday()).toBe(2);
  });

  it('returns 0 when nothing has been billed today', async () => {
    expect(await paidRequestsToday()).toBe(0);
  });

  it('returns 0 rather than throwing when Redis is unreachable', async () => {
    redisShouldFail = true;
    expect(await paidRequestsToday()).toBe(0);
  });
});
