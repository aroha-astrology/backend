import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeProfileContext } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  findPoojaCatalogItem: vi.fn(),
  createPoojaBooking: vi.fn(),
  refundPoojaBooking: vi.fn(),
  assignPanditToBooking: vi.fn(),
  completePoojaBooking: vi.fn(),
  listPoojaBookingsForUser: vi.fn(),
  listActivePoojas: vi.fn(),
  findPanditById: vi.fn(),
  updatePanditEmail: vi.fn(),
  findActiveTokensForUser: vi.fn(),
  sendPushBatch: vi.fn(),
  findProviderAccountByKindAndRefId: vi.fn(),
  createProviderAccount: vi.fn(),
  createFirebaseUser: vi.fn(),
}));

vi.mock('../src/modules/pooja-bookings/pooja-bookings.repo.js', () => ({
  findPoojaCatalogItem: state.findPoojaCatalogItem,
  createPoojaBooking: state.createPoojaBooking,
  refundPoojaBooking: state.refundPoojaBooking,
  assignPanditToBooking: state.assignPanditToBooking,
  completePoojaBooking: state.completePoojaBooking,
  listPoojaBookingsForUser: state.listPoojaBookingsForUser,
  listActivePoojas: state.listActivePoojas,
}));

vi.mock('../src/modules/pooja-bookings/pandits.repo.js', () => ({
  findPanditById: state.findPanditById,
  updatePanditEmail: state.updatePanditEmail,
}));

vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  findActiveTokensForUser: state.findActiveTokensForUser,
}));

vi.mock('../src/lib/notifications/fcm.js', () => ({
  sendPushBatch: state.sendPushBatch,
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../src/modules/providers/provider-accounts.repo.js', () => ({
  findProviderAccountByKindAndRefId: state.findProviderAccountByKindAndRefId,
  createProviderAccount: state.createProviderAccount,
}));

vi.mock('../src/config/firebase.js', () => ({
  getFirebaseAuth: () => ({ createUser: state.createFirebaseUser }),
}));

const {
  bookPooja,
  cancelBooking,
  listMyBookings,
  adminAssignPandit,
  adminCompleteBooking,
  listCatalog,
  invitePandit,
} = await import('../src/modules/pooja-bookings/pooja-bookings.service.js');
const { logger } = await import('../src/lib/logger.js');

const BOOK_INPUT = {
  poojaId: 'pooja-1',
  preferredDate: '2026-08-01',
  shipAddress: '123 MG Road',
  shipPincode: '560001',
};

beforeEach(() => {
  vi.clearAllMocks();
  state.findActiveTokensForUser.mockResolvedValue([{ token: 'tok-1' }]);
  state.sendPushBatch.mockResolvedValue({ success: 1, failure: 0 });
});

describe('bookPooja', () => {
  it('returns unknown_pooja without touching the wallet when the pooja does not exist', async () => {
    state.findPoojaCatalogItem.mockResolvedValueOnce(undefined);

    const result = await bookPooja('user-1', makeProfileContext(), BOOK_INPUT);

    expect(result).toEqual({ outcome: 'unknown_pooja' });
    expect(state.createPoojaBooking).not.toHaveBeenCalled();
  });

  it('returns unknown_pooja when the pooja exists but is inactive', async () => {
    state.findPoojaCatalogItem.mockResolvedValueOnce({
      id: 'pooja-1',
      isActive: false,
      basePricePaise: 110000,
    });

    const result = await bookPooja('user-1', makeProfileContext(), BOOK_INPUT);

    expect(result).toEqual({ outcome: 'unknown_pooja' });
  });

  it('charges the catalog price (never a client-supplied one) and returns the booking on success', async () => {
    state.findPoojaCatalogItem.mockResolvedValueOnce({
      id: 'pooja-1',
      isActive: true,
      basePricePaise: 110000,
    });
    state.createPoojaBooking.mockResolvedValueOnce({ id: 'booking-1', status: 'requested' });

    const result = await bookPooja(
      'user-1',
      makeProfileContext({ birthProfileId: 'profile-a' }),
      BOOK_INPUT,
    );

    expect(state.createPoojaBooking).toHaveBeenCalledWith({
      userId: 'user-1',
      birthProfileId: 'profile-a',
      poojaId: 'pooja-1',
      preferredDate: '2026-08-01',
      shipAddress: '123 MG Road',
      shipPincode: '560001',
      notes: null,
      pricePaise: 110000,
    });
    expect(result).toEqual({
      outcome: 'booked',
      booking: { id: 'booking-1', status: 'requested' },
    });
  });

  it('returns insufficient_balance when createPoojaBooking returns undefined', async () => {
    state.findPoojaCatalogItem.mockResolvedValueOnce({
      id: 'pooja-1',
      isActive: true,
      basePricePaise: 110000,
    });
    state.createPoojaBooking.mockResolvedValueOnce(undefined);

    const result = await bookPooja('user-1', makeProfileContext(), BOOK_INPUT);

    expect(result).toEqual({ outcome: 'insufficient_balance' });
  });
});

describe('cancelBooking', () => {
  it('returns undefined and sends no notification when the booking is not refundable', async () => {
    state.refundPoojaBooking.mockResolvedValueOnce(undefined);

    const result = await cancelBooking('booking-1', 'user-1');

    expect(result).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });

  it('fires a refunded push notification on success', async () => {
    state.refundPoojaBooking.mockResolvedValueOnce({
      id: 'booking-1',
      userId: 'user-1',
      status: 'refunded',
    });

    const result = await cancelBooking('booking-1', 'user-1');
    expect(result).toMatchObject({ id: 'booking-1', status: 'refunded' });

    // Notification is fire-and-forget — flush microtasks before asserting.
    await Promise.resolve();
    await Promise.resolve();
    expect(state.findActiveTokensForUser).toHaveBeenCalledWith('user-1');
    expect(state.sendPushBatch).toHaveBeenCalledWith(
      ['tok-1'],
      expect.any(String),
      expect.any(String),
      { type: 'pooja_booking_refunded', bookingId: 'booking-1' },
    );
  });

  it('logs (never throws) when the notification push fails', async () => {
    state.refundPoojaBooking.mockResolvedValueOnce({
      id: 'booking-1',
      userId: 'user-1',
      status: 'refunded',
    });
    state.sendPushBatch.mockRejectedValueOnce(new Error('FCM down'));

    await expect(cancelBooking('booking-1', 'user-1')).resolves.toMatchObject({ id: 'booking-1' });
    await Promise.resolve();
    await Promise.resolve();
    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'pooja-bookings:push failed',
    );
  });
});

describe('listMyBookings', () => {
  it('delegates to listPoojaBookingsForUser', async () => {
    state.listPoojaBookingsForUser.mockResolvedValueOnce([{ id: 'booking-1' }]);

    const result = await listMyBookings('user-1');

    expect(state.listPoojaBookingsForUser).toHaveBeenCalledWith('user-1');
    expect(result).toEqual([{ id: 'booking-1' }]);
  });
});

describe('listCatalog', () => {
  it('delegates to listActivePoojas', async () => {
    state.listActivePoojas.mockResolvedValueOnce([{ id: 'pooja-1' }]);

    const result = await listCatalog();

    expect(result).toEqual([{ id: 'pooja-1' }]);
  });
});

describe('adminAssignPandit', () => {
  it('returns unknown_pandit without assigning when the pandit does not exist', async () => {
    state.findPanditById.mockResolvedValueOnce(undefined);

    const result = await adminAssignPandit('booking-1', 'pandit-1');

    expect(result).toBe('unknown_pandit');
    expect(state.assignPanditToBooking).not.toHaveBeenCalled();
  });

  it('returns unknown_pandit when the pandit exists but is inactive', async () => {
    state.findPanditById.mockResolvedValueOnce({ id: 'pandit-1', active: false });

    const result = await adminAssignPandit('booking-1', 'pandit-1');

    expect(result).toBe('unknown_pandit');
  });

  it('assigns and fires an assigned push notification on success', async () => {
    state.findPanditById.mockResolvedValueOnce({
      id: 'pandit-1',
      displayName: 'Ravi Shastri',
      active: true,
    });
    state.assignPanditToBooking.mockResolvedValueOnce({
      id: 'booking-1',
      userId: 'user-1',
      status: 'assigned',
    });

    const result = await adminAssignPandit('booking-1', 'pandit-1');

    expect(result).toMatchObject({ id: 'booking-1', status: 'assigned' });
    await Promise.resolve();
    await Promise.resolve();
    expect(state.sendPushBatch).toHaveBeenCalledWith(
      ['tok-1'],
      expect.any(String),
      expect.stringContaining('Ravi Shastri'),
      { type: 'pooja_booking_assigned', bookingId: 'booking-1' },
    );
  });

  it('returns undefined without notifying when the booking is no longer requested', async () => {
    state.findPanditById.mockResolvedValueOnce({
      id: 'pandit-1',
      displayName: 'Ravi',
      active: true,
    });
    state.assignPanditToBooking.mockResolvedValueOnce(undefined);

    const result = await adminAssignPandit('booking-1', 'pandit-1');

    expect(result).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });
});

describe('adminCompleteBooking', () => {
  it('completes and fires a completed push notification on success', async () => {
    state.completePoojaBooking.mockResolvedValueOnce({
      id: 'booking-1',
      userId: 'user-1',
      status: 'completed',
    });

    const result = await adminCompleteBooking('booking-1');

    expect(result).toMatchObject({ id: 'booking-1', status: 'completed' });
    await Promise.resolve();
    await Promise.resolve();
    expect(state.sendPushBatch).toHaveBeenCalledWith(
      ['tok-1'],
      expect.any(String),
      expect.any(String),
      { type: 'pooja_booking_completed', bookingId: 'booking-1' },
    );
  });

  it('returns undefined without notifying when the booking is not currently assigned', async () => {
    state.completePoojaBooking.mockResolvedValueOnce(undefined);

    const result = await adminCompleteBooking('booking-1');

    expect(result).toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();
    expect(state.sendPushBatch).not.toHaveBeenCalled();
  });
});

describe('invitePandit', () => {
  it('returns unknown_pandit when the pandit does not exist', async () => {
    state.findPanditById.mockResolvedValueOnce(undefined);

    const result = await invitePandit('pandit-1', 'ravi.shastri@example.com');

    expect(result).toEqual({ outcome: 'unknown_pandit' });
    expect(state.createFirebaseUser).not.toHaveBeenCalled();
  });

  it('returns already_invited when a provider_accounts row already exists for this pandit', async () => {
    state.findPanditById.mockResolvedValueOnce({ id: 'pandit-1', displayName: 'Ravi Shastri' });
    state.findProviderAccountByKindAndRefId.mockResolvedValueOnce({ id: 'pa-1' });

    const result = await invitePandit('pandit-1', 'ravi.shastri@example.com');

    expect(result).toEqual({ outcome: 'already_invited' });
    expect(state.findProviderAccountByKindAndRefId).toHaveBeenCalledWith('pandit', 'pandit-1');
    expect(state.createFirebaseUser).not.toHaveBeenCalled();
  });

  it('creates the Firebase user, records the email, creates the provider account, and returns the temporary password', async () => {
    state.findPanditById.mockResolvedValueOnce({ id: 'pandit-1', displayName: 'Ravi Shastri' });
    state.findProviderAccountByKindAndRefId.mockResolvedValueOnce(undefined);
    state.createFirebaseUser.mockResolvedValueOnce({ uid: 'firebase-uid-1' });

    const result = await invitePandit('pandit-1', 'ravi.shastri@example.com');

    expect(state.createFirebaseUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'ravi.shastri@example.com' }),
    );
    expect(state.updatePanditEmail).toHaveBeenCalledWith('pandit-1', 'ravi.shastri@example.com');
    expect(state.createProviderAccount).toHaveBeenCalledWith({
      kind: 'pandit',
      refId: 'pandit-1',
      firebaseUid: 'firebase-uid-1',
      displayName: 'Ravi Shastri',
    });
    expect(result).toEqual({
      outcome: 'invited',
      email: 'ravi.shastri@example.com',
      temporaryPassword: expect.any(String),
    });
  });
});
