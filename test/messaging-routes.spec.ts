import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  findProviderAccountByFirebaseUid: vi.fn(),
  sendMessage: vi.fn(),
  listMessages: vi.fn(),
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

vi.mock('../src/modules/providers/provider-accounts.repo.js', () => ({
  findProviderAccountByFirebaseUid: state.findProviderAccountByFirebaseUid,
}));

vi.mock('../src/modules/messaging/messaging.service.js', () => ({
  sendMessage: state.sendMessage,
  listMessages: state.listMessages,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token', 'Content-Type': 'application/json' } as const;

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
  state.findProviderAccountByFirebaseUid.mockReset();
  state.sendMessage.mockReset();
  state.listMessages.mockReset();
});

describe('POST /v1/bookings/:bookingType/:bookingId/messages', () => {
  it('201s with the created message when the caller is the customer', async () => {
    state.sendMessage.mockResolvedValueOnce({ id: 'msg-1', body: 'hi' });

    const res = await createApp().request('/v1/bookings/astrologer/booking-1/messages', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ body: 'hi' }),
    });

    expect(res.status).toBe(201);
    expect(state.sendMessage).toHaveBeenCalledWith(
      { role: 'customer', userId: 'id-1' },
      'astrologer',
      'booking-1',
      'hi',
    );
  });

  it("201s with the created message when the caller is the assigned provider (no matching 'user' row)", async () => {
    state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      firebaseUid: 'uid-1',
      displayName: 'Guru Ji',
      createdAt: new Date(),
    });
    state.sendMessage.mockResolvedValueOnce({ id: 'msg-2', body: 'hi back' });

    const res = await createApp().request('/v1/bookings/astrologer/booking-1/messages', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({ body: 'hi back' }),
    });

    expect(res.status).toBe(201);
    expect(state.sendMessage).toHaveBeenCalledWith(
      {
        role: 'provider',
        providerId: 'provider-1',
        providerKind: 'astrologer',
        providerRefId: 'astro-1',
      },
      'astrologer',
      'booking-1',
      'hi back',
    );
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/bookings/astrologer/booking-1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'hi' }),
    });
    expect(res.status).toBe(401);
  });

  it('422s when body is missing', async () => {
    const res = await createApp().request('/v1/bookings/astrologer/booking-1/messages', {
      method: 'POST',
      headers: AUTH,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(422);
    expect(state.sendMessage).not.toHaveBeenCalled();
  });
});

describe('GET /v1/bookings/:bookingType/:bookingId/messages', () => {
  it('200s with the transcript', async () => {
    state.listMessages.mockResolvedValueOnce([{ id: 'msg-1', body: 'hi' }]);

    const res = await createApp().request('/v1/bookings/astrologer/booking-1/messages', {
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    expect(state.listMessages).toHaveBeenCalledWith(
      { role: 'customer', userId: 'id-1' },
      'astrologer',
      'booking-1',
    );
    expect(await res.json()).toEqual([{ id: 'msg-1', body: 'hi' }]);
  });
});
