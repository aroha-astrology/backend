import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';
import type { ProviderAccountRow } from '../src/db/schema.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  touchUserLastActive: vi.fn().mockResolvedValue(undefined),
  findProviderAccountByFirebaseUid: vi.fn(),
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
  touchUserLastActive: state.touchUserLastActive,
}));

vi.mock('../src/modules/providers/provider-accounts.repo.js', () => ({
  findProviderAccountByFirebaseUid: state.findProviderAccountByFirebaseUid,
}));

const { requireProvider, requireUserOrProvider } = await import('../src/middleware/auth.js');
const { errorHandler } = await import('../src/middleware/error.js');

function makeProviderApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.get('/provider-only', requireProvider, (c) => c.json({ provider: c.get('provider') }));
  return app;
}

function makeEitherApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.get('/either', requireUserOrProvider, (c) =>
    c.json({ user: c.get('user'), provider: c.get('provider') }),
  );
  return app;
}

function makeProviderAccountRow(overrides: Partial<ProviderAccountRow> = {}): ProviderAccountRow {
  return {
    id: 'provider-1',
    kind: 'astrologer',
    refId: 'astro-1',
    firebaseUid: 'provider-uid-1',
    displayName: 'Guru Ji',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

beforeEach(() => {
  state.verifyIdToken.mockReset();
  state.findUserByFirebaseUid.mockReset();
  state.touchUserLastActive.mockReset().mockResolvedValue(undefined);
  state.findProviderAccountByFirebaseUid.mockReset();
});

describe('requireProvider', () => {
  it('401s with no Authorization header', async () => {
    const res = await makeProviderApp().request('/provider-only');
    expect(res.status).toBe(401);
  });

  it('401s with an invalid Firebase token', async () => {
    state.verifyIdToken.mockRejectedValueOnce(new Error('bad token'));
    const res = await makeProviderApp().request('/provider-only', {
      headers: { Authorization: 'Bearer bad' },
    });
    expect(res.status).toBe(401);
  });

  it('401s when no provider_accounts row matches the token uid', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('provider-uid-1'));
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce(undefined);
    const res = await makeProviderApp().request('/provider-only', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(401);
  });

  it('200s and sets c.var.provider when a matching provider account exists', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('provider-uid-1'));
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce(makeProviderAccountRow());
    const res = await makeProviderApp().request('/provider-only', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      provider: { id: 'provider-1', kind: 'astrologer', refId: 'astro-1', displayName: 'Guru Ji' },
    });
  });
});

describe('requireUserOrProvider', () => {
  it('401s with no Authorization header', async () => {
    const res = await makeEitherApp().request('/either');
    expect(res.status).toBe(401);
  });

  it('401s with an invalid Firebase token', async () => {
    state.verifyIdToken.mockRejectedValueOnce(new Error('bad token'));
    const res = await makeEitherApp().request('/either', {
      headers: { Authorization: 'Bearer bad' },
    });
    expect(res.status).toBe(401);
  });

  it('sets c.var.user (not provider) when a matching, non-deleted user exists', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('user-uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-1', firebaseUid: 'user-uid-1' }),
    );
    const res = await makeEitherApp().request('/either', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user?: { id: string }; provider?: unknown };
    expect(body.user).toMatchObject({ id: 'id-1' });
    expect(body.provider).toBeUndefined();
    expect(state.findProviderAccountByFirebaseUid).not.toHaveBeenCalled();
  });

  it('falls back to c.var.provider when no user matches but a provider account does', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('provider-uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce(makeProviderAccountRow());
    const res = await makeEitherApp().request('/either', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user?: unknown; provider?: unknown };
    expect(body.provider).toEqual({
      id: 'provider-1',
      kind: 'astrologer',
      refId: 'astro-1',
      displayName: 'Guru Ji',
    });
    expect(body.user).toBeUndefined();
  });

  it('treats a soft-deleted user as no match and falls back to the provider lookup', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('shared-uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(
      makeUserRow({ id: 'id-1', firebaseUid: 'shared-uid-1', deletedAt: new Date() }),
    );
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce(makeProviderAccountRow());
    const res = await makeEitherApp().request('/either', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { provider?: unknown };
    expect(body.provider).toBeDefined();
  });

  it('401s when neither a user nor a provider account matches', async () => {
    state.verifyIdToken.mockResolvedValueOnce(makeDecodedToken('nobody-uid-1'));
    state.findUserByFirebaseUid.mockResolvedValueOnce(undefined);
    state.findProviderAccountByFirebaseUid.mockResolvedValueOnce(undefined);
    const res = await makeEitherApp().request('/either', {
      headers: { Authorization: 'Bearer good' },
    });
    expect(res.status).toBe(401);
  });
});
