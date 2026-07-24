import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeDecodedToken, makeUserRow } from './helpers/mocks.js';
import { AppError } from '../src/lib/errors.js';

const state = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  findUserByFirebaseUid: vi.fn(),
  listShagunProducts: vi.fn(),
  recordShagunClickAndGetRedirectUrl: vi.fn(),
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

vi.mock('../src/modules/shagun/shagun.service.js', () => ({
  listShagunProducts: state.listShagunProducts,
  recordShagunClickAndGetRedirectUrl: state.recordShagunClickAndGetRedirectUrl,
}));

const { createApp } = await import('../src/app.js');

const AUTH = { Authorization: 'Bearer token' } as const;
const PRODUCT_ID = '11111111-1111-1111-1111-111111111111';

beforeEach(() => {
  state.verifyIdToken.mockReset().mockResolvedValue(makeDecodedToken('uid-1'));
  state.findUserByFirebaseUid
    .mockReset()
    .mockResolvedValue(makeUserRow({ id: 'id-1', firebaseUid: 'uid-1' }));
  state.listShagunProducts.mockReset();
  state.recordShagunClickAndGetRedirectUrl.mockReset();
});

describe('GET /v1/shagun/products', () => {
  it('200s with the active product list', async () => {
    state.listShagunProducts.mockResolvedValueOnce([
      {
        id: 'p1',
        category: 'gemstone',
        name: 'Yellow Sapphire',
        description: null,
        imageUrl: null,
        priceRangeText: '₹5000–15000',
        sortOrder: 0,
      },
    ]);

    const res = await createApp().request('/v1/shagun/products', { headers: AUTH });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: Array<{ id: string; category: string }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]).toMatchObject({ id: 'p1', category: 'gemstone' });
    expect(state.listShagunProducts).toHaveBeenCalledWith(undefined);
  });

  it('passes the category query param through to the service', async () => {
    state.listShagunProducts.mockResolvedValueOnce([]);

    const res = await createApp().request('/v1/shagun/products?category=rudraksha', {
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    expect(state.listShagunProducts).toHaveBeenCalledWith('rudraksha');
  });

  it('422s on an invalid category', async () => {
    const res = await createApp().request('/v1/shagun/products?category=not-a-category', {
      headers: AUTH,
    });
    expect(res.status).toBe(422);
    expect(state.listShagunProducts).not.toHaveBeenCalled();
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request('/v1/shagun/products');
    expect(res.status).toBe(401);
  });
});

describe('GET /v1/shagun/products/:id/redirect', () => {
  it('302s to the affiliate URL and logs the click', async () => {
    state.recordShagunClickAndGetRedirectUrl.mockResolvedValueOnce(
      'https://affiliate.example.com/p1?ref=aroha',
    );

    const res = await createApp().request(`/v1/shagun/products/${PRODUCT_ID}/redirect`, {
      headers: AUTH,
    });

    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://affiliate.example.com/p1?ref=aroha');
    expect(state.recordShagunClickAndGetRedirectUrl).toHaveBeenCalledWith(PRODUCT_ID, 'id-1');
  });

  it('404s when the product does not exist or is inactive', async () => {
    state.recordShagunClickAndGetRedirectUrl.mockRejectedValueOnce(
      new AppError('NOT_FOUND', 'Product not found'),
    );

    const res = await createApp().request(`/v1/shagun/products/${PRODUCT_ID}/redirect`, {
      headers: AUTH,
    });

    expect(res.status).toBe(404);
  });

  it('422s on a malformed id', async () => {
    const res = await createApp().request('/v1/shagun/products/not-a-uuid/redirect', {
      headers: AUTH,
    });
    expect(res.status).toBe(422);
    expect(state.recordShagunClickAndGetRedirectUrl).not.toHaveBeenCalled();
  });

  it('401s without a bearer token', async () => {
    const res = await createApp().request(`/v1/shagun/products/${PRODUCT_ID}/redirect`);
    expect(res.status).toBe(401);
  });
});
