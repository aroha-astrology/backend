import { describe, expect, it, vi } from 'vitest';

// GET /v1/panchang and /v1/panchang/month take an optional IANA `tz` so a user
// abroad gets their own clock. Same app/mocks shape as panchang-ratelimit.spec.ts.

vi.mock('../src/config/redis.js', () => ({
  getRedis: () => ({
    eval: () => Promise.resolve([1, 60_000] as [number, number]),
  }),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

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

const NY = 'lat=40.7128&lon=-74.006&date=2026-10-20';

describe('GET /v1/panchang?tz=', () => {
  it('a real zone moves the clock times to that zone', async () => {
    const app = createApp();
    const ist = (await (await app.request(`/v1/panchang?${NY}`)).json()) as { sunriseTime: string };
    const res = await app.request(`/v1/panchang?${NY}&tz=America/New_York`);
    expect(res.status).toBe(200);
    const local = (await res.json()) as { sunriseTime: string; dayTimesMode: string };
    expect(local.sunriseTime.startsWith('07:')).toBe(true);
    expect(ist.sunriseTime.startsWith('16:')).toBe(true);
    expect(local.dayTimesMode).toBe('sunrise');
  }, 60_000);

  it('an unknown zone is refused as a validation error', async () => {
    const app = createApp();
    const res = await app.request(`/v1/panchang?${NY}&tz=Mars/Olympus_Mons`);
    // The app's validation hook answers 400 for every invalid query, like the other routes.
    expect(res.status).toBe(400);
  });

  it('the month route accepts tz too', async () => {
    const app = createApp();
    const res = await app.request('/v1/panchang/month?year=2026&month=2&lat=40.7128&lon=-74.006&tz=America/New_York');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { days: unknown[] };
    expect(body.days).toHaveLength(28);
  }, 120_000);
});
