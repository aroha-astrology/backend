import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow } from './helpers/mocks.js';

// Typed with an explicit return so tsc accepts the objects assigned later
// (a bare `null`/`{}` here would infer those literal types).
const held = vi.hoisted((): { active: unknown; features: Record<string, unknown> } => ({
  active: null,
  features: {},
}));
const state = vi.hoisted(() => ({
  consumePassQuestion: vi.fn(),
  consumeQuestionCredit: vi.fn(),
  refundPassQuestion: vi.fn(),
  addQuestionCredits: vi.fn(),
  insertPass: vi.fn(),
  renewPass: vi.fn(),
  expirePass: vi.fn(),
  markPassReminded: vi.fn(),
  listWalletRenewalsDue: vi.fn(),
  listWalletRemindersDue: vi.fn(),
  expireLapsedPasses: vi.fn(),
  findPassByExternalId: vi.fn(),
  updatePlayPass: vi.fn(),
  deductWalletBalance: vi.fn(),
  addWalletBalance: vi.fn(),
  notifyUser: vi.fn(),
  subscriptionsv2Get: vi.fn(),
  acknowledge: vi.fn(),
}));

vi.mock('../src/modules/pass/pass.repo.js', () => ({
  findActivePass: () => Promise.resolve(held.active),
  consumePassQuestion: state.consumePassQuestion,
  consumeQuestionCredit: state.consumeQuestionCredit,
  refundPassQuestion: state.refundPassQuestion,
  addQuestionCredits: state.addQuestionCredits,
  insertPass: state.insertPass,
  renewPass: state.renewPass,
  expirePass: state.expirePass,
  markPassReminded: state.markPassReminded,
  listWalletRenewalsDue: state.listWalletRenewalsDue,
  listWalletRemindersDue: state.listWalletRemindersDue,
  expireLapsedPasses: state.expireLapsedPasses,
  findPassByExternalId: state.findPassByExternalId,
  updatePlayPass: state.updatePlayPass,
}));
vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeaturesForUser: () => Promise.resolve(held.features),
}));
vi.mock('../src/modules/users/users.repo.js', () => ({
  deductWalletBalance: state.deductWalletBalance,
  addWalletBalance: state.addWalletBalance,
}));
vi.mock('../src/lib/notifications/notify-user.js', () => ({ notifyUser: state.notifyUser }));
vi.mock('../src/config/google-play.js', () => ({
  GOOGLE_PLAY_PACKAGE_NAME: 'com.aroha.astrology',
  getAndroidPublisher: () => ({
    purchases: {
      subscriptionsv2: { get: state.subscriptionsv2Get },
      subscriptions: { acknowledge: state.acknowledge },
    },
  }),
}));

import { chargeQuestion, refundQuestion } from '../src/modules/pass/question-billing.js';
import {
  assignVariant,
  buyQuestionPack,
  getPassStatus,
  runPassRenewals,
} from '../src/modules/pass/pass.service.js';
import { confirmPlayPass, syncPlayPass } from '../src/modules/pass/pass-play.service.js';

const ON = {
  enabled: true,
  pricePaise: null,
  originalPricePaise: null,
  model: null,
  enabledAt: null,
};
const on = (pricePaise?: number) => ({ ...ON, pricePaise: pricePaise ?? null });
const NOW = new Date('2026-09-25T06:30:00Z');
const DAY = 86_400_000;

function passRow(extra: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    source: 'wallet',
    priceVariant: 'B',
    pricePaise: 29900,
    autoRenew: true,
    periodStart: new Date(NOW.getTime() - 20 * DAY),
    periodEnd: new Date(NOW.getTime() + 10 * DAY),
    questionsUsed: 4,
    status: 'active',
    cancelledAt: null,
    ...extra,
  };
}

beforeEach(() => {
  held.features = {};
  held.active = null;
  for (const fn of [
    state.consumePassQuestion,
    state.consumeQuestionCredit,
    state.refundPassQuestion,
    state.addQuestionCredits,
    state.insertPass,
    state.renewPass,
    state.expirePass,
    state.markPassReminded,
    state.listWalletRenewalsDue,
    state.listWalletRemindersDue,
    state.expireLapsedPasses,
    state.findPassByExternalId,
    state.updatePlayPass,
    state.deductWalletBalance,
    state.addWalletBalance,
    state.notifyUser,
    state.subscriptionsv2Get,
    state.acknowledge,
  ])
    fn.mockReset();
  state.consumePassQuestion.mockResolvedValue(false);
  state.consumeQuestionCredit.mockResolvedValue(false);
  state.deductWalletBalance.mockResolvedValue(true);
  state.addWalletBalance.mockResolvedValue(undefined);
  state.addQuestionCredits.mockResolvedValue(5);
  state.insertPass.mockResolvedValue(passRow());
  state.listWalletRenewalsDue.mockResolvedValue([]);
  state.listWalletRemindersDue.mockResolvedValue([]);
  state.expireLapsedPasses.mockResolvedValue(0);
  state.findPassByExternalId.mockResolvedValue(null);
});

describe('assignVariant', () => {
  it('is stable per user and only picks from the variants that are on', () => {
    const a = assignVariant('user-123', ['A', 'B', 'C']);
    expect(assignVariant('user-123', ['C', 'B', 'A'])).toBe(a);
    expect(assignVariant('user-123', ['B'])).toBe('B');
    expect(assignVariant('user-123', [])).toBeNull();
    const spread = new Set(
      Array.from({ length: 60 }, (_, i) => assignVariant(`u-${i}`, ['A', 'B', 'C'])),
    );
    expect(spread.size).toBe(3);
  });
});

describe('chargeQuestion / refundQuestion', () => {
  it('spends the Pass quota first, then a pack credit, then the wallet', async () => {
    state.consumePassQuestion.mockResolvedValueOnce(true);
    expect(await chargeQuestion('user-1', 2000)).toBe('pass');
    state.consumeQuestionCredit.mockResolvedValueOnce(true);
    expect(await chargeQuestion('user-1', 2000)).toBe('credits');
    expect(await chargeQuestion('user-1', 2000)).toBe('wallet');
    expect(state.deductWalletBalance).toHaveBeenCalledWith('user-1', 2000, 'chat_message');
    state.deductWalletBalance.mockResolvedValueOnce(false);
    expect(await chargeQuestion('user-1', 2000)).toBeNull();
    expect(await chargeQuestion('user-1', 0)).toBe('free');
  });

  it('refunds to the same place', async () => {
    await refundQuestion('user-1', 'pass', 2000);
    await refundQuestion('user-1', 'credits', 2000);
    await refundQuestion('user-1', 'wallet', 2000);
    expect(state.refundPassQuestion).toHaveBeenCalledWith('user-1');
    expect(state.addQuestionCredits).toHaveBeenCalledWith('user-1', 1);
    expect(state.addWalletBalance).toHaveBeenCalledWith('user-1', 2000, 'refund:chat_message');
  });
});

describe('getPassStatus', () => {
  it('offers nothing while nav.arohaPass is off, but still lists packs that are on', async () => {
    held.features = { 'paid.questionPackSmall': on(4900), 'paid.arohaPassA': on(19900) };
    const s = await getPassStatus(makeUserRow({ id: 'user-1', questionCredits: 3 }));
    expect(s.enabled).toBe(false);
    expect(s.offer).toBeNull();
    expect(s.questionCredits).toBe(3);
    expect(s.packs).toEqual([{ pack: 'small', questions: 5, pricePaise: 4900 }]);
  });

  it("shows the user's variant price, its Play base plan, and questions left", async () => {
    held.features = { 'nav.arohaPass': ON, 'paid.arohaPassB': on(24900) };
    held.active = passRow();
    const s = await getPassStatus(makeUserRow({ id: 'user-1' }));
    expect(s.offer).toEqual({
      variant: 'B',
      pricePaise: 24900,
      play: { productId: 'aroha_pass_monthly', basePlanId: 'pass-299' },
    });
    expect(s.pass).toMatchObject({ source: 'wallet', autoRenew: true, questionsLeft: 26 });
    expect(s.benefits).toEqual({ questionsPerPeriod: 30, periodDays: 30, reportDiscountPct: 20 });
  });
});

describe('buyQuestionPack', () => {
  it('refuses a pack that is off; charges and credits one that is on', async () => {
    const user = makeUserRow({ id: 'user-1' });
    await expect(buyQuestionPack(user, 'small')).rejects.toThrow('QUESTION_PACK_NOT_AVAILABLE');
    held.features = { 'paid.questionPackSmall': on(4900) };
    const s = await buyQuestionPack(user, 'small');
    expect(state.deductWalletBalance).toHaveBeenCalledWith('user-1', 4900, 'question_pack:small');
    expect(state.addQuestionCredits).toHaveBeenCalledWith('user-1', 5);
    expect(s.questionCredits).toBe(5);
  });
});

describe('runPassRenewals', () => {
  it('never charges the wallet: ends due wallet Passes, reminds, and expires the rest', async () => {
    state.listWalletRenewalsDue.mockResolvedValue([
      passRow({ id: 'due', userId: 'u-due', periodEnd: new Date(NOW.getTime() - 3600_000) }),
    ]);
    state.listWalletRemindersDue.mockResolvedValue([
      passRow({ id: 'soon', userId: 'u-soon', autoRenew: true }),
    ]);
    state.expireLapsedPasses.mockResolvedValue(2);

    const run = await runPassRenewals(NOW);
    expect(run).toEqual({ lapsed: 1, reminded: 1, expired: 2 });
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(state.renewPass).not.toHaveBeenCalled();
    expect(state.expirePass).toHaveBeenCalledWith('due');
    expect(state.notifyUser).toHaveBeenCalledWith(
      'u-due',
      expect.objectContaining({ title: 'Your Aroha Pass has ended', link: '/pass' }),
    );
    expect(state.notifyUser).toHaveBeenCalledWith(
      'u-soon',
      expect.objectContaining({
        title: 'Your Aroha Pass ends soon',
        body: expect.stringContaining('Google Play'),
      }),
    );
    expect(state.markPassReminded).toHaveBeenCalledWith('soon');
  });

  it('a dry run changes nothing', async () => {
    state.listWalletRenewalsDue.mockResolvedValue([passRow()]);
    await runPassRenewals(NOW, { dryRun: true });
    expect(state.expirePass).not.toHaveBeenCalled();
    expect(state.expireLapsedPasses).not.toHaveBeenCalled();
  });
});

describe('Aroha Pass on Google Play', () => {
  const live = (expiry: Date, extra: Record<string, unknown> = {}) => ({
    data: {
      subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
      acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
      externalAccountIdentifiers: { obfuscatedExternalAccountId: 'user-1' },
      lineItems: [
        {
          productId: 'aroha_pass_monthly',
          expiryTime: expiry.toISOString(),
          autoRenewingPlan: { autoRenewEnabled: true },
          offerDetails: { basePlanId: 'pass-199' },
        },
      ],
      ...extra,
    },
  });

  it('records a live subscription for its buyer and acknowledges it', async () => {
    state.subscriptionsv2Get.mockResolvedValue(live(new Date(NOW.getTime() + 30 * DAY)));
    await confirmPlayPass('user-1', { productId: 'aroha_pass_monthly', purchaseToken: 'tok-1' });
    expect(state.insertPass).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        source: 'google_play',
        externalId: 'tok-1',
        priceVariant: 'A',
      }),
    );
    expect(state.acknowledge).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 'aroha_pass_monthly', token: 'tok-1' }),
    );
  });

  it("refuses another product, another account's token, and a lapsed subscription", async () => {
    await expect(
      confirmPlayPass('user-1', { productId: 'topup_500', purchaseToken: 't' }),
    ).rejects.toThrow('NOT_A_PASS_PRODUCT');
    state.subscriptionsv2Get.mockResolvedValue(
      live(new Date(NOW.getTime() + DAY), {
        externalAccountIdentifiers: { obfuscatedExternalAccountId: 'someone' },
      }),
    );
    await expect(
      confirmPlayPass('user-1', { productId: 'aroha_pass_monthly', purchaseToken: 't' }),
    ).rejects.toThrow('PLAY_SUBSCRIPTION_OTHER_ACCOUNT');
    state.subscriptionsv2Get.mockResolvedValue(
      live(new Date(NOW.getTime() - DAY), { subscriptionState: 'SUBSCRIPTION_STATE_EXPIRED' }),
    );
    await expect(
      confirmPlayPass('user-1', { productId: 'aroha_pass_monthly', purchaseToken: 't' }),
    ).rejects.toThrow('PLAY_SUBSCRIPTION_NOT_ACTIVE');
  });

  it('a renewal starts the next period with a fresh quota; an expiry ends the Pass', async () => {
    const row = passRow({
      id: 'sub-9',
      source: 'google_play',
      periodEnd: new Date(NOW.getTime() + DAY),
    });
    state.findPassByExternalId.mockResolvedValue(row);
    const next = new Date(NOW.getTime() + 31 * DAY);
    await syncPlayPass(
      'tok-9',
      {
        state: 'SUBSCRIPTION_STATE_ACTIVE',
        productId: 'aroha_pass_monthly',
        basePlanId: 'pass-199',
        expiry: next,
        autoRenew: true,
        acknowledged: true,
        accountId: 'user-1',
        linkedPurchaseToken: null,
      },
      'user-1',
    );
    expect(state.renewPass).toHaveBeenCalledWith('sub-9', { start: row.periodEnd, end: next });

    await syncPlayPass(
      'tok-9',
      {
        state: 'SUBSCRIPTION_STATE_EXPIRED',
        productId: 'aroha_pass_monthly',
        basePlanId: 'pass-199',
        expiry: new Date(NOW.getTime() - DAY),
        autoRenew: false,
        acknowledged: true,
        accountId: 'user-1',
        linkedPurchaseToken: null,
      },
      'user-1',
    );
    expect(state.updatePlayPass).toHaveBeenLastCalledWith(
      'sub-9',
      expect.objectContaining({ status: 'expired' }),
    );
  });
});
