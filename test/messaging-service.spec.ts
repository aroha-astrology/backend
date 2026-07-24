import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  findBookingById: vi.fn(),
  findPoojaBookingById: vi.fn(),
  findProviderAccountByKindAndRefId: vi.fn(),
  createMessage: vi.fn(),
  listMessagesForBooking: vi.fn(),
  markMessagesRead: vi.fn(),
  findActiveTokensForUser: vi.fn(),
  sendPushBatch: vi.fn(),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('../src/modules/astrologers/astrologers.repo.js', () => ({
  findBookingById: state.findBookingById,
}));

vi.mock('../src/modules/pooja-bookings/pooja-bookings.repo.js', () => ({
  findPoojaBookingById: state.findPoojaBookingById,
}));

vi.mock('../src/modules/providers/provider-accounts.repo.js', () => ({
  findProviderAccountByKindAndRefId: state.findProviderAccountByKindAndRefId,
}));

vi.mock('../src/modules/messaging/messaging.repo.js', () => ({
  createMessage: state.createMessage,
  listMessagesForBooking: state.listMessagesForBooking,
  markMessagesRead: state.markMessagesRead,
}));

vi.mock('../src/modules/device-tokens/device-tokens.repo.js', () => ({
  findActiveTokensForUser: state.findActiveTokensForUser,
}));

vi.mock('../src/lib/notifications/fcm.js', () => ({
  sendPushBatch: state.sendPushBatch,
}));

const { listMessages, sendMessage } = await import('../src/modules/messaging/messaging.service.js');

function makeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'booking-1',
    userId: 'user-1',
    astrologerId: 'astro-1',
    birthProfileId: null,
    preferredTimeWindow: 'evenings',
    status: 'confirmed',
    pricePaisePaid: 50000,
    requestedAt: new Date('2026-01-01T00:00:00Z'),
    confirmedAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: null,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makePoojaBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pooja-booking-1',
    userId: 'user-1',
    birthProfileId: null,
    poojaId: 'pooja-1',
    panditId: 'pandit-1',
    preferredDate: '2026-08-01',
    shipAddress: '123 MG Road',
    shipPincode: '560001',
    status: 'assigned',
    pricePaisePaid: 110000,
    requestedAt: new Date('2026-01-01T00:00:00Z'),
    assignedAt: new Date('2026-01-01T00:00:00Z'),
    completedAt: null,
    notes: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    bookingType: 'astrologer',
    bookingId: 'booking-1',
    senderRole: 'customer',
    senderUserId: 'user-1',
    senderProviderAccountId: null,
    body: 'hello',
    readAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  Object.values(state).forEach((fn) => fn.mockReset());
  // NOTE — deviation from the plan document: markMessagesRead's real
  // implementation always returns a Promise<void> (it's an async function);
  // messaging.service.ts#listMessages fire-and-forgets it via
  // `markMessagesRead(...).catch(...)`, which requires a Promise-returning
  // mock. A bare `vi.fn()` (the plan's own default, with no
  // mockResolvedValue) returns `undefined`, and `undefined.catch` throws —
  // verified directly. Give it a default resolved value here so callers only
  // need `mockRejectedValueOnce` when they want to test the failure path.
  state.markMessagesRead.mockResolvedValue(undefined);
});

describe('sendMessage', () => {
  it('rejects an unknown bookingType with a 400', async () => {
    await expect(
      sendMessage({ role: 'customer', userId: 'user-1' }, 'not-a-real-type', 'booking-1', 'hi'),
    ).rejects.toThrow('Invalid booking type: not-a-real-type');
    expect(state.findBookingById).not.toHaveBeenCalled();
  });

  it('404s when the astrologer booking does not exist', async () => {
    state.findBookingById.mockResolvedValueOnce(undefined);

    await expect(
      sendMessage({ role: 'customer', userId: 'user-1' }, 'astrologer', 'booking-1', 'hi'),
    ).rejects.toThrow('Booking not found');
  });

  it("403s a customer who isn't the booking's own userId", async () => {
    state.findBookingById.mockResolvedValueOnce(makeBooking({ userId: 'someone-else' }));

    await expect(
      sendMessage({ role: 'customer', userId: 'user-1' }, 'astrologer', 'booking-1', 'hi'),
    ).rejects.toThrow('Not your booking');
  });

  it("403s a provider who isn't the booking's assigned astrologer", async () => {
    state.findBookingById.mockResolvedValueOnce(makeBooking({ astrologerId: 'astro-OTHER' }));

    await expect(
      sendMessage(
        {
          role: 'provider',
          providerId: 'provider-1',
          providerKind: 'astrologer',
          providerRefId: 'astro-1',
        },
        'astrologer',
        'booking-1',
        'hi',
      ),
    ).rejects.toThrow('Not your assigned booking');
  });

  it('inserts the message, notifies the provider, and returns the DTO when the customer sends it', async () => {
    state.findBookingById.mockResolvedValueOnce(makeBooking());
    state.createMessage.mockResolvedValueOnce(makeMessage());
    state.findProviderAccountByKindAndRefId.mockResolvedValueOnce({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'fb-1',
      displayName: 'Guru Ji',
      createdAt: new Date(),
    });
    state.findActiveTokensForUser.mockResolvedValueOnce([{ token: 'tok-1' }]);

    const dto = await sendMessage(
      { role: 'customer', userId: 'user-1' },
      'astrologer',
      'booking-1',
      'hello',
    );

    expect(state.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingType: 'astrologer',
        bookingId: 'booking-1',
        senderRole: 'customer',
        senderUserId: 'user-1',
        senderProviderAccountId: null,
        body: 'hello',
      }),
    );
    expect(dto).toMatchObject({ id: 'msg-1', body: 'hello' });
  });

  it('inserts the message and notifies the customer when the provider sends it', async () => {
    state.findBookingById.mockResolvedValueOnce(makeBooking());
    state.createMessage.mockResolvedValueOnce(
      makeMessage({
        senderRole: 'provider',
        senderUserId: null,
        senderProviderAccountId: 'provider-1',
      }),
    );
    state.findActiveTokensForUser.mockResolvedValueOnce([]);

    await sendMessage(
      {
        role: 'provider',
        providerId: 'provider-1',
        providerKind: 'astrologer',
        providerRefId: 'astro-1',
      },
      'astrologer',
      'booking-1',
      'hello back',
    );

    expect(state.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        senderRole: 'provider',
        senderUserId: null,
        senderProviderAccountId: 'provider-1',
      }),
    );
    expect(state.findActiveTokensForUser).toHaveBeenCalledWith('user-1');
  });
});

describe('listMessages', () => {
  it("returns the transcript and marks the OTHER party's messages read, for an authorized customer", async () => {
    state.findBookingById.mockResolvedValueOnce(makeBooking());
    state.listMessagesForBooking.mockResolvedValueOnce([makeMessage()]);

    const rows = await listMessages(
      { role: 'customer', userId: 'user-1' },
      'astrologer',
      'booking-1',
    );

    expect(rows).toHaveLength(1);
    expect(state.markMessagesRead).toHaveBeenCalledWith('astrologer', 'booking-1', 'customer');
  });

  it("403s a provider who isn't the booking's assigned astrologer", async () => {
    state.findBookingById.mockResolvedValueOnce(makeBooking({ astrologerId: 'astro-OTHER' }));

    await expect(
      listMessages(
        {
          role: 'provider',
          providerId: 'provider-1',
          providerKind: 'astrologer',
          providerRefId: 'astro-1',
        },
        'astrologer',
        'booking-1',
      ),
    ).rejects.toThrow('Not your assigned booking');
  });
});

describe('sendMessage / listMessages — bookingType: pooja', () => {
  it('sendMessage succeeds for the booking customer', async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(makePoojaBooking());
    state.createMessage.mockResolvedValueOnce(
      makeMessage({ bookingType: 'pooja', bookingId: 'pooja-booking-1' }),
    );
    state.findActiveTokensForUser.mockResolvedValueOnce([]);

    const dto = await sendMessage(
      { role: 'customer', userId: 'user-1' },
      'pooja',
      'pooja-booking-1',
      'hello',
    );

    expect(state.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ bookingType: 'pooja', bookingId: 'pooja-booking-1' }),
    );
    expect(dto).toMatchObject({ body: 'hello' });
  });

  it("sendMessage succeeds for the booking's assigned pandit", async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(makePoojaBooking());
    state.createMessage.mockResolvedValueOnce(
      makeMessage({ bookingType: 'pooja', bookingId: 'pooja-booking-1', senderRole: 'provider' }),
    );
    state.findActiveTokensForUser.mockResolvedValueOnce([]);

    await sendMessage(
      {
        role: 'provider',
        providerId: 'provider-1',
        providerKind: 'pandit',
        providerRefId: 'pandit-1',
      },
      'pooja',
      'pooja-booking-1',
      'namaste',
    );

    expect(state.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ senderRole: 'provider', senderProviderAccountId: 'provider-1' }),
    );
  });

  it('rejects a caller who is neither the customer nor the assigned pandit', async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(makePoojaBooking());

    await expect(
      sendMessage(
        {
          role: 'provider',
          providerId: 'provider-2',
          providerKind: 'pandit',
          providerRefId: 'pandit-OTHER',
        },
        'pooja',
        'pooja-booking-1',
        'hi',
      ),
    ).rejects.toThrow('Not your assigned booking');
  });

  it('rejects an astrologer provider even if the refId happens to collide', async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(makePoojaBooking());

    await expect(
      sendMessage(
        {
          role: 'provider',
          providerId: 'provider-3',
          providerKind: 'astrologer',
          providerRefId: 'pandit-1',
        },
        'pooja',
        'pooja-booking-1',
        'hi',
      ),
    ).rejects.toThrow('Not your assigned booking');
  });

  it('rejects any provider when the pooja booking has no pandit assigned yet', async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(makePoojaBooking({ panditId: null }));

    await expect(
      sendMessage(
        {
          role: 'provider',
          providerId: 'provider-1',
          providerKind: 'pandit',
          providerRefId: 'pandit-1',
        },
        'pooja',
        'pooja-booking-1',
        'hi',
      ),
    ).rejects.toThrow('Not your assigned booking');
  });

  it('404s when the pooja booking does not exist', async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(undefined);

    await expect(
      sendMessage({ role: 'customer', userId: 'user-1' }, 'pooja', 'missing-booking', 'hi'),
    ).rejects.toThrow('Booking not found');
  });

  it('listMessages returns the transcript for the assigned pandit', async () => {
    state.findPoojaBookingById.mockResolvedValueOnce(makePoojaBooking());
    state.listMessagesForBooking.mockResolvedValueOnce([
      makeMessage({ bookingType: 'pooja', bookingId: 'pooja-booking-1' }),
    ]);

    const rows = await listMessages(
      {
        role: 'provider',
        providerId: 'provider-1',
        providerKind: 'pandit',
        providerRefId: 'pandit-1',
      },
      'pooja',
      'pooja-booking-1',
    );

    expect(rows).toHaveLength(1);
    expect(state.markMessagesRead).toHaveBeenCalledWith('pooja', 'pooja-booking-1', 'provider');
  });
});
