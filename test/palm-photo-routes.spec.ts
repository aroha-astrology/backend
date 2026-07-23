import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeProfileContext, makeUserRow } from './helpers/mocks.js';
import { PalmPhotoUploadRequestSchema } from '../src/modules/palm/palm-photo.schemas.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  resolveActiveProfileContext: vi.fn(),
  upsertPendingPalmPhoto: vi.fn(),
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

vi.mock('../src/modules/palm/palm-photo.repo.js', () => ({
  upsertPendingPalmPhoto: state.upsertPendingPalmPhoto,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token', 'Content-Type': 'application/json' } as const;

function postPhoto(body: unknown) {
  return createApp().request('/v1/prime/palm/photo', {
    method: 'POST',
    headers: AUTH,
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
  state.resolveActiveProfileContext.mockReset().mockResolvedValue(makeProfileContext());
  state.upsertPendingPalmPhoto.mockReset();
});

describe('POST /v1/prime/palm/photo', () => {
  it('200s with {uploaded: true, expiresAt} on a valid upload', async () => {
    const expiresAt = new Date('2026-07-25T00:00:00Z');
    state.upsertPendingPalmPhoto.mockResolvedValueOnce({
      id: 'photo-1',
      userId: 'id-1',
      birthProfileId: null,
      imageBase64: 'ZmFrZQ==',
      mimeType: 'image/jpeg',
      expiresAt,
      createdAt: new Date('2026-07-23T00:00:00Z'),
    });

    const res = await postPhoto({ imageBase64: 'ZmFrZQ==', mimeType: 'image/jpeg' });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { uploaded: true; expiresAt: string };
    expect(body).toEqual({ uploaded: true, expiresAt: expiresAt.toISOString() });
    expect(state.upsertPendingPalmPhoto).toHaveBeenCalledWith(
      'id-1',
      null,
      'ZmFrZQ==',
      'image/jpeg',
    );
  });

  it('422s on an invalid mimeType', async () => {
    const res = await postPhoto({ imageBase64: 'ZmFrZQ==', mimeType: 'image/gif' });
    expect(res.status).toBe(422);
    expect(state.upsertPendingPalmPhoto).not.toHaveBeenCalled();
  });

  // Schema-level (not route-level, like public-moon-sign.spec.ts's malformed-date
  // tests): an imageBase64 over PALM_PHOTO_MAX_BASE64_LENGTH (~8MB of text) can
  // never actually reach this route's validation via a real HTTP request — the
  // app-wide `bodyLimit({maxSize: 1MB})` in app.ts (unrelated to this task) 413s
  // any such request first. This confirms the schema itself still rejects an
  // oversized value; it is the underlying 422 contract this endpoint documents.
  it('422s (at the schema level) on an oversized imageBase64', () => {
    const result = PalmPhotoUploadRequestSchema.safeParse({
      imageBase64: 'a'.repeat(8_000_001),
      mimeType: 'image/jpeg',
    });
    expect(result.success).toBe(false);
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/prime/palm/photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'ZmFrZQ==', mimeType: 'image/jpeg' }),
    });
    expect(res.status).toBe(401);
  });
});
