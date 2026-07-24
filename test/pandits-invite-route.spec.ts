import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';
import type * as EnvModule from '../src/config/env.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  invitePandit: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

// Partial mock: keep every real env field and only override
// ADMIN_FIREBASE_UIDS — same importOriginal technique already used in
// test/pooja-bookings-admin-routes.spec.ts.
vi.mock('../src/config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return {
    ...actual,
    env: { ...actual.env, ADMIN_FIREBASE_UIDS: ['admin-uid'] },
  };
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
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/modules/pooja-bookings/pandits.repo.js', () => ({
  createPandit: vi.fn(),
}));

vi.mock('../src/modules/pooja-bookings/pooja-bookings.service.js', () => ({
  adminAssignPandit: vi.fn(),
  adminCompleteBooking: vi.fn(),
  invitePandit: state.invitePandit,
}));

const { createApp } = await import('../src/app.js');

const ADMIN_AUTH = {
  Authorization: 'Bearer admin-token',
  'Content-Type': 'application/json',
} as const;

function setSignedInUser(firebaseUid: string) {
  state.verifyIdToken.mockResolvedValue(makeDecodedToken(firebaseUid));
  state.findUserByFirebaseUid.mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid }));
}

beforeEach(() => {
  state.verifyIdToken.mockReset();
  state.findUserByFirebaseUid.mockReset();
  state.invitePandit.mockReset();
  setSignedInUser('admin-uid');
});

describe('POST /v1/admin/pandits/:id/invite', () => {
  it('200s with the phone that was used, for an admin caller, with no request body', async () => {
    state.invitePandit.mockResolvedValueOnce({ outcome: 'invited', phoneE164: '+919876543210' });

    const res = await createApp().request(
      '/v1/admin/pandits/11111111-1111-1111-1111-111111111111/invite',
      { method: 'POST', headers: ADMIN_AUTH },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { phoneE164: string };
    expect(body).toEqual({ phoneE164: '+919876543210' });
    expect(state.invitePandit).toHaveBeenCalledWith('11111111-1111-1111-1111-111111111111');
  });

  it('404s for an unknown pandit', async () => {
    state.invitePandit.mockResolvedValueOnce({ outcome: 'unknown_pandit' });

    const res = await createApp().request(
      '/v1/admin/pandits/11111111-1111-1111-1111-111111111111/invite',
      { method: 'POST', headers: ADMIN_AUTH },
    );

    expect(res.status).toBe(404);
  });

  it('409s when the pandit already has a provider account', async () => {
    state.invitePandit.mockResolvedValueOnce({ outcome: 'already_invited' });

    const res = await createApp().request(
      '/v1/admin/pandits/11111111-1111-1111-1111-111111111111/invite',
      { method: 'POST', headers: ADMIN_AUTH },
    );

    expect(res.status).toBe(409);
  });

  it('403s for a non-admin caller', async () => {
    setSignedInUser('not-an-admin');

    const res = await createApp().request(
      '/v1/admin/pandits/11111111-1111-1111-1111-111111111111/invite',
      { method: 'POST', headers: ADMIN_AUTH },
    );

    expect(res.status).toBe(403);
    expect(state.invitePandit).not.toHaveBeenCalled();
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request(
      '/v1/admin/pandits/11111111-1111-1111-1111-111111111111/invite',
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    );
    expect(res.status).toBe(401);
  });
});
