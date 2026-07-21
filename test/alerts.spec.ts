import { describe, expect, it, vi, beforeEach } from 'vitest';

const fakeEnv = { LOG_LEVEL: 'silent' };
vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));

// Minimal stand-in for the throttle's Lua script: a `gate` key with a TTL
// decides who sends, and a `pending` counter accumulates suppressed hits.
const gates = new Set<string>();
const pending = new Map<string, number>();

vi.mock('../src/config/redis.js', () => ({
  getRedis: () => ({
    eval: (_lua: string, _n: number, gateKey: string, pendingKey: string) => {
      if (!gates.has(gateKey)) {
        gates.add(gateKey);
        const suppressed = pending.get(pendingKey) ?? 0;
        pending.delete(pendingKey);
        return Promise.resolve([1, suppressed] as [number, number]);
      }
      pending.set(pendingKey, (pending.get(pendingKey) ?? 0) + 1);
      return Promise.resolve([0, 0] as [number, number]);
    },
  }),
}));

const sent: { title: string; message: string }[] = [];
vi.mock('../src/lib/notifications/telegram.js', () => ({
  sendAlert: (title: string, message: string) => {
    sent.push({ title, message });
    return Promise.resolve(true);
  },
}));

const { alertThrottled, __resetForTests } = await import('../src/lib/notifications/alerts.js');

beforeEach(() => {
  gates.clear();
  pending.clear();
  sent.length = 0;
  __resetForTests?.();
});

describe('alertThrottled', () => {
  it('sends the first occurrence of a signature immediately', async () => {
    await alertThrottled('api-500:/v1/kundli', 'API error', 'boom');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.message).toContain('boom');
  });

  it('suppresses repeats of the same signature within the window', async () => {
    for (let i = 0; i < 50; i++) {
      await alertThrottled('api-500:/v1/kundli', 'API error', 'boom');
    }
    // Today's incident produced 194 rejections in two minutes; the point of
    // this is that it becomes one message, not 194.
    expect(sent).toHaveLength(1);
  });

  it('reports how many were suppressed once the window reopens', async () => {
    await alertThrottled('sig', 'API error', 'boom');
    for (let i = 0; i < 9; i++) await alertThrottled('sig', 'API error', 'boom');

    gates.clear(); // window elapsed
    await alertThrottled('sig', 'API error', 'boom');

    expect(sent).toHaveLength(2);
    expect(sent[1]?.message).toContain('9');
  });

  it('keeps distinct signatures on independent windows', async () => {
    await alertThrottled('api-500:/v1/kundli', 'API error', 'a');
    await alertThrottled('api-500:/v1/horoscope', 'API error', 'b');
    expect(sent).toHaveLength(2);
  });

  it('never throws when Redis is unavailable', async () => {
    const redis = await import('../src/config/redis.js');
    vi.spyOn(redis, 'getRedis').mockImplementationOnce(() => {
      throw new Error('redis down');
    });
    await expect(alertThrottled('sig', 'API error', 'boom')).resolves.toBeUndefined();
  });
});
