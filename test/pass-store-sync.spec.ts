import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Store Passes other than Google Play: the shared row sync, the Razorpay web Pass and the
// App Store Pass snapshot. Repos, Razorpay's API and the feature switches are mocked.

const s = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  inserted: [] as Array<Record<string, unknown>>,
  renewed: [] as Array<{ id: string; start: Date; end: Date }>,
  updated: [] as Array<{ id: string; values: Record<string, unknown> }>,
  coinGifts: [] as Array<unknown[]>,
  activePass: null as Record<string, unknown> | null,
  features: new Set<string>(),
  fetchSub: vi.fn(),
  createSub: vi.fn(),
  cancelSub: vi.fn(),
}));

vi.mock('../src/modules/pass/pass.repo.js', () => ({
  findPassByExternalId: async (id: string) => s.rows.get(id) ?? null,
  insertPass: async (v: Record<string, unknown>) => {
    const row = { id: `row-${s.inserted.length + 1}`, status: 'active', cancelledAt: null, ...v };
    s.inserted.push(row);
    s.rows.set(String(v.externalId), row);
    return row;
  },
  renewPass: async (id: string, p: { start: Date; end: Date }) => {
    s.renewed.push({ id, ...p });
  },
  updateStorePass: async (id: string, values: Record<string, unknown>) => {
    s.updated.push({ id, values });
  },
  findActivePass: async () => s.activePass,
  findLapsedStorePass: async () => null,
  listStorePassesToReconcile: async () => [],
}));
vi.mock('../src/modules/pass/pass-coins.js', () => ({
  grantPassMonthlyCoins: async (...args: unknown[]) => {
    s.coinGifts.push(args);
    return 0;
  },
}));
vi.mock('../src/modules/users/users.repo.js', () => ({ findActiveUserById: async () => null }));
vi.mock('../src/lib/notifications/telegram.js', () => ({
  notifyPassPurchase: async () => true,
  sendAlert: async () => true,
}));
vi.mock('../src/modules/features/features.service.js', () => ({
  isFeatureOn: async (_u: string, key: string) => s.features.has(key),
  resolveFeaturesForUser: async () =>
    Object.fromEntries(
      ['nav.arohaPass', 'paid.arohaPassA', 'paid.arohaPassB', 'paid.arohaPassC'].map((k) => [
        k,
        { enabled: true, pricePaise: null },
      ]),
    ),
}));
vi.mock('../src/modules/billing/billing.service.js', () => ({
  resolveChargeCurrency: async (_u: string, _c: unknown, requested?: string) => requested ?? 'INR',
}));
vi.mock('../src/modules/billing/razorpay.js', async () => {
  const actual = await vi.importActual<typeof import('../src/modules/billing/razorpay.js')>(
    '../src/modules/billing/razorpay.js',
  );
  return {
    ...actual,
    isRazorpayConfigured: () => true,
    getRazorpayKeyId: () => 'rzp_test_key',
    fetchRazorpaySubscription: s.fetchSub,
    createRazorpaySubscription: s.createSub,
    cancelRazorpaySubscription: s.cancelSub,
  };
});

const { env } = await import('../src/config/env.js');
const { syncStorePass } = await import('../src/modules/pass/pass-store-sync.js');
const { PASS_TIERS, tierForAppStoreProduct } = await import('../src/modules/pass/pass.config.js');
const rz = await import('../src/modules/pass/pass-razorpay.service.js');
const apple = await import('../src/modules/pass/pass-appstore.service.js');

const gold = PASS_TIERS[1];
const DAY = 86_400_000;
const now = new Date('2026-10-24T06:00:00Z');
const sec = (d: Date) => Math.floor(d.getTime() / 1000);

beforeEach(() => {
  s.rows.clear();
  s.inserted.length = 0;
  s.renewed.length = 0;
  s.updated.length = 0;
  s.coinGifts.length = 0;
  s.activePass = null;
  s.features = new Set();
  s.fetchSub.mockReset();
  s.createSub.mockReset();
  s.cancelSub.mockReset();
  (env as Record<string, unknown>).RAZORPAY_PASS_PLANS = JSON.stringify({
    silver: { INR: 'plan_s' },
    gold: { INR: 'plan_g', USD: { id: 'plan_gu', amount: 499 } },
    platinum: { INR: 'plan_p' },
  });
  (env as Record<string, unknown>).RAZORPAY_WEBHOOK_SECRET = 'whsec';
  rz.resetRazorpayPassPlans();
});

const snap = (over: Record<string, unknown> = {}) => ({
  source: 'razorpay' as const,
  externalId: 'sub_1',
  userId: 'u1',
  tier: gold,
  live: true,
  autoRenew: true,
  periodStart: now,
  periodEnd: new Date(now.getTime() + 30 * DAY),
  state: 'active',
  cancelled: false,
  ended: false,
  orderId: 'sub_1:1',
  ...over,
});

describe('syncStorePass', () => {
  it('first live sight inserts the row and gifts the first month\'s coins', async () => {
    const r = await syncStorePass(snap(), now);
    expect(r).toMatchObject({ recorded: true, inserted: true, userId: 'u1' });
    expect(s.inserted[0]).toMatchObject({ source: 'razorpay', externalId: 'sub_1', priceVariant: 'B', userId: 'u1' });
    expect(s.coinGifts).toHaveLength(1);
  });

  it('a paused/not-live subscription with no row records nothing', async () => {
    expect((await syncStorePass(snap({ live: false }), now)).recorded).toBe(false);
    expect((await syncStorePass(snap({ userId: null }), now)).recorded).toBe(false);
    expect(s.inserted).toHaveLength(0);
  });

  it('a later paid period renews with a fresh quota and a new coin gift', async () => {
    await syncStorePass(snap(), now);
    const next = new Date(now.getTime() + 30 * DAY);
    const r = await syncStorePass(snap({ periodStart: next, periodEnd: new Date(next.getTime() + 30 * DAY) }), next);
    expect(r).toMatchObject({ recorded: true, inserted: false, renewed: true });
    expect(s.renewed).toHaveLength(1);
    expect(s.coinGifts).toHaveLength(2);
  });

  it('the same period seen twice (a webhook and a reconcile) renews once', async () => {
    await syncStorePass(snap(), now);
    const again = await syncStorePass(snap(), new Date(now.getTime() + 3600_000));
    expect(again.renewed).toBe(false);
    expect(s.renewed).toHaveLength(0);
  });

  it('cancelled keeps the Pass to its end; ended stops it now', async () => {
    await syncStorePass(snap(), now);
    await syncStorePass(snap({ autoRenew: false, cancelled: true, state: 'cancelled' }), now);
    expect(s.updated.at(-1)!.values).toMatchObject({ status: 'active', autoRenew: false, cancelledAt: now });
    await syncStorePass(snap({ live: false, autoRenew: false, ended: true, state: 'halted' }), now);
    expect(s.updated.at(-1)!.values).toMatchObject({ status: 'expired', autoRenew: false });
  });

  it('a subscription never changes owner', async () => {
    await syncStorePass(snap(), now);
    await syncStorePass(snap({ userId: 'u2' }), now);
    expect(s.inserted).toHaveLength(1);
  });
});

describe('Razorpay web Pass', () => {
  const rzSub = (over: Record<string, unknown> = {}) => ({
    id: 'sub_1',
    status: 'active',
    plan_id: 'plan_g',
    current_start: sec(now),
    current_end: sec(new Date(now.getTime() + 30 * DAY)),
    paid_count: 1,
    notes: { user_id: 'u1', tier: 'gold' },
    ...over,
  });

  it('reads plans, falling back to the rupee plan when a currency has none', () => {
    expect(rz.webPlanFor('gold', 'USD')).toMatchObject({ id: 'plan_gu', amountMinor: 499 });
    expect(rz.webPlanFor('gold', 'EUR')).toMatchObject({ id: 'plan_g', currency: 'INR' });
    expect(rz.webPlanFor('platinum', 'USD')?.id).toBe('plan_p');
    (env as Record<string, unknown>).RAZORPAY_PASS_PLANS = 'not json';
    rz.resetRazorpayPassPlans();
    expect(rz.razorpayPassConfigured()).toBe(false);
  });

  it('maps Razorpay statuses', () => {
    expect(rz.razorpaySnapshot(rzSub() as never, now)).toMatchObject({ live: true, autoRenew: true, ended: false, tier: { tier: 'gold' } });
    // cancelled but paid to the end: still live, not renewing
    expect(rz.razorpaySnapshot(rzSub({ status: 'cancelled' }) as never, now)).toMatchObject({ live: true, autoRenew: false, cancelled: true, ended: false });
    // cancelled and past its end, or halted: over
    expect(rz.razorpaySnapshot(rzSub({ status: 'cancelled', current_end: sec(new Date(now.getTime() - DAY)) }) as never, now)).toMatchObject({ live: false, ended: true });
    expect(rz.razorpaySnapshot(rzSub({ status: 'halted' }) as never, now)).toMatchObject({ live: false, ended: true });
    // just paid in the checkout, no dates yet: one month from now
    const fresh = rz.razorpaySnapshot(rzSub({ status: 'authenticated', current_start: null, current_end: null }) as never, now, { paidJustNow: true });
    expect(fresh.live).toBe(true);
    expect(fresh.periodEnd!.getTime()).toBe(now.getTime() + 30 * DAY);
    // not paid yet and nothing to go on
    expect(rz.razorpaySnapshot(rzSub({ status: 'created', current_start: null, current_end: null }) as never, now).live).toBe(false);
  });

  it('subscribe: needs the switch, a tier on, no live Pass, then uses the user\'s currency plan', async () => {
    await expect(rz.startRazorpayPass({ id: 'u1' } as never, 'gold')).rejects.toThrow('FEATURE_DISABLED');
    s.features.add('money.razorpayPass');
    s.createSub.mockResolvedValue({ id: 'sub_new' });
    const out = await rz.startRazorpayPass({ id: 'u1' } as never, 'gold', { currency: 'USD' });
    expect(s.createSub).toHaveBeenCalledWith(expect.objectContaining({ planId: 'plan_gu', notes: { user_id: 'u1', tier: 'gold' } }));
    expect(out).toMatchObject({ subscriptionId: 'sub_new', keyId: 'rzp_test_key', currency: 'USD', amountMinor: 499 });
    s.activePass = { id: 'x' };
    await expect(rz.startRazorpayPass({ id: 'u1' } as never, 'gold')).rejects.toThrow('PASS_ALREADY_ACTIVE');
  });

  it('verify: bad signature refused; wrong account refused; good one is recorded', async () => {
    s.features.add('money.razorpayPass');
    (env as Record<string, unknown>).RAZORPAY_KEY_ID = 'rzp_test_key';
    (env as Record<string, unknown>).RAZORPAY_KEY_SECRET = 'secret';
    const sign = (pay: string, sub: string) => createHmac('sha256', 'secret').update(`${pay}|${sub}`).digest('hex');
    const body = (sig: string) => ({ razorpayPaymentId: 'pay_1', razorpaySubscriptionId: 'sub_1', razorpaySignature: sig });

    await expect(rz.confirmRazorpayPass('u1', body('bad'), now)).rejects.toThrow('could not be verified');
    s.fetchSub.mockResolvedValue(rzSub({ notes: { user_id: 'someone-else', tier: 'gold' } }));
    await expect(rz.confirmRazorpayPass('u1', body(sign('pay_1', 'sub_1')), now)).rejects.toThrow('PASS_SUBSCRIPTION_OTHER_ACCOUNT');
    s.fetchSub.mockResolvedValue(rzSub());
    const r = await rz.confirmRazorpayPass('u1', body(sign('pay_1', 'sub_1')), now);
    expect(r).toMatchObject({ recorded: true, inserted: true });
  });

  it('cancel stops renewal and keeps the Pass to the end', async () => {
    s.activePass = { id: 'row-1', source: 'razorpay', externalId: 'sub_1', autoRenew: true };
    s.cancelSub.mockResolvedValue({ status: 'cancelled' });
    await rz.cancelRazorpayPass('u1', now);
    expect(s.cancelSub).toHaveBeenCalledWith('sub_1', true);
    expect(s.updated.at(-1)!.values).toMatchObject({ autoRenew: false, cancelledAt: now });
    s.activePass = { id: 'row-2', source: 'google_play', externalId: 'tok', autoRenew: true };
    await expect(rz.cancelRazorpayPass('u1', now)).rejects.toThrow('NO_WEB_PASS');
  });

  it('webhook: bad signature refused; a good one re-reads the subscription and syncs', async () => {
    const raw = JSON.stringify({ event: 'subscription.charged', payload: { subscription: { entity: { id: 'sub_1' } } } });
    expect(await rz.handleRazorpayWebhook(raw, 'nope', now)).toBe('bad_signature');
    expect(await rz.handleRazorpayWebhook(raw, undefined, now)).toBe('bad_signature');
    s.fetchSub.mockResolvedValue(rzSub());
    const sig = createHmac('sha256', 'whsec').update(raw).digest('hex');
    expect(await rz.handleRazorpayWebhook(raw, sig, now)).toBe('ok');
    expect(s.fetchSub).toHaveBeenCalledWith('sub_1');
    expect(s.inserted).toHaveLength(1);
    // an unrelated event is acknowledged and ignored
    const other = JSON.stringify({ event: 'payment.captured', payload: {} });
    expect(await rz.handleRazorpayWebhook(other, createHmac('sha256', 'whsec').update(other).digest('hex'), now)).toBe('ok');
  });
});

describe('App Store Pass snapshot', () => {
  const tx = {
    transactionId: 't2',
    originalTransactionId: 'o1',
    bundleId: 'com.aroha.astrology',
    productId: 'aroha_pass_platinum',
    type: 'Auto-Renewable Subscription',
    purchaseDate: now.getTime(),
    expiresDate: now.getTime() + 30 * DAY,
    appAccountToken: 'ABCDEF00-1111-4111-8111-111111111111',
    environment: 'Production',
  };

  it('maps product ids to tiers', () => {
    expect(tierForAppStoreProduct('aroha_pass_gold')?.tier).toBe('gold');
    expect(tierForAppStoreProduct('coins_100')).toBeNull();
  });

  it('an active subscription is live, lower-cases the user token, and renews by default', () => {
    const sn = apple.appStoreSnapshot(tx, null, now);
    expect(sn).toMatchObject({ source: 'app_store', externalId: 'o1', userId: 'abcdef00-1111-4111-8111-111111111111', live: true, autoRenew: true, ended: false, tier: { tier: 'platinum' } });
  });

  it('renewal switched off: still live to the end, marked cancelled', () => {
    const sn = apple.appStoreSnapshot(tx, { originalTransactionId: 'o1', autoRenewStatus: 0 }, now);
    expect(sn).toMatchObject({ live: true, autoRenew: false, cancelled: true, ended: false });
  });

  it('expired, refunded, billing retry and grace', () => {
    const late = new Date(now.getTime() + 40 * DAY);
    expect(apple.appStoreSnapshot(tx, { originalTransactionId: 'o1', autoRenewStatus: 1 }, late)).toMatchObject({ live: false, ended: true });
    expect(apple.appStoreSnapshot({ ...tx, revocationDate: now.getTime() }, null, now)).toMatchObject({ live: false, ended: true, state: 'revoked' });
    // billing retry past the end: not live, but not ended (Apple may still collect)
    expect(apple.appStoreSnapshot(tx, { originalTransactionId: 'o1', autoRenewStatus: 1, isInBillingRetryPeriod: true }, late)).toMatchObject({ live: false, ended: false, state: 'billing_retry' });
    // grace period extends the working time
    expect(apple.appStoreSnapshot(tx, { originalTransactionId: 'o1', autoRenewStatus: 1, isInBillingRetryPeriod: true, gracePeriodExpiresDate: late.getTime() + DAY }, late)).toMatchObject({ live: true });
  });

  it('refuses everything while money.storekit is off', async () => {
    await expect(apple.confirmAppStorePass('u1', 'whatever')).rejects.toThrow('FEATURE_DISABLED');
  });
});
