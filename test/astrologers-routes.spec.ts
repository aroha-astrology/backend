import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeProfileContext, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  resolveActiveProfileContext: vi.fn(),
  listDirectory: vi.fn(),
  createBooking: vi.fn(),
  cancelBooking: vi.fn(),
  listMyBookings: vi.fn(),
  adminCreateAstrologer: vi.fn(),
  adminUpdateAstrologer: vi.fn(),
  adminConfirmBooking: vi.fn(),
  adminCompleteBooking: vi.fn(),
  toAstrologerDto: vi.fn(),
  toBookingDto: vi.fn(),
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

vi.mock('../src/modules/astrologers/astrologers.service.js', () => ({
  listDirectory: state.listDirectory,
  createBooking: state.createBooking,
  cancelBooking: state.cancelBooking,
  listMyBookings: state.listMyBookings,
  adminCreateAstrologer: state.adminCreateAstrologer,
  adminUpdateAstrologer: state.adminUpdateAstrologer,
  adminConfirmBooking: state.adminConfirmBooking,
  adminCompleteBooking: state.adminCompleteBooking,
  toAstrologerDto: state.toAstrologerDto,
  toBookingDto: state.toBookingDto,
}));

// requireAdmin (src/middleware/auth.ts) is keyed off ADMIN_FIREBASE_UIDS, an
// allowlist of firebaseUid values — NOT email. The default beforeEach mock
// below resolves firebaseUid: 'uid-1', which is deliberately NOT on this
// allowlist, so every test is non-admin unless it explicitly overrides
// findUserByFirebaseUid to return firebaseUid: 'admin-uid-1'.
process.env.ADMIN_FIREBASE_UIDS = 'admin-uid-1';

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token', 'Content-Type': 'application/json' } as const;

const ASTROLOGER_DTO = {
  id: 'astro-1',
  displayName: 'Guru Ji',
  bio: null,
  specialties: ['career'],
  languages: ['en'],
  photoUrl: null,
  ratePaisePerSession: 50000,
  verified: true,
  active: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const BOOKING_DTO = {
  id: 'booking-1',
  userId: 'id-1',
  astrologerId: 'astro-1',
  birthProfileId: null,
  preferredTimeWindow: 'weekday evenings IST',
  status: 'requested',
  pricePaisePaid: 50000,
  requestedAt: '2026-01-01T00:00:00.000Z',
  confirmedAt: null,
  completedAt: null,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
  state.resolveActiveProfileContext.mockReset().mockResolvedValue(makeProfileContext());
  state.listDirectory.mockReset();
  state.createBooking.mockReset();
  state.cancelBooking.mockReset();
  state.listMyBookings.mockReset();
  state.adminCreateAstrologer.mockReset();
  state.adminUpdateAstrologer.mockReset();
  state.adminConfirmBooking.mockReset();
  state.adminCompleteBooking.mockReset();
  state.toAstrologerDto.mockReset().mockReturnValue(ASTROLOGER_DTO);
  state.toBookingDto.mockReset().mockReturnValue(BOOKING_DTO);
});

describe('GET /v1/astrologers', () => {
  it('200s with the mapped directory', async () => {
    state.listDirectory.mockResolvedValueOnce([{ id: 'astro-1' }]);

    const res = await createApp().request('/v1/astrologers', { headers: AUTH });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([ASTROLOGER_DTO]);
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/astrologers');
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/astrologers/:id/book', () => {
  function book(body: unknown) {
    return createApp().request('/v1/astrologers/astro-1/book', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify(body),
    });
  }

  it('201s with the created booking', async () => {
    state.createBooking.mockResolvedValueOnce({ outcome: 'created', booking: { id: 'booking-1' } });

    const res = await book({ preferredTimeWindow: 'weekday evenings IST' });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual(BOOKING_DTO);
    expect(state.createBooking).toHaveBeenCalledWith(
      'id-1',
      'astro-1',
      expect.objectContaining({ birthProfileId: null }),
      { preferredTimeWindow: 'weekday evenings IST' },
    );
  });

  it('404s when the astrologer does not exist', async () => {
    state.createBooking.mockResolvedValueOnce({ outcome: 'astrologer_not_found' });

    const res = await book({ preferredTimeWindow: 'evenings' });

    expect(res.status).toBe(404);
  });

  it('409s when the astrologer is not bookable or the wallet balance is insufficient', async () => {
    state.createBooking.mockResolvedValueOnce({ outcome: 'not_bookable_or_insufficient_balance' });

    const res = await book({ preferredTimeWindow: 'evenings' });

    expect(res.status).toBe(409);
  });

  it('422s when preferredTimeWindow is missing', async () => {
    const res = await book({});
    expect(res.status).toBe(422);
    expect(state.createBooking).not.toHaveBeenCalled();
  });
});

describe('POST /v1/astrologers/:id/bookings/:bookingId/cancel', () => {
  function cancel() {
    return createApp().request('/v1/astrologers/astro-1/bookings/booking-1/cancel', {
      method: 'POST',
      headers: AUTH,
    });
  }

  it('200s with the refunded booking', async () => {
    state.cancelBooking.mockResolvedValueOnce({
      outcome: 'refunded',
      booking: { id: 'booking-1', status: 'refunded' },
    });

    const res = await cancel();

    expect(res.status).toBe(200);
    expect(state.cancelBooking).toHaveBeenCalledWith('astro-1', 'booking-1', 'id-1');
  });

  it('404s when the booking is not found (or not owned)', async () => {
    state.cancelBooking.mockResolvedValueOnce({ outcome: 'not_found' });

    const res = await cancel();

    expect(res.status).toBe(404);
  });

  it('409s when the booking is not in a cancellable state', async () => {
    state.cancelBooking.mockResolvedValueOnce({ outcome: 'not_cancellable' });

    const res = await cancel();

    expect(res.status).toBe(409);
  });
});

describe('GET /v1/astrologers/bookings/me', () => {
  it("200s with the caller's own booking history — and is not shadowed by the /astrologers/{id}/... routes", async () => {
    state.listMyBookings.mockResolvedValueOnce([{ id: 'booking-1' }]);

    const res = await createApp().request('/v1/astrologers/bookings/me', { headers: AUTH });

    expect(res.status).toBe(200);
    expect(state.listMyBookings).toHaveBeenCalledWith('id-1');
    expect(await res.json()).toEqual([BOOKING_DTO]);
  });
});

describe('POST /v1/admin/astrologers', () => {
  it('201s for an allowlisted admin', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'admin-uid-1' }),
    );
    state.adminCreateAstrologer.mockResolvedValueOnce({ id: 'astro-1' });

    const res = await createApp().request('/v1/admin/astrologers', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ displayName: 'Guru Ji', ratePaisePerSession: 50000 }),
    });

    expect(res.status).toBe(201);
  });

  it('403s for a non-admin user', async () => {
    const res = await createApp().request('/v1/admin/astrologers', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ displayName: 'Guru Ji', ratePaisePerSession: 50000 }),
    });

    expect(res.status).toBe(403);
    expect(state.adminCreateAstrologer).not.toHaveBeenCalled();
  });
});

describe('PATCH /v1/admin/astrologers/:id', () => {
  it('200s for an allowlisted admin', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'admin-uid-1' }),
    );
    state.adminUpdateAstrologer.mockResolvedValueOnce({ id: 'astro-1', verified: true });

    const res = await createApp().request('/v1/admin/astrologers/astro-1', {
      method: 'PATCH',
      headers: AUTH,
      body: JSON.stringify({ verified: true }),
    });

    expect(res.status).toBe(200);
    expect(state.adminUpdateAstrologer).toHaveBeenCalledWith('astro-1', { verified: true });
  });
});

describe('POST /v1/admin/astrologers/bookings/:bookingId/confirm', () => {
  it('200s for an allowlisted admin', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'admin-uid-1' }),
    );
    state.adminConfirmBooking.mockResolvedValueOnce({ id: 'booking-1', status: 'confirmed' });

    const res = await createApp().request('/v1/admin/astrologers/bookings/booking-1/confirm', {
      method: 'POST',
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    expect(state.adminConfirmBooking).toHaveBeenCalledWith('booking-1');
  });
});

describe('POST /v1/admin/astrologers/bookings/:bookingId/complete', () => {
  it('200s for an allowlisted admin', async () => {
    state.findUserByFirebaseUid.mockResolvedValue(
      makeUserRow({ id: 'id-1', firebaseUid: 'admin-uid-1' }),
    );
    state.adminCompleteBooking.mockResolvedValueOnce({ id: 'booking-1', status: 'completed' });

    const res = await createApp().request('/v1/admin/astrologers/bookings/booking-1/complete', {
      method: 'POST',
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    expect(state.adminCompleteBooking).toHaveBeenCalledWith('booking-1');
  });
});
