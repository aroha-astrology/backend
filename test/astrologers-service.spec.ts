import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AstrologerBookingRow, AstrologerRow } from '../src/db/schema.js';
import { makeProfileContext } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  findAstrologerById: vi.fn(),
  requestAstrologerBooking: vi.fn(),
  findOwnedBooking: vi.fn(),
  refundBooking: vi.fn(),
  confirmBooking: vi.fn(),
  completeBooking: vi.fn(),
  insertAstrologer: vi.fn(),
  updateAstrologer: vi.fn(),
  listBookableAstrologers: vi.fn(),
  listBookingsForUser: vi.fn(),
  findActiveTokensForUser: vi.fn(),
  sendPushBatch: vi.fn(),
  createUser: vi.fn(),
  findProviderAccountByKindAndRefId: vi.fn(),
  createProviderAccount: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('../src/modules/astrologers/astrologers.repo.js', () => ({
  findAstrologerById: state.findAstrologerById,
  requestAstrologerBooking: state.requestAstrologerBooking,
  findOwnedBooking: state.findOwnedBooking,
  refundBooking: state.refundBooking,
  confirmBooking: state.confirmBooking,
  completeBooking: state.completeBooking,
  insertAstrologer: state.insertAstrologer,
  updateAstrologer: state.updateAstrologer,
  listBookableAstrologers: state.listBookableAstrologers,
  listBookingsForUser: state.listBookingsForUser,
}));

vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  findActiveTokensForUser: state.findActiveTokensForUser,
}));

vi.mock('../src/lib/notifications/fcm.js', () => ({
  sendPushBatch: state.sendPushBatch,
}));

vi.mock('../src/config/firebase.js', () => ({
  getFirebaseAuth: () => ({ createUser: state.createUser }),
}));

vi.mock('../src/modules/providers/provider-accounts.repo.js', () => ({
  findProviderAccountByKindAndRefId: state.findProviderAccountByKindAndRefId,
  createProviderAccount: state.createProviderAccount,
}));

const {
  createBooking,
  cancelBooking,
  adminCreateAstrologer,
  adminUpdateAstrologer,
  adminConfirmBooking,
  adminCompleteBooking,
  adminInviteAstrologer,
  notifyBookingStatus,
  toAstrologerDto,
  toBookingDto,
} = await import('../src/modules/astrologers/astrologers.service.js');

function makeAstrologerRow(overrides: Partial<AstrologerRow> = {}): AstrologerRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'astro-1',
    userId: null,
    displayName: 'Guru Ji',
    bio: null,
    specialties: ['career'],
    languages: ['en'],
    photoUrl: null,
    ratePaisePerSession: 50000,
    verified: true,
    active: true,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeBookingRow(overrides: Partial<AstrologerBookingRow> = {}): AstrologerBookingRow {
  const now = new Date('2026-01-01T00:00:00Z');
  return {
    id: 'booking-1',
    userId: 'user-1',
    astrologerId: 'astro-1',
    birthProfileId: null,
    preferredTimeWindow: 'weekday evenings IST',
    status: 'requested',
    pricePaisePaid: 50000,
    requestedAt: now,
    confirmedAt: null,
    completedAt: null,
    notes: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(state).forEach((fn) => fn.mockReset());
});

describe('createBooking', () => {
  it("returns 'astrologer_not_found' without attempting a debit when the astrologer doesn't exist", async () => {
    state.findAstrologerById.mockResolvedValueOnce(undefined);

    const result = await createBooking('user-1', 'astro-1', makeProfileContext(), {
      preferredTimeWindow: 'evenings',
    });

    expect(result).toEqual({ outcome: 'astrologer_not_found' });
    expect(state.requestAstrologerBooking).not.toHaveBeenCalled();
  });

  it("bundles 'not_bookable' and 'insufficient_balance' into one conflict outcome", async () => {
    state.findAstrologerById.mockResolvedValueOnce(makeAstrologerRow());
    state.requestAstrologerBooking.mockResolvedValueOnce('insufficient_balance');

    const result = await createBooking('user-1', 'astro-1', makeProfileContext(), {
      preferredTimeWindow: 'evenings',
    });

    expect(result).toEqual({ outcome: 'not_bookable_or_insufficient_balance' });
  });

  it('passes the resolved profile birthProfileId through, defaulting notes to null', async () => {
    state.findAstrologerById.mockResolvedValueOnce(makeAstrologerRow());
    const booking = makeBookingRow();
    state.requestAstrologerBooking.mockResolvedValueOnce(booking);

    const result = await createBooking(
      'user-1',
      'astro-1',
      makeProfileContext({ birthProfileId: 'profile-a' }),
      { preferredTimeWindow: 'weekday evenings IST' },
    );

    expect(state.requestAstrologerBooking).toHaveBeenCalledWith(
      'user-1',
      'astro-1',
      'profile-a',
      'weekday evenings IST',
      null,
    );
    expect(result).toEqual({ outcome: 'created', booking });
  });
});

describe('cancelBooking', () => {
  it("returns 'not_found' when the booking doesn't belong to this user", async () => {
    state.findOwnedBooking.mockResolvedValueOnce(undefined);

    const result = await cancelBooking('astro-1', 'booking-1', 'user-1');

    expect(result).toEqual({ outcome: 'not_found' });
    expect(state.refundBooking).not.toHaveBeenCalled();
  });

  it("returns 'not_found' when the booking belongs to a DIFFERENT astrologer than the URL's :id", async () => {
    state.findOwnedBooking.mockResolvedValueOnce(makeBookingRow({ astrologerId: 'astro-OTHER' }));

    const result = await cancelBooking('astro-1', 'booking-1', 'user-1');

    expect(result).toEqual({ outcome: 'not_found' });
    expect(state.refundBooking).not.toHaveBeenCalled();
  });

  it("returns 'not_cancellable' without calling refundBooking when already confirmed", async () => {
    state.findOwnedBooking.mockResolvedValueOnce(makeBookingRow({ status: 'confirmed' }));

    const result = await cancelBooking('astro-1', 'booking-1', 'user-1');

    expect(result).toEqual({ outcome: 'not_cancellable' });
    expect(state.refundBooking).not.toHaveBeenCalled();
  });

  it("returns 'not_cancellable' when refundBooking loses the CAS race despite the pre-check seeing 'requested'", async () => {
    state.findOwnedBooking.mockResolvedValueOnce(makeBookingRow({ status: 'requested' }));
    state.refundBooking.mockResolvedValueOnce(undefined);

    const result = await cancelBooking('astro-1', 'booking-1', 'user-1');

    expect(result).toEqual({ outcome: 'not_cancellable' });
  });

  it('refunds, fires a notification, and returns the updated booking on success', async () => {
    state.findOwnedBooking.mockResolvedValueOnce(makeBookingRow({ status: 'requested' }));
    const refunded = makeBookingRow({ status: 'refunded' });
    state.refundBooking.mockResolvedValueOnce(refunded);
    state.findActiveTokensForUser.mockResolvedValueOnce([]);

    const result = await cancelBooking('astro-1', 'booking-1', 'user-1');

    expect(result).toEqual({ outcome: 'refunded', booking: refunded });
    expect(state.refundBooking).toHaveBeenCalledWith('booking-1', 'user-1');
  });
});

describe('adminCreateAstrologer', () => {
  it('defaults optional fields (specialties/languages to [], verified to false, active to true)', async () => {
    state.insertAstrologer.mockResolvedValueOnce(makeAstrologerRow());

    await adminCreateAstrologer({ displayName: 'Guru Ji', ratePaisePerSession: 50000 });

    expect(state.insertAstrologer).toHaveBeenCalledWith({
      userId: null,
      displayName: 'Guru Ji',
      bio: null,
      specialties: [],
      languages: [],
      photoUrl: null,
      ratePaisePerSession: 50000,
      verified: false,
      active: true,
    });
  });
});

describe('adminUpdateAstrologer', () => {
  it('throws NOT_FOUND when the astrologer id does not exist', async () => {
    state.updateAstrologer.mockResolvedValueOnce(undefined);

    await expect(adminUpdateAstrologer('astro-1', { verified: true })).rejects.toThrow(
      'Astrologer not found',
    );
  });

  it('only forwards defined fields to the repo patch', async () => {
    state.updateAstrologer.mockResolvedValueOnce(makeAstrologerRow({ verified: true }));

    await adminUpdateAstrologer('astro-1', { verified: true });

    expect(state.updateAstrologer).toHaveBeenCalledWith('astro-1', { verified: true });
  });
});

describe('adminConfirmBooking / adminCompleteBooking', () => {
  it('adminConfirmBooking throws CONFLICT when the booking is not requested', async () => {
    state.confirmBooking.mockResolvedValueOnce(undefined);

    await expect(adminConfirmBooking('booking-1')).rejects.toThrow(
      'Booking is not in a confirmable state (must be "requested")',
    );
  });

  it('adminConfirmBooking notifies the customer and returns the row on success', async () => {
    const confirmed = makeBookingRow({ status: 'confirmed', confirmedAt: new Date() });
    state.confirmBooking.mockResolvedValueOnce(confirmed);
    state.findActiveTokensForUser.mockResolvedValueOnce([]);

    const row = await adminConfirmBooking('booking-1');

    expect(row).toEqual(confirmed);
  });

  it('adminCompleteBooking throws CONFLICT when the booking is not confirmed', async () => {
    state.completeBooking.mockResolvedValueOnce(undefined);

    await expect(adminCompleteBooking('booking-1')).rejects.toThrow(
      'Booking is not in a completable state (must be "confirmed")',
    );
  });
});

describe('notifyBookingStatus', () => {
  it('sends a push with status-specific copy to all active tokens', async () => {
    state.findActiveTokensForUser.mockResolvedValueOnce([{ token: 'tok-abc' }]);

    await notifyBookingStatus('user-1', 'booking-1', 'confirmed');

    expect(state.sendPushBatch).toHaveBeenCalledWith(
      ['tok-abc'],
      expect.any(String),
      expect.any(String),
      {
        type: 'astrologer_booking_status',
        bookingId: 'booking-1',
        status: 'confirmed',
        navigate: '/astrologers/bookings',
      },
    );
  });

  it('sends nothing when the user has no active tokens', async () => {
    state.findActiveTokensForUser.mockResolvedValueOnce([]);

    await notifyBookingStatus('user-1', 'booking-1', 'completed');

    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });

  it('never throws even when sendPushBatch rejects', async () => {
    state.findActiveTokensForUser.mockResolvedValueOnce([{ token: 'tok-abc' }]);
    state.sendPushBatch.mockRejectedValueOnce(new Error('FCM down'));

    await expect(notifyBookingStatus('user-1', 'booking-1', 'refunded')).resolves.toBeUndefined();
  });
});

describe('toAstrologerDto / toBookingDto', () => {
  it('formats Date fields as ISO strings and passes through nullable fields as-is', () => {
    const dto = toAstrologerDto(makeAstrologerRow());
    expect(dto.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(dto.bio).toBeNull();
  });

  it('formats unset confirmedAt/completedAt as null', () => {
    const dto = toBookingDto(makeBookingRow());
    expect(dto.confirmedAt).toBeNull();
    expect(dto.completedAt).toBeNull();
    expect(dto.requestedAt).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('adminInviteAstrologer', () => {
  it('404s when the astrologer does not exist', async () => {
    state.findAstrologerById.mockResolvedValueOnce(undefined);

    await expect(adminInviteAstrologer('astro-1', 'guru@example.com')).rejects.toThrow(
      'Astrologer not found',
    );
    expect(state.createUser).not.toHaveBeenCalled();
  });

  it('409s when the astrologer has already been invited', async () => {
    state.findAstrologerById.mockResolvedValueOnce(makeAstrologerRow());
    state.findProviderAccountByKindAndRefId.mockResolvedValueOnce({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'fb-1',
      displayName: 'Guru Ji',
      createdAt: new Date(),
    });

    await expect(adminInviteAstrologer('astro-1', 'guru@example.com')).rejects.toThrow(
      'Astrologer has already been invited',
    );
    expect(state.createUser).not.toHaveBeenCalled();
  });

  it('creates a Firebase user + provider_accounts row and returns the temporary credentials', async () => {
    state.findAstrologerById.mockResolvedValueOnce(makeAstrologerRow({ displayName: 'Guru Ji' }));
    state.findProviderAccountByKindAndRefId.mockResolvedValueOnce(undefined);
    state.createUser.mockResolvedValueOnce({ uid: 'fb-new-uid-1' });
    state.createProviderAccount.mockResolvedValueOnce({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'fb-new-uid-1',
      displayName: 'Guru Ji',
      createdAt: new Date(),
    });

    const result = await adminInviteAstrologer('astro-1', 'guru@example.com');

    expect(state.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'guru@example.com' }),
    );
    expect(state.createProviderAccount).toHaveBeenCalledWith({
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'fb-new-uid-1',
      displayName: 'Guru Ji',
    });
    expect(result.email).toBe('guru@example.com');
    expect(typeof result.temporaryPassword).toBe('string');
    expect(result.temporaryPassword.length).toBeGreaterThan(0);
  });
});
