import { beforeEach, describe, expect, it, vi } from 'vitest';

// Google Play refunds: what is recorded, what is taken back, and when an account is
// blocked. The database is an in-memory stand-in for play-refunds.repo.ts; the
// take-back itself (one SQL transaction) is faked with the same guard on `paid`.

const db = vi.hoisted(() => ({
  refunds: [] as Record<string, any>[],
  orders: [] as Record<string, any>[],
  users: new Map<string, Record<string, any>>(),
  passes: new Map<string, Record<string, any>>(),
  bonus: new Map<string, number>(),
  clawbackOn: new Set<string>(),
  voided: [] as Record<string, any>[][],
  nextId: 1,
}));

const spies = vi.hoisted(() => ({
  notifyUser: vi.fn(),
  notifyPlayRefund: vi.fn(),
  resyncPass: vi.fn(),
  voidedList: vi.fn(),
  clawBackOrder: vi.fn(),
}));

vi.mock('../src/config/env.js', () => ({
  env: { LOG_LEVEL: 'silent' },
  isProduction: false,
  isTest: true,
}));

vi.mock('../src/config/google-play.js', () => ({
  GOOGLE_PLAY_PACKAGE_NAME: 'in.aroha.test',
  getAndroidPublisher: () => ({ purchases: { voidedpurchases: { list: spies.voidedList } } }),
}));

vi.mock('../src/lib/notifications/notify-user.js', () => ({ notifyUser: spies.notifyUser }));
vi.mock('../src/lib/notifications/telegram.js', () => ({
  notifyPlayRefund: spies.notifyPlayRefund,
}));
vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeaturesForUser: (userId: string) =>
    Promise.resolve({ 'paid.refundClawback': { enabled: db.clawbackOn.has(userId) } }),
}));
vi.mock('../src/modules/pass/pass-play.service.js', () => ({
  handlePlaySubscriptionNotification: spies.resyncPass,
}));
vi.mock('../src/modules/pass/pass.repo.js', () => ({
  findPassByExternalId: (token: string) => Promise.resolve(db.passes.get(token) ?? null),
}));
vi.mock('../src/modules/users/users.repo.js', () => ({
  findActiveUserById: (id: string) => Promise.resolve(db.users.get(id)),
}));

vi.mock('../src/modules/billing/play-refunds.repo.js', () => ({
  findPlayRefundByKey: (key: string) =>
    Promise.resolve(db.refunds.find((r) => r.refundKey === key)),
  insertPlayRefund: (values: Record<string, any>) => {
    if (db.refunds.some((r) => r.refundKey === values.refundKey)) return Promise.resolve(undefined);
    const row = {
      id: `refund-${db.nextId++}`,
      googleOrderId: null,
      userId: null,
      orderId: null,
      productId: null,
      amountPaise: 0,
      questionCredits: 0,
      clawedBackPaise: 0,
      clawedBackQuestions: 0,
      reportsLocked: 0,
      ...values,
    };
    db.refunds.push(row);
    return Promise.resolve(row);
  },
  updatePlayRefund: (id: string, patch: Record<string, any>) => {
    Object.assign(db.refunds.find((r) => r.id === id)!, patch);
    return Promise.resolve();
  },
  listRecordedPlayRefunds: () =>
    Promise.resolve(db.refunds.filter((r) => r.status === 'recorded' && r.userId)),
  countPlayRefundsForUser: (userId: string) =>
    Promise.resolve(
      db.refunds.filter((r) => r.userId === userId && r.status !== 'unmatched').length,
    ),
  findOrderByPurchaseToken: (token: string) =>
    Promise.resolve(db.orders.find((o) => o.gatewayPaymentId === token)),
  bonusGrantedFor: (order: Record<string, any>) =>
    Promise.resolve(db.bonus.get(String(order.id)) ?? 0),
  clawBackOrder: spies.clawBackOrder,
  setPurchasesBlocked: (userId: string, blocked: boolean) => {
    db.users.get(userId)!.purchasesBlockedAt = blocked ? new Date() : null;
    return Promise.resolve();
  },
}));

const svc = await import('../src/modules/billing/play-refunds.service.js');
const { assertPurchasesAllowed } = await import('../src/modules/billing/purchase-block.js');
const { parseReason } = await import('../src/modules/billing/billing.service.js');

const USER = 'user-rutuja';

function addUser(id: string, wallet: number, questions = 0) {
  db.users.set(id, {
    id,
    displayName: 'Rutuja',
    email: null,
    phoneE164: '+919999000000',
    locale: 'en',
    walletBalancePaise: wallet,
    questionCredits: questions,
    purchasesBlockedAt: null,
  });
}

function addOrder(id: string, token: string, packId: string, amountPaise: number, userId = USER) {
  db.orders.push({
    id,
    userId,
    packId,
    amountPaise,
    status: 'paid',
    gatewayPaymentId: token,
    paidAt: new Date('2026-10-17T02:18:30Z'),
  });
}

function voided(token: string, orderId: string) {
  return {
    purchaseToken: token,
    googleOrderId: orderId,
    voidedAt: new Date('2026-10-18T10:00:00Z'),
    purchasedAt: new Date('2026-10-17T02:18:00Z'),
    voidedSource: 0,
    voidedReason: 1,
    detectedVia: 'voided_api' as const,
  };
}

beforeEach(() => {
  db.refunds = [];
  db.orders = [];
  db.users = new Map();
  db.passes = new Map();
  db.bonus = new Map();
  db.clawbackOn = new Set();
  db.nextId = 1;
  for (const spy of Object.values(spies)) spy.mockReset();
  spies.notifyPlayRefund.mockResolvedValue(true);
  spies.resyncPass.mockResolvedValue(undefined);
  // The take-back: guarded on the order still being paid, like the SQL transaction.
  spies.clawBackOrder.mockImplementation(
    (order: Record<string, any>, take: { walletPaise: number; questions: number }) => {
      const stored = db.orders.find((o) => o.id === order.id)!;
      if (stored.status !== 'paid') return Promise.resolve(undefined);
      stored.status = 'refunded';
      const user = db.users.get(String(order.userId))!;
      user.walletBalancePaise -= take.walletPaise;
      user.questionCredits -= take.questions;
      return Promise.resolve({
        walletBalancePaise: user.walletBalancePaise,
        questionCredits: user.questionCredits,
        reportsLocked: user.walletBalancePaise < 0 ? 1 : 0,
      });
    },
  );
  addUser(USER, 590);
  addOrder('order-100', 'tok-100', '100_recharge', 10000);
});

describe('a refunded ₹100 recharge', () => {
  it('with the switch off: records it, takes nothing, and tells the admin what it would take', async () => {
    expect(await svc.recordVoidedPurchase(voided('tok-100', 'GPA.1'))).toBe('recorded');

    expect(spies.clawBackOrder).not.toHaveBeenCalled();
    expect(spies.notifyUser).not.toHaveBeenCalled();
    expect(db.refunds[0]).toMatchObject({
      status: 'recorded',
      kind: 'top_up',
      userId: USER,
      orderId: 'order-100',
      amountPaise: 10000,
    });
    expect(spies.notifyPlayRefund.mock.calls[0]![0]).toMatchObject({
      userId: USER,
      name: 'Rutuja',
      product: '₹100 recharge',
      reason: 'changed their mind (refunded by the buyer)',
    });
    expect(spies.notifyPlayRefund.mock.calls[0]![0].outcome).toMatch(
      /recorded only.*would take back ₹100/,
    );
  });

  it('with the switch on: takes ₹100 back even below zero and tells the user what they owe', async () => {
    db.clawbackOn.add(USER);
    expect(await svc.recordVoidedPurchase(voided('tok-100', 'GPA.1'))).toBe('clawed_back');

    expect(db.users.get(USER)!.walletBalancePaise).toBe(-9410);
    expect(db.refunds[0]).toMatchObject({
      status: 'clawed_back',
      clawedBackPaise: 10000,
      reportsLocked: 1,
    });
    const notice = spies.notifyUser.mock.calls[0]![1];
    expect(notice).toMatchObject({ type: 'play_refund', link: '/profile/orders' });
    expect(notice.body).toContain('−₹94.10');
    expect(spies.notifyPlayRefund.mock.calls[0]![0].outcome).toBe(
      '₹100 taken back, wallet now −₹94.10; 1 report locked until paid',
    );
  });

  it('takes back the recharge bonus with the price', async () => {
    db.clawbackOn.add(USER);
    addOrder('order-250', 'tok-250', 'recharge_250', 25000);
    db.bonus.set('order-250', 10000);
    db.users.get(USER)!.walletBalancePaise = 40000;
    await svc.recordVoidedPurchase(voided('tok-250', 'GPA.2'));

    expect(spies.clawBackOrder.mock.calls[0]![1]).toEqual({ walletPaise: 35000, questions: 0 });
    expect(db.users.get(USER)!.walletBalancePaise).toBe(5000);
    expect(spies.notifyUser.mock.calls[0]![1].body).not.toContain('Reports');
  });

  it('handles the same refund only once when the push notice and the hourly list both see it', async () => {
    db.clawbackOn.add(USER);
    await svc.recordVoidedPurchase(voided('tok-100', 'GPA.1'));
    expect(
      await svc.recordVoidedPurchase({ ...voided('tok-100', 'GPA.1'), detectedVia: 'rtdn' }),
    ).toBe('seen');

    expect(spies.clawBackOrder).toHaveBeenCalledTimes(1);
    expect(db.users.get(USER)!.walletBalancePaise).toBe(-9410);
  });

  it('takes back a refund recorded while the switch was off once it is switched on', async () => {
    spies.voidedList.mockResolvedValue({ data: { voidedPurchases: [] } });
    await svc.recordVoidedPurchase(voided('tok-100', 'GPA.1'));
    expect(db.users.get(USER)!.walletBalancePaise).toBe(590);

    db.clawbackOn.add(USER);
    const result = await svc.runPlayRefundCheck();
    expect(result.clawedBack).toBe(1);
    expect(db.users.get(USER)!.walletBalancePaise).toBe(-9410);
  });

  it('skips an order that is no longer paid', async () => {
    db.clawbackOn.add(USER);
    db.orders[0]!.status = 'refunded';
    expect(await svc.recordVoidedPurchase(voided('tok-100', 'GPA.1'))).toBe('skipped');
    expect(db.users.get(USER)!.walletBalancePaise).toBe(590);
    expect(spies.notifyUser).not.toHaveBeenCalled();
  });
});

describe('a refunded Question Pack', () => {
  it('takes its questions back, not wallet money', async () => {
    db.clawbackOn.add(USER);
    db.users.get(USER)!.questionCredits = 3;
    addOrder('order-pack', 'tok-pack', 'question_pack_12', 9900);
    expect(await svc.recordVoidedPurchase(voided('tok-pack', 'GPA.3'))).toBe('clawed_back');

    expect(spies.clawBackOrder.mock.calls[0]![1]).toEqual({ walletPaise: 0, questions: 12 });
    expect(db.users.get(USER)!).toMatchObject({ walletBalancePaise: 590, questionCredits: -9 });
    expect(spies.notifyUser.mock.calls[0]![1].body).toContain('12 questions were taken back');
  });
});

describe('repeat refunds', () => {
  it('blocks new purchases on the second refund', async () => {
    db.clawbackOn.add(USER);
    db.users.get(USER)!.walletBalancePaise = 50000;
    addOrder('order-50', 'tok-50', 'recharrge_50', 5000);
    await svc.recordVoidedPurchase(voided('tok-100', 'GPA.1'));
    expect(db.users.get(USER)!.purchasesBlockedAt).toBeNull();

    await svc.recordVoidedPurchase(voided('tok-50', 'GPA.4'));
    expect(db.users.get(USER)!.purchasesBlockedAt).toBeInstanceOf(Date);
    expect(spies.notifyPlayRefund.mock.calls[1]![0].outcome).toContain('purchases now blocked');
    expect(() => assertPurchasesAllowed(db.users.get(USER) as never)).toThrow('PURCHASES_BLOCKED');
  });

  it('never blocks while the switch is off', async () => {
    addOrder('order-50', 'tok-50', 'recharrge_50', 5000);
    await svc.recordVoidedPurchase(voided('tok-100', 'GPA.1'));
    await svc.recordVoidedPurchase(voided('tok-50', 'GPA.4'));
    expect(db.users.get(USER)!.purchasesBlockedAt).toBeNull();
  });
});

describe('other refunds', () => {
  it('a refunded Aroha Pass is re-checked with Google, which ends it', async () => {
    db.passes.set('tok-pass', { userId: USER, pricePaise: 19900 });
    expect(await svc.recordVoidedPurchase(voided('tok-pass', 'GPA.5..0'))).toBe('pass');

    expect(spies.resyncPass).toHaveBeenCalledWith(
      expect.objectContaining({ purchaseToken: 'tok-pass', subscriptionId: 'aroha_pass_monthly' }),
    );
    expect(db.refunds[0]).toMatchObject({ kind: 'pass', status: 'pass', userId: USER });
  });

  it('a purchase we have no record of is kept as unmatched', async () => {
    expect(await svc.recordVoidedPurchase(voided('tok-unknown', 'GPA.6'))).toBe('unmatched');
    expect(spies.notifyPlayRefund.mock.calls[0]![0]).toMatchObject({ userId: null });
  });
});

describe('runPlayRefundCheck', () => {
  it("reads every page of Google's voided purchases, subscriptions included", async () => {
    addOrder('order-50', 'tok-50', 'recharrge_50', 5000);
    spies.voidedList
      .mockResolvedValueOnce({
        data: {
          voidedPurchases: [
            {
              purchaseToken: 'tok-100',
              orderId: 'GPA.1',
              voidedTimeMillis: '1792807200000',
              voidedReason: 7,
            },
          ],
          tokenPagination: { nextPageToken: 'page-2' },
        },
      })
      .mockResolvedValueOnce({
        data: { voidedPurchases: [{ purchaseToken: 'tok-50', orderId: 'GPA.4' }] },
      });

    const result = await svc.runPlayRefundCheck(new Date('2026-10-24T00:00:00Z'));
    expect(result).toMatchObject({ checked: 2, recorded: 2 });
    expect(spies.voidedList).toHaveBeenCalledTimes(2);
    expect(spies.voidedList.mock.calls[0]![0]).toMatchObject({
      type: 1,
      packageName: 'in.aroha.test',
    });
    expect(spies.voidedList.mock.calls[1]![0]).toMatchObject({ token: 'page-2' });
    expect(db.refunds[0]!.voidedAt).toEqual(new Date(1792807200000));
    expect(spies.notifyPlayRefund.mock.calls[0]![0].reason).toBe('bank chargeback');
  });
});

describe('payment history', () => {
  it('shows a take-back as its own debit, not as a refund to the user', () => {
    expect(parseReason('play_refund:100_recharge')).toEqual({
      kind: 'play_refund',
      isRefund: false,
    });
  });
});
