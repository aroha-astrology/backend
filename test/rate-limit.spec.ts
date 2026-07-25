import { describe, expect, it, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// A minimal in-memory stand-in for the Redis INCR+PEXPIRE Lua script, so the
// tests exercise the real keying/namespacing logic without a live Redis.
const store = new Map<string, number>();
const evalCalls: string[] = [];

// Mutable so a single suite can cover both proxy postures.
const fakeEnv = { TRUST_PROXY: false, LOG_LEVEL: 'silent' };
vi.mock('../src/config/env.js', () => ({
  env: fakeEnv,
  isProduction: false,
  isTest: true,
}));

// The limiter's alertThrottled() call on rejection shares this same mocked
// client with a 2-key Lua script — pass those through inertly so they don't
// pollute `evalCalls`, which this suite uses to assert on rate-limit keying.
vi.mock('../src/config/redis.js', () => ({
  getRedis: () => ({
    eval: (_script: string, numKeys: number, key: string, windowMs: number) => {
      if (numKeys !== 1) return Promise.resolve([1, 0] as [number, number]);
      evalCalls.push(key);
      const count = (store.get(key) ?? 0) + 1;
      store.set(key, count);
      return Promise.resolve([count, Number(windowMs)] as [number, number]);
    },
  }),
}));

vi.mock('../src/lib/notifications/telegram.js', () => ({
  sendAlert: () => Promise.resolve(true),
}));

const { rateLimiter } = await import('../src/middleware/rate-limit.js');
const { errorHandler } = await import('../src/middleware/error.js');

/** Build an app whose limiter sees `user` only if one is supplied. */
function makeApp(opts: { max: number; name: string; user?: { id: string } }) {
  const app = new Hono();
  // Mirror the real app so AppError('TOO_MANY_REQUESTS') surfaces as a 429
  // rather than an unhandled 500.
  app.onError(errorHandler);
  if (opts.user) {
    app.use('*', async (c, next) => {
      c.set('user' as never, opts.user as never);
      await next();
    });
  }
  app.use('*', rateLimiter({ windowMs: 60_000, max: opts.max, name: opts.name }));
  app.get('/ping', (c) => c.text('ok'));
  return app;
}

/**
 * Simulate a request arriving from a given TCP peer. `getConnInfo` reads the
 * address off the Node adapter's `incoming` socket, so the fake env mirrors
 * that shape.
 */
function request(app: Hono, remoteAddr: string, headers: Record<string, string> = {}) {
  return app.fetch(new Request('http://localhost/ping', { headers }), {
    incoming: { socket: { remoteAddress: remoteAddr, remotePort: 443, remoteFamily: 'IPv4' } },
  });
}

beforeEach(() => {
  store.clear();
  evalCalls.length = 0;
  fakeEnv.TRUST_PROXY = false;
});

describe('rateLimiter keying', () => {
  it('gives distinct clients distinct buckets even with no x-forwarded-for header', async () => {
    // Production has no reverse proxy: browsers and the mobile app connect
    // straight to the Node server, so XFF is absent. Every client must still
    // get its own bucket rather than sharing one global counter.
    const app = makeApp({ max: 2, name: 'baseline' });

    await request(app, '203.0.113.10');
    await request(app, '203.0.113.10');
    const thirdFromA = await request(app, '203.0.113.10');
    expect(thirdFromA.status).toBe(429); // A exhausted its own quota

    const firstFromB = await request(app, '198.51.100.77');
    expect(firstFromB.status).toBe(200); // B must be unaffected by A

    expect(evalCalls.some((k) => k.includes('anonymous'))).toBe(false);
  });

  it('does not lump every client into a single "anonymous" bucket', async () => {
    const app = makeApp({ max: 60, name: 'baseline' });
    await request(app, '203.0.113.1');
    await request(app, '203.0.113.2');
    expect(new Set(evalCalls).size).toBe(2);
  });

  it('prefers the authenticated user id over the client IP', async () => {
    const app = makeApp({ max: 5, name: 'baseline', user: { id: 'user-42' } });
    await request(app, '203.0.113.9');
    expect(evalCalls[0]).toContain('user-42');
  });

  it('uses only the left-most (client) entry of a forwarded-for chain', async () => {
    fakeEnv.TRUST_PROXY = true;
    const app = makeApp({ max: 5, name: 'baseline' });
    await request(app, '10.0.0.1', { 'x-forwarded-for': '203.0.113.5, 70.41.3.18' });
    expect(evalCalls[0]).toContain('203.0.113.5');
    expect(evalCalls[0]).not.toContain('70.41.3.18');
  });

  it('ignores a spoofed forwarded-for header when no proxy is trusted', async () => {
    // With no proxy in front, the header is attacker-controlled: honouring it
    // would let one client mint a fresh bucket per request.
    const app = makeApp({ max: 2, name: 'baseline' });

    await request(app, '203.0.113.40', { 'x-forwarded-for': '1.1.1.1' });
    await request(app, '203.0.113.40', { 'x-forwarded-for': '2.2.2.2' });
    const third = await request(app, '203.0.113.40', { 'x-forwarded-for': '3.3.3.3' });

    expect(third.status).toBe(429);
    expect(new Set(evalCalls).size).toBe(1);
  });
});

describe('rateLimiter namespacing', () => {
  it('shares one counter across processes for the same limiter name', async () => {
    // Two apps stand in for two pm2 cluster workers. A per-process random
    // namespace would give each its own key, multiplying the effective limit
    // by the worker count — the exact bug this limiter claims to fix.
    const workerA = makeApp({ max: 3, name: 'baseline' });
    const workerB = makeApp({ max: 3, name: 'baseline' });

    await request(workerA, '203.0.113.20');
    await request(workerB, '203.0.113.20');
    await request(workerA, '203.0.113.20');

    const fourth = await request(workerB, '203.0.113.20');
    expect(fourth.status).toBe(429);
    expect(new Set(evalCalls).size).toBe(1);
  });

  it('keeps independently named limiters on separate counters', async () => {
    const baseline = makeApp({ max: 1, name: 'baseline' });
    const chat = makeApp({ max: 1, name: 'chat' });

    await request(baseline, '203.0.113.30');
    const chatFirst = await request(chat, '203.0.113.30');
    expect(chatFirst.status).toBe(200);
    expect(new Set(evalCalls).size).toBe(2);
  });
});
