import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

// Confirms the new 'horoscope-get' rate limiter (added because GET
// /v1/horoscope is now the sole automatic trigger for 'daily' generation —
// the others were already on-demand-only — which could see a burst right
// after a scheduled push notification fires) is actually WIRED into the
// route, not just defined and unused.
//
// Uses the same in-memory INCR+PEXPIRE stand-in for Redis as
// test/rate-limit.spec.ts, so the real rateLimiter middleware logic runs
// end-to-end through the real route rather than being asserted in isolation.

const store = new Map<string, number>();

vi.mock('../src/config/redis.js', () => ({
  getRedis: () => ({
    eval: (_script: string, numKeys: number, key: string, windowMs: number) => {
      // alertThrottled's 2-key claim script — a harmless passthrough since
      // TELEGRAM_BOT_TOKEN/TELEGRAM_ALERT_CHAT_ID are unset in tests, so
      // sendAlert() short-circuits without a real network call regardless.
      if (numKeys !== 1) return Promise.resolve([1, 0] as [number, number]);
      const count = (store.get(key) ?? 0) + 1;
      store.set(key, count);
      return Promise.resolve([count, Number(windowMs)] as [number, number]);
    },
  }),
}));

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  findHoroscope: vi.fn(),
  requestHoroscopeGeneration: vi.fn(),
  toHoroscopeDto: vi.fn(),
  isStaleGenerating: vi.fn(),
  currentPeriodStart: vi.fn(),
  periodKeyFor: vi.fn(),
  findKundliByUserId: vi.fn(),
  findOwnedBirthProfile: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => ({ verifyIdToken: state.verifyIdToken })),
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  findUserByFirebaseUid: state.findUserByFirebaseUid,
  findActiveUserByFirebaseUid: vi.fn(),
  findActiveUserById: vi.fn(),
  findUserByPhoneE164: vi.fn(),
  insertUser: vi.fn(),
  updateUserById: vi.fn(),
  updateUserWithConsentLog: vi.fn(),
  softDeleteUserById: vi.fn(),
  softDeleteBirthProfilesByOwner: vi.fn(),
  revokeDeviceTokensByUser: vi.fn(),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/modules/horoscope/horoscope.service.js', () => ({
  requestHoroscopeGeneration: state.requestHoroscopeGeneration,
  toHoroscopeDto: state.toHoroscopeDto,
  isStaleGenerating: state.isStaleGenerating,
  currentPeriodStart: state.currentPeriodStart,
  periodKeyFor: state.periodKeyFor,
  runHoroscopeBatch: vi.fn(),
  runAllHoroscopeBatches: vi.fn(),
  runHoroscopeSelfHeal: vi.fn(),
}));

vi.mock('../src/modules/horoscope/horoscope.repo.js', () => ({
  findHoroscope: state.findHoroscope,
}));

vi.mock('../src/modules/kundli/kundli.repo.js', () => ({
  findKundliByUserId: state.findKundliByUserId,
}));

vi.mock('../src/modules/birth-profiles/birth-profiles.repo.js', () => ({
  findOwnedBirthProfile: state.findOwnedBirthProfile,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token' } as const;

describe('GET /v1/horoscope — rate limiting', () => {
  beforeEach(() => {
    store.clear();
    state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
    state.findUserByFirebaseUid
      .mockReset()
      .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
    state.findHoroscope.mockReset().mockResolvedValue(undefined);
    state.requestHoroscopeGeneration.mockReset().mockResolvedValue('generated');
    state.toHoroscopeDto.mockReset();
    state.isStaleGenerating.mockReset().mockReturnValue(false);
    state.currentPeriodStart.mockReset().mockReturnValue('2026-06-26');
    state.periodKeyFor.mockReset().mockReturnValue('2026-06-26');
    state.findKundliByUserId.mockReset().mockResolvedValue(undefined);
    state.findOwnedBirthProfile.mockReset();
  });

  it('allows up to 30 requests in a 60s window, then rejects the 31st with 429', async () => {
    const app = createApp();

    for (let i = 0; i < 30; i++) {
      const res = await app.request('/v1/horoscope', { headers: AUTH });
      expect(res.status).toBe(202);
    }

    const res31 = await app.request('/v1/horoscope', { headers: AUTH });
    expect(res31.status).toBe(429);
  });

  it('buckets by authenticated user id, so a different user is unaffected', async () => {
    const app = createApp();

    for (let i = 0; i < 30; i++) {
      await app.request('/v1/horoscope', { headers: AUTH });
    }
    const exhausted = await app.request('/v1/horoscope', { headers: AUTH });
    expect(exhausted.status).toBe(429);

    state.verifyIdToken.mockResolvedValue(makeDecodedToken('uid-2'));
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-2', firebaseUid: 'uid-2' }),
    );
    const otherUser = await app.request('/v1/horoscope', {
      headers: { Authorization: 'Bearer other-token' },
    });
    expect(otherUser.status).toBe(202);
  });
});
