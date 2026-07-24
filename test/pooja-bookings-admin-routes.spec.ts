import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';
import type * as EnvModule from '../src/config/env.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  createPandit: vi.fn(),
  adminAssignPandit: vi.fn(),
  adminCompleteBooking: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

// Partial mock: keep every real env field (many other routers read env.*
// during app.ts creation) and only override ADMIN_FIREBASE_UIDS — same
// importOriginal technique already used in test/telegram-bot.spec.ts for a
// different module.
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
  createPandit: state.createPandit,
}));

vi.mock('../src/modules/pooja-bookings/pooja-bookings.service.js', () => ({
  adminAssignPandit: state.adminAssignPandit,
  adminCompleteBooking: state.adminCompleteBooking,
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
  state.createPandit.mockReset();
  state.adminAssignPandit.mockReset();
  state.adminCompleteBooking.mockReset();
  setSignedInUser('admin-uid');
});

describe('POST /v1/admin/pandits', () => {
  const BODY = { displayName: 'Ravi Shastri', city: 'Pune', languages: ['hi', 'mr'] };

  it('201s with the created pandit for an admin caller', async () => {
    state.createPandit.mockResolvedValueOnce({
      id: 'pandit-1',
      displayName: 'Ravi Shastri',
      phone: null,
      city: 'Pune',
      languages: ['hi', 'mr'],
      verified: true,
      active: true,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    });

    const res = await createApp().request('/v1/admin/pandits', {
      method: 'POST',
      headers: ADMIN_AUTH,
      body: JSON.stringify(BODY),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; verified: boolean };
    expect(body.id).toBe('pandit-1');
    expect(body.verified).toBe(true);
    expect(state.createPandit).toHaveBeenCalledWith({
      displayName: 'Ravi Shastri',
      phone: null,
      city: 'Pune',
      languages: ['hi', 'mr'],
      verified: true,
      active: true,
    });
  });

  it('403s for a signed-in user who is not on the admin allowlist', async () => {
    setSignedInUser('not-an-admin');

    const res = await createApp().request('/v1/admin/pandits', {
      method: 'POST',
      headers: ADMIN_AUTH,
      body: JSON.stringify(BODY),
    });

    expect(res.status).toBe(403);
    expect(state.createPandit).not.toHaveBeenCalled();
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/admin/pandits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(BODY),
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/admin/pooja-bookings/:id/assign', () => {
  it('200s with the assigned booking for an admin caller', async () => {
    state.adminAssignPandit.mockResolvedValueOnce({
      id: 'booking-1',
      poojaId: 'pooja-1',
      panditId: 'pandit-1',
      preferredDate: '2026-08-01',
      shipAddress: '123 MG Road',
      shipPincode: '560001',
      status: 'assigned',
      pricePaisePaid: 110000,
      requestedAt: new Date('2026-07-20'),
      assignedAt: new Date('2026-07-23'),
      completedAt: null,
      notes: null,
    });

    const res = await createApp().request(
      '/v1/admin/pooja-bookings/11111111-1111-1111-1111-111111111111/assign',
      {
        method: 'POST',
        headers: ADMIN_AUTH,
        body: JSON.stringify({ panditId: '22222222-2222-2222-2222-222222222222' }),
      },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; panditId: string | null };
    expect(body.status).toBe('assigned');
    expect(body.panditId).toBe('pandit-1');
    expect(state.adminAssignPandit).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    );
  });

  it('404s for an unknown or inactive pandit', async () => {
    state.adminAssignPandit.mockResolvedValueOnce('unknown_pandit');

    const res = await createApp().request(
      '/v1/admin/pooja-bookings/11111111-1111-1111-1111-111111111111/assign',
      {
        method: 'POST',
        headers: ADMIN_AUTH,
        body: JSON.stringify({ panditId: '22222222-2222-2222-2222-222222222222' }),
      },
    );

    expect(res.status).toBe(404);
  });

  it('409s when the booking is not found or not currently requested', async () => {
    state.adminAssignPandit.mockResolvedValueOnce(undefined);

    const res = await createApp().request(
      '/v1/admin/pooja-bookings/11111111-1111-1111-1111-111111111111/assign',
      {
        method: 'POST',
        headers: ADMIN_AUTH,
        body: JSON.stringify({ panditId: '22222222-2222-2222-2222-222222222222' }),
      },
    );

    expect(res.status).toBe(409);
  });

  it('403s for a non-admin caller', async () => {
    setSignedInUser('not-an-admin');

    const res = await createApp().request(
      '/v1/admin/pooja-bookings/11111111-1111-1111-1111-111111111111/assign',
      {
        method: 'POST',
        headers: ADMIN_AUTH,
        body: JSON.stringify({ panditId: '22222222-2222-2222-2222-222222222222' }),
      },
    );

    expect(res.status).toBe(403);
  });
});

describe('POST /v1/admin/pooja-bookings/:id/complete', () => {
  it('200s with the completed booking for an admin caller', async () => {
    state.adminCompleteBooking.mockResolvedValueOnce({
      id: 'booking-1',
      poojaId: 'pooja-1',
      panditId: 'pandit-1',
      preferredDate: '2026-08-01',
      shipAddress: '123 MG Road',
      shipPincode: '560001',
      status: 'completed',
      pricePaisePaid: 110000,
      requestedAt: new Date('2026-07-20'),
      assignedAt: new Date('2026-07-21'),
      completedAt: new Date('2026-08-01'),
      notes: null,
    });

    const res = await createApp().request(
      '/v1/admin/pooja-bookings/11111111-1111-1111-1111-111111111111/complete',
      { method: 'POST', headers: ADMIN_AUTH },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('completed');
  });

  it('409s when the booking is not found or not currently assigned', async () => {
    state.adminCompleteBooking.mockResolvedValueOnce(undefined);

    const res = await createApp().request(
      '/v1/admin/pooja-bookings/11111111-1111-1111-1111-111111111111/complete',
      { method: 'POST', headers: ADMIN_AUTH },
    );

    expect(res.status).toBe(409);
  });
});
