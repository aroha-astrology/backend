import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  findBookingById: vi.fn(),
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

  it("rejects bookingType 'pooja' — not yet implemented (extension point for the Pooja Booking plan)", async () => {
    await expect(
      sendMessage({ role: 'customer', userId: 'user-1' }, 'pooja', 'booking-1', 'hi'),
    ).rejects.toThrow('pooja booking chat not yet available');
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
