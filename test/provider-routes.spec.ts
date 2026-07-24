import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findProviderAccountByFirebaseUid: vi.fn(),
  getProviderMe: vi.fn(),
  listProviderBookings: vi.fn(),
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

vi.mock('../src/modules/providers/provider-accounts.repo.js', () => ({
  findProviderAccountByFirebaseUid: state.findProviderAccountByFirebaseUid,
}));

vi.mock('../src/modules/providers/provider.service.js', () => ({
  getProviderMe: state.getProviderMe,
  listProviderBookings: state.listProviderBookings,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token' } as const;

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue({ uid: 'provider-uid-1' });
  state.findProviderAccountByFirebaseUid.mockReset().mockResolvedValue({
    id: 'provider-1',
    kind: 'astrologer',
    refId: 'astro-1',
    firebaseUid: 'provider-uid-1',
    displayName: 'Guru Ji',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
  state.getProviderMe.mockReset();
  state.listProviderBookings.mockReset();
});

describe('GET /v1/provider/me', () => {
  it("200s with the caller's own identity + profile", async () => {
    state.getProviderMe.mockResolvedValueOnce({
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
      astrologer: null,
    });

    const res = await createApp().request('/v1/provider/me', { headers: AUTH });

    expect(res.status).toBe(200);
    expect(state.getProviderMe).toHaveBeenCalledWith({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
    });
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/provider/me');
    expect(res.status).toBe(401);
  });

  it('401s when no provider_accounts row matches', async () => {
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce(undefined);
    const res = await createApp().request('/v1/provider/me', { headers: AUTH });
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/provider/bookings', () => {
  it("200s with the caller's own booking list", async () => {
    state.listProviderBookings.mockResolvedValueOnce([{ id: 'booking-1' }]);

    const res = await createApp().request('/v1/provider/bookings', { headers: AUTH });

    expect(res.status).toBe(200);
    expect(state.listProviderBookings).toHaveBeenCalledWith({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
    });
    expect(await res.json()).toEqual([{ id: 'booking-1' }]);
  });
});
