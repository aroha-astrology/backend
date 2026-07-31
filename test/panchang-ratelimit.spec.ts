import { beforeEach, describe, expect, it, vi } from 'vitest';

// GET /v1/panchang and /v1/panchang/month are unauthenticated and now
// reachable from a real, crawlable /panchang page on the marketing site
// (previously homepage-only), so they need the same rate-limiter protection
// every other public/unauthenticated real-ephemeris-compute route already
// has (see test/horoscope-get-ratelimit.spec.ts, test/public-moon-sign.spec.ts).
// Keyed by IP since there's no authenticated user on this route.

const store = new Map<string, number>();

vi.mock('../src/config/redis.js', () => ({
  getRedis: () => ({
    eval: (_script: string, numKeys: number, key: string, windowMs: number) => {
      if (numKeys !== 1) return Promise.resolve([1, 0] as [number, number]);
      const count = (store.get(key) ?? 0) + 1;
      store.set(key, count);
      return Promise.resolve([count, Number(windowMs)] as [number, number]);
    },
  }),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

// getPanchang reads through panchang-cache.repo.js, which uses drizzle's
// db.select()/db.insert() chain — not the tagged-template sqlClient stub
// above. Force every lookup to miss so each request does a real compute,
// same as test/panchang-cache-arbitrary-location.test.ts's mock shape.
vi.mock('../src/modules/astro/panchang-cache.repo.js', () => ({
  findCachedPanchang: vi.fn().mockResolvedValue(undefined),
  upsertCachedPanchang: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: vi.fn() })),
}));

const { createApp } = await import('../src/app.js');

describe('GET /v1/panchang — rate limiting', () => {
  beforeEach(() => {
    store.clear();
  });

  it('allows up to 30 requests in a 60s window, then rejects the 31st with 429', async () => {
    const app = createApp();

    for (let i = 0; i < 30; i++) {
      const res = await app.request('/v1/panchang?lat=28.6139&lon=77.209&date=2026-07-31');
      expect(res.status).toBe(200);
    }

    const res31 = await app.request('/v1/panchang?lat=28.6139&lon=77.209&date=2026-07-31');
    expect(res31.status).toBe(429);
  }, 30_000);
});

describe('GET /v1/panchang/month — rate limiting', () => {
  beforeEach(() => {
    store.clear();
  });

  it('allows up to 30 requests in a 60s window, then rejects the 31st with 429', async () => {
    const app = createApp();

    for (let i = 0; i < 30; i++) {
      const res = await app.request('/v1/panchang/month?year=2026&month=7&lat=28.6139&lon=77.209');
      expect(res.status).toBe(200);
    }

    const res31 = await app.request('/v1/panchang/month?year=2026&month=7&lat=28.6139&lon=77.209');
    expect(res31.status).toBe(429);
  }, 30_000);
});
