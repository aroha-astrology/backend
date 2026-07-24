import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeProfileContext, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  resolveActiveProfileContext: vi.fn(),
  listCatalog: vi.fn(),
  bookPooja: vi.fn(),
  cancelBooking: vi.fn(),
  listMyBookings: vi.fn(),
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
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/modules/birth-profiles/profile-context.js', () => ({
  resolveActiveProfileContext: state.resolveActiveProfileContext,
}));

vi.mock('../src/modules/pooja-bookings/pooja-bookings.service.js', () => ({
  listCatalog: state.listCatalog,
  bookPooja: state.bookPooja,
  cancelBooking: state.cancelBooking,
  listMyBookings: state.listMyBookings,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token', 'Content-Type': 'application/json' } as const;

function makeBookingRow(overrides: Record<string, unknown> = {}) {
  const now = new Date('2026-07-23T00:00:00Z');
  return {
    id: 'booking-1',
    poojaId: 'pooja-1',
    panditId: null,
    preferredDate: '2026-08-01',
    shipAddress: '123 MG Road',
    shipPincode: '560001',
    status: 'requested',
    pricePaisePaid: 110000,
    requestedAt: now,
    assignedAt: null,
    completedAt: null,
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
  state.resolveActiveProfileContext.mockReset().mockResolvedValue(makeProfileContext());
  state.listCatalog.mockReset();
  state.bookPooja.mockReset();
  state.cancelBooking.mockReset();
  state.listMyBookings.mockReset();
});

describe('GET /v1/pooja-bookings/catalog', () => {
  it('200s with the active catalog', async () => {
    state.listCatalog.mockResolvedValueOnce([
      {
        id: 'pooja-1',
        name: 'Satyanarayan Pooja',
        description: 'A traditional pooja for prosperity.',
        deity: 'Lord Vishnu',
        basePricePaise: 110000,
        durationMinutes: 90,
        isActive: true,
        createdAt: new Date('2026-01-01'),
      },
    ]);

    const res = await createApp().request('/v1/pooja-bookings/catalog', { headers: AUTH });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([
      {
        id: 'pooja-1',
        name: 'Satyanarayan Pooja',
        description: 'A traditional pooja for prosperity.',
        deity: 'Lord Vishnu',
        basePricePaise: 110000,
        durationMinutes: 90,
      },
    ]);
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/pooja-bookings/catalog');
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/pooja-bookings', () => {
  const BODY = {
    poojaId: '11111111-1111-1111-1111-111111111111',
    preferredDate: '2026-08-01',
    shipAddress: '123 MG Road',
    shipPincode: '560001',
  };

  it('201s with the created booking', async () => {
    state.bookPooja.mockResolvedValueOnce({ outcome: 'booked', booking: makeBookingRow() });

    const res = await createApp().request('/v1/pooja-bookings', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(BODY),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.id).toBe('booking-1');
    expect(body.status).toBe('requested');
    expect(state.bookPooja).toHaveBeenCalledWith('id-1', expect.anything(), BODY);
  });

  it('404s for an unknown or inactive pooja', async () => {
    state.bookPooja.mockResolvedValueOnce({ outcome: 'unknown_pooja' });

    const res = await createApp().request('/v1/pooja-bookings', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(BODY),
    });

    expect(res.status).toBe(404);
  });

  it('409s when the wallet balance is insufficient', async () => {
    state.bookPooja.mockResolvedValueOnce({ outcome: 'insufficient_balance' });

    const res = await createApp().request('/v1/pooja-bookings', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(BODY),
    });

    expect(res.status).toBe(409);
  });

  it('422s on an invalid shipPincode', async () => {
    const res = await createApp().request('/v1/pooja-bookings', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ ...BODY, shipPincode: 'abc' }),
    });

    expect(res.status).toBe(422);
    expect(state.bookPooja).not.toHaveBeenCalled();
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/pooja-bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(BODY),
    });
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/pooja-bookings/:id/cancel', () => {
  it('200s with the refunded booking', async () => {
    state.cancelBooking.mockResolvedValueOnce(makeBookingRow({ status: 'refunded' }));

    const res = await createApp().request(
      '/v1/pooja-bookings/11111111-1111-1111-1111-111111111111/cancel',
      { method: 'POST', headers: AUTH },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe('refunded');
    expect(state.cancelBooking).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      'id-1',
    );
  });

  it('409s when the booking is not found, not owned, or no longer cancellable', async () => {
    state.cancelBooking.mockResolvedValueOnce(undefined);

    const res = await createApp().request(
      '/v1/pooja-bookings/11111111-1111-1111-1111-111111111111/cancel',
      { method: 'POST', headers: AUTH },
    );

    expect(res.status).toBe(409);
  });
});

describe('GET /v1/pooja-bookings/me', () => {
  it("200s with the caller's booking history", async () => {
    state.listMyBookings.mockResolvedValueOnce([makeBookingRow()]);

    const res = await createApp().request('/v1/pooja-bookings/me', { headers: AUTH });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.id).toBe('booking-1');
    expect(state.listMyBookings).toHaveBeenCalledWith('id-1');
  });
});
