import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTestChain, opensslAvailable } from './helpers/apple-test-chain.js';

// Coin packs bought on an iPhone (money.storekit): one credit per App Store transaction.

const s = vi.hoisted(() => ({
  on: true,
  roots: [] as string[],
  orders: new Map<string, Record<string, unknown>>(),
  credited: [] as string[],
  balance: 0,
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  isFeatureOn: async (_u: string, key: string) => s.on && key === 'money.storekit',
}));
vi.mock('../src/modules/billing/billing.repo.js', () => ({
  insertOrder: async (v: Record<string, unknown>) => {
    if (s.orders.has(String(v.gatewayOrderId))) {
      throw Object.assign(new Error('duplicate'), { code: '23505' });
    }
    const row = { id: `o-${s.orders.size + 1}`, status: 'pending', ...v };
    s.orders.set(String(v.gatewayOrderId), row);
    return row;
  },
  findAppStoreOrder: async (tx: string) => s.orders.get(tx),
  confirmOrderAndGrantCredits: async (id: string, _u: string, payment: string) => {
    const row = [...s.orders.values()].find((o) => o.id === id)!;
    if (row.status !== 'pending') return undefined;
    row.status = 'paid';
    s.credited.push(payment);
    s.balance += 30_000;
    return { order: row, walletBalancePaise: s.balance };
  },
  findOrderByIdForUser: vi.fn(),
  findOrdersForUser: vi.fn(),
  findDebitsForUser: vi.fn(),
  findLatestOrderForPack: vi.fn(),
  setOrderGatewayOrderId: vi.fn(),
  findStalePendingRazorpayOrders: vi.fn(),
  refundOrder: vi.fn(),
}));
vi.mock('../src/modules/users/users.repo.js', () => ({
  findActiveUserById: async () => ({ walletBalancePaise: s.balance }),
}));
vi.mock('../src/lib/notifications/telegram.js', () => ({
  notifyWalletTopUp: async () => true,
  notifyQuestionPackBought: async () => true,
  notifyPassPurchase: async () => true,
  sendAlert: async () => true,
}));
vi.mock('../src/lib/db-errors.js', () => ({
  isUniqueViolation: (e: unknown) => (e as { code?: string })?.code === '23505',
}));
// The App Store check uses the generated test root instead of Apple's.
vi.mock('../src/modules/billing/app-store-verify.js', async () => {
  const actual = await vi.importActual<typeof import('../src/modules/billing/app-store-verify.js')>(
    '../src/modules/billing/app-store-verify.js',
  );
  return {
    ...actual,
    verifyAppleTransaction: (jws: string, o: object = {}) =>
      actual.verifyAppleTransaction(jws, { ...o, roots: s.roots }),
  };
});

const have = opensslAvailable();
const chain = have ? makeTestChain() : null;
afterAll(() => chain?.cleanup());
const { confirmAppStoreCoins } = await import('../src/modules/billing/billing.service.js');

const USER = '11111111-1111-4111-8111-111111111111';
const tx = (over: Record<string, unknown> = {}) => ({
  transactionId: 'T1',
  originalTransactionId: 'T1',
  bundleId: 'com.aroha.astrology',
  productId: 'coins_330',
  type: 'Consumable',
  purchaseDate: Date.now(),
  appAccountToken: USER,
  environment: 'Production',
  currency: 'USD',
  price: 4_990,
  ...over,
});

beforeEach(() => {
  s.on = true;
  s.roots = chain ? [chain.rootPem] : [];
  s.orders.clear();
  s.credited.length = 0;
  s.balance = 0;
});

describe.skipIf(!have)('confirmAppStoreCoins', () => {
  it('credits a coin pack once and records the order with the App Store transaction id', async () => {
    const r = await confirmAppStoreCoins(USER, chain!.sign(tx()));
    expect(r.walletBalancePaise).toBe(30_000);
    expect(s.orders.get('T1')).toMatchObject({ gatewayProvider: 'app_store', packId: 'coins_330', userId: USER, currency: 'USD', status: 'paid' });
  });

  it('a replay of the same transaction does not credit again', async () => {
    await confirmAppStoreCoins(USER, chain!.sign(tx()));
    const again = await confirmAppStoreCoins(USER, chain!.sign(tx()));
    expect(again.walletBalancePaise).toBe(30_000);
    expect(s.credited).toEqual(['T1']);
  });

  it('refuses while the switch is off', async () => {
    s.on = false;
    await expect(confirmAppStoreCoins(USER, chain!.sign(tx()))).rejects.toThrow('FEATURE_DISABLED');
  });

  it('refuses another account\'s transaction, a missing token, a refunded one and a non-coin product', async () => {
    await expect(confirmAppStoreCoins('22222222-2222-4222-8222-222222222222', chain!.sign(tx()))).rejects.toThrow('APP_STORE_OTHER_ACCOUNT');
    await expect(confirmAppStoreCoins(USER, chain!.sign(tx({ appAccountToken: undefined })))).rejects.toThrow('APP_STORE_OTHER_ACCOUNT');
    await expect(confirmAppStoreCoins(USER, chain!.sign(tx({ revocationDate: Date.now() })))).rejects.toThrow('APP_STORE_REFUNDED');
    await expect(confirmAppStoreCoins(USER, chain!.sign(tx({ productId: 'aroha_pass_gold' })))).rejects.toThrow('NOT_A_COIN_PACK');
    await expect(confirmAppStoreCoins(USER, chain!.sign(tx({ type: 'Auto-Renewable Subscription' })))).rejects.toThrow('NOT_A_COIN_PACK');
    expect(s.credited).toHaveLength(0);
  });

  it('a transaction recorded for one account cannot be claimed by another', async () => {
    await confirmAppStoreCoins(USER, chain!.sign(tx()));
    const thief = '33333333-3333-4333-8333-333333333333';
    await expect(confirmAppStoreCoins(thief, chain!.sign(tx({ appAccountToken: thief })))).rejects.toThrow('APP_STORE_OTHER_ACCOUNT');
  });

  it('a signature from outside the trusted chain is refused', async () => {
    const stranger = makeTestChain();
    try {
      await expect(confirmAppStoreCoins(USER, stranger.sign(tx()))).rejects.toThrow('APP_STORE_SIGNATURE_INVALID');
    } finally {
      stranger.cleanup();
    }
  });
});
