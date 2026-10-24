import { beforeEach, describe, expect, it, vi } from 'vitest';

// The Aroha Pass on Google Play through its whole life, as Google's subscription
// lifecycle docs describe it: renewal, a declined card (grace period, account hold,
// recovery), cancel and restore, plan changes, a resubscribe made in the Play Store,
// lost notices, account deletion. Each case was written to fail on the code before
// the 2026-10-23 audit fixes where that code was wrong.

const state = vi.hoisted(() => ({
  configured: true,
  rows: new Map<string, Record<string, unknown>>(),
  insertPass: vi.fn(),
  renewPass: vi.fn(),
  updatePlayPass: vi.fn(),
  findLapsedPlayPass: vi.fn(),
  listPlayPassesToReconcile: vi.fn(),
  listRenewingPlayPasses: vi.fn(),
  subscriptionsv2Get: vi.fn(),
  acknowledge: vi.fn(),
  cancel: vi.fn(),
  notifyUser: vi.fn(),
  notifyPassPurchase: vi.fn(),
  sendAlert: vi.fn(),
}));

vi.mock('../src/modules/pass/pass.repo.js', () => ({
  findPassByExternalId: (token: string) => Promise.resolve(state.rows.get(token) ?? null),
  insertPass: state.insertPass,
  renewPass: state.renewPass,
  updatePlayPass: state.updatePlayPass,
  findLapsedPlayPass: state.findLapsedPlayPass,
  listPlayPassesToReconcile: state.listPlayPassesToReconcile,
  listRenewingPlayPasses: state.listRenewingPlayPasses,
}));
vi.mock('../src/modules/users/users.repo.js', () => ({
  findActiveUserById: (id: string) =>
    Promise.resolve({ id, locale: 'hi', phoneE164: '+910000000000', email: null }),
}));
vi.mock('../src/lib/notifications/notify-user.js', () => ({ notifyUser: state.notifyUser }));
vi.mock('../src/lib/notifications/telegram.js', () => ({
  notifyPassPurchase: state.notifyPassPurchase,
  sendAlert: state.sendAlert,
}));
vi.mock('../src/config/google-play.js', () => ({
  GOOGLE_PLAY_PACKAGE_NAME: 'com.aroha.astrology',
  isGooglePlayConfigured: () => state.configured,
  getAndroidPublisher: () => ({
    purchases: {
      subscriptionsv2: { get: state.subscriptionsv2Get },
      subscriptions: { acknowledge: state.acknowledge, cancel: state.cancel },
    },
  }),
}));

import {
  cancelPlayPassesForDeletedUser,
  confirmPlayPass,
  handlePlaySubscriptionNotification,
  isPermanentPlayError,
  noticeFor,
  reconcilePlayPasses,
  refreshLapsedPlayPass,
  syncPlayPass,
  type PlaySubscription,
} from '../src/modules/pass/pass-play.service.js';

const DAY = 86_400_000;
const NOW = new Date('2026-11-01T06:30:00Z');
/** When the card was due to be charged. */
const DUE = new Date('2026-11-01T06:00:00Z');

const ACTIVE = 'SUBSCRIPTION_STATE_ACTIVE';
const GRACE = 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';
const HOLD = 'SUBSCRIPTION_STATE_ON_HOLD';
const CANCELED = 'SUBSCRIPTION_STATE_CANCELED';
const EXPIRED = 'SUBSCRIPTION_STATE_EXPIRED';
const PENDING = 'SUBSCRIPTION_STATE_PENDING';

function row(extra: Record<string, unknown> = {}) {
  return {
    id: 'sub-1',
    userId: 'user-1',
    source: 'google_play',
    externalId: 'tok-1',
    priceVariant: 'A',
    pricePaise: 19900,
    status: 'active',
    autoRenew: true,
    periodStart: new Date(DUE.getTime() - 31 * DAY),
    periodEnd: DUE,
    questionsUsed: 12,
    cancelledAt: null,
    playState: ACTIVE,
    latestOrderId: 'GPA.1111-2222-3333-44444',
    playSyncedAt: null,
    ...extra,
  };
}

function sub(
  s: string,
  expiry: Date | null,
  extra: Partial<PlaySubscription> = {},
): PlaySubscription {
  return {
    state: s,
    productId: 'aroha_pass_monthly',
    basePlanId: 'pass-199',
    expiry,
    autoRenew: true,
    acknowledged: true,
    accountId: 'user-1',
    linkedPurchaseToken: null,
    latestOrderId: 'GPA.1111-2222-3333-44444',
    expiredAccountId: null,
    expiredPurchaseToken: null,
    ...extra,
  };
}

/** What subscriptionsv2.get answers for `s`. */
function google(s: PlaySubscription & { acknowledgementPending?: boolean }) {
  return {
    data: {
      subscriptionState: s.state,
      acknowledgementState: s.acknowledged
        ? 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED'
        : 'ACKNOWLEDGEMENT_STATE_PENDING',
      ...(s.accountId
        ? { externalAccountIdentifiers: { obfuscatedExternalAccountId: s.accountId } }
        : {}),
      ...(s.linkedPurchaseToken ? { linkedPurchaseToken: s.linkedPurchaseToken } : {}),
      ...(s.expiredAccountId || s.expiredPurchaseToken
        ? {
            outOfAppPurchaseContext: {
              ...(s.expiredAccountId
                ? {
                    expiredExternalAccountIdentifiers: {
                      obfuscatedExternalAccountId: s.expiredAccountId,
                    },
                  }
                : {}),
              ...(s.expiredPurchaseToken ? { expiredPurchaseToken: s.expiredPurchaseToken } : {}),
            },
          }
        : {}),
      lineItems: [
        {
          productId: s.productId,
          expiryTime: s.expiry?.toISOString(),
          autoRenewingPlan: { autoRenewEnabled: s.autoRenew },
          offerDetails: { basePlanId: s.basePlanId },
          latestSuccessfulOrderId: s.latestOrderId,
        },
      ],
      // The deprecated top-level id also names DECLINED renewals: must never count as paid.
      latestOrderId: 'GPA.1111-2222-3333-44444..1',
    },
  };
}

const lastPatch = () => state.updatePlayPass.mock.calls.at(-1)?.[1] as Record<string, unknown>;

beforeEach(() => {
  state.configured = true;
  state.rows.clear();
  for (const fn of [
    state.insertPass,
    state.renewPass,
    state.updatePlayPass,
    state.findLapsedPlayPass,
    state.listPlayPassesToReconcile,
    state.listRenewingPlayPasses,
    state.subscriptionsv2Get,
    state.acknowledge,
    state.cancel,
    state.notifyUser,
    state.notifyPassPurchase,
    state.sendAlert,
  ]) {
    fn.mockReset();
  }
  state.insertPass.mockResolvedValue({});
  state.updatePlayPass.mockResolvedValue(undefined);
  state.renewPass.mockResolvedValue(undefined);
  state.notifyPassPurchase.mockResolvedValue(true);
  state.sendAlert.mockResolvedValue(true);
  state.findLapsedPlayPass.mockResolvedValue(null);
  state.listPlayPassesToReconcile.mockResolvedValue([]);
  state.listRenewingPlayPasses.mockResolvedValue([]);
});

describe('a renewal is a new paid order, never just a later expiry', () => {
  it('a normal renewal starts the next period where the last one ended, with a fresh allowance', async () => {
    state.rows.set('tok-1', row());
    const next = new Date(DUE.getTime() + 30 * DAY);
    const r = await syncPlayPass(
      'tok-1',
      sub(ACTIVE, next, { latestOrderId: 'GPA.1111-2222-3333-44444..0' }),
      'user-1',
      NOW,
    );
    expect(r.renewed).toBe(true);
    expect(state.renewPass).toHaveBeenCalledWith('sub-1', { start: DUE, end: next });
    expect(lastPatch()).toMatchObject({
      status: 'active',
      periodEnd: next,
      latestOrderId: 'GPA.1111-2222-3333-44444..0',
      playState: ACTIVE,
    });
  });

  it('the same order with a later expiry (a deferral) keeps the period and its allowance', async () => {
    state.rows.set('tok-1', row());
    await syncPlayPass('tok-1', sub(ACTIVE, new Date(DUE.getTime() + 7 * DAY)), 'user-1', NOW);
    expect(state.renewPass).not.toHaveBeenCalled();
  });

  it('a row from before order ids were kept still renews on a jump, but never in a grace period', async () => {
    state.rows.set('tok-1', row({ latestOrderId: null }));
    await syncPlayPass('tok-1', sub(GRACE, new Date(DUE.getTime() + 3 * DAY)), 'user-1', NOW);
    expect(state.renewPass).not.toHaveBeenCalled();
    await syncPlayPass('tok-1', sub(ACTIVE, new Date(DUE.getTime() + 30 * DAY)), 'user-1', NOW);
    expect(state.renewPass).toHaveBeenCalledTimes(1);
  });
});

describe('the renewal payment fails', () => {
  it('grace period: the Pass keeps working to Google’s moving expiry, with NO fresh allowance, and the user is told once', async () => {
    state.rows.set('tok-1', row());
    const graceExpiry = new Date(DUE.getTime() + 3 * DAY);
    await syncPlayPass('tok-1', sub(GRACE, graceExpiry), 'user-1', NOW);
    expect(state.renewPass).not.toHaveBeenCalled();
    expect(lastPatch()).toMatchObject({
      status: 'active',
      periodEnd: graceExpiry,
      playState: GRACE,
    });

    // The notice goes out through the webhook / reconcile path.
    state.subscriptionsv2Get.mockResolvedValue(google(sub(GRACE, graceExpiry)));
    await handlePlaySubscriptionNotification({
      notificationType: 6,
      purchaseToken: 'tok-1',
      subscriptionId: 'aroha_pass_monthly',
    });
    expect(state.notifyUser).toHaveBeenCalledTimes(1);
    expect(state.notifyUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ type: 'aroha_pass', link: '/pass' }),
    );
    // In the user's language (hi).
    expect(state.notifyUser.mock.calls[0]![1].title).toMatch(/Aroha Pass/);
    expect(state.notifyUser.mock.calls[0]![1].title).not.toMatch(/did not go through/);
    expect(state.notifyPassPurchase).not.toHaveBeenCalled();

    // Google keeps extending it; the row already says grace, so no second notice.
    state.rows.set('tok-1', row({ playState: GRACE, periodEnd: graceExpiry }));
    state.subscriptionsv2Get.mockResolvedValue(
      google(sub(GRACE, new Date(DUE.getTime() + 5 * DAY))),
    );
    await handlePlaySubscriptionNotification({
      notificationType: 6,
      purchaseToken: 'tok-1',
      subscriptionId: 'aroha_pass_monthly',
    });
    expect(state.notifyUser).toHaveBeenCalledTimes(1);
    expect(state.renewPass).not.toHaveBeenCalled();
  });

  it('recovered in grace: one new period (the paid one), and a "your Pass is back" notice', async () => {
    const graceEnd = new Date(DUE.getTime() + 2 * DAY);
    state.rows.set('tok-1', row({ playState: GRACE, periodEnd: graceEnd }));
    const at = new Date(DUE.getTime() + 2 * DAY + 3_600_000);
    const next = new Date(DUE.getTime() + 30 * DAY); // Google keeps the original renewal date
    state.subscriptionsv2Get.mockResolvedValue(
      google(sub(ACTIVE, next, { latestOrderId: 'GPA.1111-2222-3333-44444..0' })),
    );
    vi.useFakeTimers({ now: at, toFake: ['Date'] });
    try {
      await handlePlaySubscriptionNotification({
        notificationType: 1,
        purchaseToken: 'tok-1',
        subscriptionId: 'aroha_pass_monthly',
      });
    } finally {
      vi.useRealTimers();
    }
    expect(state.renewPass).toHaveBeenCalledTimes(1);
    expect(state.renewPass).toHaveBeenCalledWith('sub-1', { start: graceEnd, end: next });
    expect(state.notifyUser).toHaveBeenCalledTimes(1);
    expect(state.notifyPassPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', isRenewal: true }),
    );
  });

  it('account hold: the Pass stops (Google sets a past expiry) and the user is told why', async () => {
    state.rows.set('tok-1', row({ playState: GRACE }));
    const past = new Date(NOW.getTime() - DAY);
    state.subscriptionsv2Get.mockResolvedValue(google(sub(HOLD, past)));
    await handlePlaySubscriptionNotification({
      notificationType: 5,
      purchaseToken: 'tok-1',
      subscriptionId: 'aroha_pass_monthly',
    });
    expect(lastPatch()).toMatchObject({ status: 'expired', periodEnd: past, playState: HOLD });
    expect(state.renewPass).not.toHaveBeenCalled();
    expect(state.notifyUser).toHaveBeenCalledTimes(1);
  });

  it('recovered from hold days later: the Pass comes back with a period starting now', async () => {
    const heldAt = new Date(NOW.getTime() - 10 * DAY);
    state.rows.set('tok-1', row({ status: 'expired', playState: HOLD, periodEnd: heldAt }));
    const next = new Date(NOW.getTime() + 30 * DAY);
    const r = await syncPlayPass(
      'tok-1',
      sub(ACTIVE, next, { latestOrderId: 'GPA.1111-2222-3333-44444..0' }),
      'user-1',
      NOW,
    );
    expect(r.renewed).toBe(true);
    expect(state.renewPass).toHaveBeenCalledWith('sub-1', { start: NOW, end: next });
    expect(lastPatch()).toMatchObject({ status: 'active' });
    expect(noticeFor(HOLD, ACTIVE)).toBe('recovered');
  });

  it('only the three changes send a notice', () => {
    expect(noticeFor(ACTIVE, GRACE)).toBe('grace');
    expect(noticeFor(GRACE, HOLD)).toBe('hold');
    expect(noticeFor(GRACE, ACTIVE)).toBe('recovered');
    expect(noticeFor(GRACE, GRACE)).toBeNull();
    expect(noticeFor(ACTIVE, CANCELED)).toBeNull();
    expect(noticeFor(null, ACTIVE)).toBeNull();
    expect(noticeFor(HOLD, EXPIRED)).toBeNull();
  });
});

describe('cancel and restore', () => {
  it('a cancelled Pass runs to the end of what was paid; switching renewal back on clears the cancel', async () => {
    const end = new Date(NOW.getTime() + 10 * DAY);
    state.rows.set('tok-1', row({ periodEnd: end }));
    await syncPlayPass('tok-1', sub(CANCELED, end, { autoRenew: false }), 'user-1', NOW);
    expect(lastPatch()).toMatchObject({ status: 'active', autoRenew: false, cancelledAt: NOW });

    state.rows.set('tok-1', row({ periodEnd: end, cancelledAt: NOW, playState: CANCELED }));
    await syncPlayPass('tok-1', sub(ACTIVE, end), 'user-1', NOW);
    expect(lastPatch()).toMatchObject({ status: 'active', autoRenew: true, cancelledAt: null });
  });
});

describe('plan changes', () => {
  it('moving up mid-period keeps the billing period: what was used stays used (no full allowance for a few rupees)', async () => {
    const old = row({
      externalId: 'tok-old',
      periodStart: new Date(NOW.getTime() - 29 * DAY),
      periodEnd: new Date(NOW.getTime() + DAY),
      questionsUsed: 15,
    });
    state.rows.set('tok-old', old);
    await syncPlayPass(
      'tok-new',
      sub(ACTIVE, new Date(NOW.getTime() + DAY), {
        basePlanId: 'pass-399',
        linkedPurchaseToken: 'tok-old',
        latestOrderId: 'GPA.9999-0000-1111-22222',
      }),
      'user-1',
      NOW,
    );
    expect(state.updatePlayPass).toHaveBeenCalledWith('sub-1', {
      status: 'expired',
      autoRenew: false,
    });
    expect(state.insertPass).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        externalId: 'tok-new',
        priceVariant: 'C',
        periodStart: old.periodStart,
        questionsUsed: 15,
        latestOrderId: 'GPA.9999-0000-1111-22222',
      }),
    );
  });

  it('still carries over when Google’s notice for the old token was handled first', async () => {
    const start = new Date(NOW.getTime() - 20 * DAY);
    state.rows.set(
      'tok-old',
      row({ externalId: 'tok-old', status: 'expired', periodStart: start, periodEnd: NOW }),
    );
    await syncPlayPass(
      'tok-new',
      sub(ACTIVE, new Date(NOW.getTime() + 10 * DAY), {
        basePlanId: 'pass-299',
        linkedPurchaseToken: 'tok-old',
      }),
      'user-1',
      NOW,
    );
    expect(state.insertPass).toHaveBeenCalledWith(
      expect.objectContaining({ periodStart: start, questionsUsed: 12 }),
    );
  });
});

describe('a resubscribe bought in the Play Store (no account id of its own)', () => {
  it('is linked through the account Google names for the expired one, recorded and acknowledged', async () => {
    state.subscriptionsv2Get.mockResolvedValue(
      google(
        sub(ACTIVE, new Date(Date.now() + 30 * DAY), {
          accountId: null,
          acknowledged: false,
          expiredAccountId: 'user-1',
          expiredPurchaseToken: 'tok-gone',
        }),
      ),
    );
    await handlePlaySubscriptionNotification({
      notificationType: 4,
      purchaseToken: 'tok-resub',
      subscriptionId: 'aroha_pass_monthly',
    });
    expect(state.insertPass).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', externalId: 'tok-resub', questionsUsed: 0 }),
    );
    expect(state.acknowledge).toHaveBeenCalledWith(expect.objectContaining({ token: 'tok-resub' }));
    expect(state.notifyPassPurchase).toHaveBeenCalledWith(
      expect.objectContaining({ isRenewal: false }),
    );
  });

  it('falls back to the owner of the expired token when Google names no account', async () => {
    state.rows.set(
      'tok-gone',
      row({ externalId: 'tok-gone', userId: 'user-7', status: 'expired' }),
    );
    state.subscriptionsv2Get.mockResolvedValue(
      google(
        sub(ACTIVE, new Date(Date.now() + 30 * DAY), {
          accountId: null,
          acknowledged: false,
          expiredPurchaseToken: 'tok-gone',
        }),
      ),
    );
    await handlePlaySubscriptionNotification({
      notificationType: 4,
      purchaseToken: 'tok-resub',
      subscriptionId: 'aroha_pass_monthly',
    });
    expect(state.insertPass).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-7' }));
    expect(state.acknowledge).toHaveBeenCalled();
  });
});

describe('confirming from the app', () => {
  it('a payment still pending (slow UPI) answers PLAY_SUBSCRIPTION_PENDING and records nothing', async () => {
    state.subscriptionsv2Get.mockResolvedValue(google(sub(PENDING, null, { acknowledged: false })));
    await expect(
      confirmPlayPass('user-1', { productId: 'aroha_pass_monthly', purchaseToken: 'tok-p' }),
    ).rejects.toThrow('PLAY_SUBSCRIPTION_PENDING');
    expect(state.insertPass).not.toHaveBeenCalled();
  });

  it('refuses a token already recorded for another Aroha account (one Google account, two Aroha accounts)', async () => {
    state.rows.set('tok-1', row({ userId: 'user-2' }));
    state.subscriptionsv2Get.mockResolvedValue(
      google(sub(ACTIVE, new Date(Date.now() + 9 * DAY), { accountId: null })),
    );
    await expect(
      confirmPlayPass('user-1', { productId: 'aroha_pass_monthly', purchaseToken: 'tok-1' }),
    ).rejects.toThrow('PLAY_SUBSCRIPTION_OTHER_ACCOUNT');
  });

  it('a restore of a Pass already recorded sends no "purchased" or "renewed" alert', async () => {
    state.rows.set('tok-1', row({ periodEnd: new Date(Date.now() + 9 * DAY) }));
    state.subscriptionsv2Get.mockResolvedValue(google(sub(ACTIVE, new Date(Date.now() + 9 * DAY))));
    await confirmPlayPass('user-1', { productId: 'aroha_pass_monthly', purchaseToken: 'tok-1' });
    expect(state.notifyPassPurchase).not.toHaveBeenCalled();
  });

  it('the app and Google’s notice racing to create the row: the loser updates instead of failing', async () => {
    state.subscriptionsv2Get.mockResolvedValue(
      google(sub(ACTIVE, new Date(Date.now() + 30 * DAY), { acknowledged: false })),
    );
    state.insertPass.mockImplementationOnce(() => {
      state.rows.set('tok-1', row({ periodEnd: new Date(Date.now() + 30 * DAY) }));
      return Promise.reject(Object.assign(new Error('duplicate key'), { code: '23505' }));
    });
    await confirmPlayPass('user-1', { productId: 'aroha_pass_monthly', purchaseToken: 'tok-1' });
    expect(state.updatePlayPass).toHaveBeenCalledWith(
      'sub-1',
      expect.objectContaining({ status: 'active' }),
    );
    expect(state.acknowledge).toHaveBeenCalled();
  });
});

describe('Google notices are not lost', () => {
  const notice = {
    notificationType: 2,
    purchaseToken: 'tok-1',
    subscriptionId: 'aroha_pass_monthly',
  };

  it('throws (so the webhook answers 500 and Pub/Sub retries) when Google is unreachable', async () => {
    state.subscriptionsv2Get.mockRejectedValue(
      Object.assign(new Error('backend error'), { response: { status: 503 } }),
    );
    await expect(handlePlaySubscriptionNotification(notice)).rejects.toThrow('backend error');
    state.subscriptionsv2Get.mockRejectedValue(
      Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }),
    );
    await expect(handlePlaySubscriptionNotification(notice)).rejects.toThrow('socket hang up');
  });

  it('drops a notice for a token Google does not know (a retry cannot fix it)', async () => {
    state.subscriptionsv2Get.mockRejectedValue(
      Object.assign(new Error('not found'), { response: { status: 404 } }),
    );
    await expect(handlePlaySubscriptionNotification(notice)).resolves.toBeUndefined();
  });

  it('only a rejected token or a constraint violation is permanent — never our own 401/403 or Play being unset', () => {
    expect(isPermanentPlayError({ response: { status: 404 } })).toBe(true);
    expect(isPermanentPlayError({ response: { status: 410 } })).toBe(true);
    expect(isPermanentPlayError({ response: { status: 400 } })).toBe(true);
    expect(isPermanentPlayError({ code: '23503' })).toBe(true);
    expect(isPermanentPlayError({ response: { status: 401 } })).toBe(false);
    expect(isPermanentPlayError({ response: { status: 403 } })).toBe(false);
    expect(isPermanentPlayError({ response: { status: 429 } })).toBe(false);
    expect(isPermanentPlayError({ code: 'FORBIDDEN', status: 403 })).toBe(false);
    expect(isPermanentPlayError({ code: 'ECONNRESET' })).toBe(false);
  });
});

describe('the hourly reconcile', () => {
  it('asks Google about each Pass at its end: renews the paid one, ends the gone one, keeps the unreachable one', async () => {
    const paid = row({ id: 'sub-a', externalId: 'tok-a' });
    const gone = row({ id: 'sub-b', externalId: 'tok-b' });
    const down = row({ id: 'sub-c', externalId: 'tok-c' });
    for (const r of [paid, gone, down]) state.rows.set(r.externalId, r);
    state.listPlayPassesToReconcile.mockResolvedValue([paid, gone, down]);
    state.subscriptionsv2Get.mockImplementation(({ token }: { token: string }) => {
      if (token === 'tok-a')
        return Promise.resolve(
          google(sub(ACTIVE, new Date(DUE.getTime() + 30 * DAY), { latestOrderId: 'GPA.x..0' })),
        );
      if (token === 'tok-b')
        return Promise.reject(Object.assign(new Error('gone'), { response: { status: 410 } }));
      return Promise.reject(Object.assign(new Error('down'), { response: { status: 503 } }));
    });

    const run = await reconcilePlayPasses(NOW);
    expect(run).toEqual({ checked: 3, renewed: 1, ended: 1, failed: 1 });
    expect(state.renewPass).toHaveBeenCalledWith('sub-a', expect.anything());
    expect(state.updatePlayPass).toHaveBeenCalledWith('sub-b', {
      status: 'expired',
      playSyncedAt: NOW,
    });
    expect(state.updatePlayPass.mock.calls.some(([id]) => id === 'sub-c')).toBe(false);
  });

  it('does nothing at all without Play credentials (never ends a Pass for our own setup)', async () => {
    state.configured = false;
    state.listPlayPassesToReconcile.mockResolvedValue([row()]);
    expect(await reconcilePlayPasses(NOW)).toEqual({ checked: 0, renewed: 0, ended: 0, failed: 0 });
    expect(state.subscriptionsv2Get).not.toHaveBeenCalled();
  });

  it('a dry run only counts', async () => {
    state.listPlayPassesToReconcile.mockResolvedValue([row()]);
    expect(await reconcilePlayPasses(NOW, { dryRun: true })).toMatchObject({ checked: 1 });
    expect(state.subscriptionsv2Get).not.toHaveBeenCalled();
  });
});

describe('the on-demand check at the end of a period', () => {
  it('a renewal Google has not told us about yet is found the moment the member uses the Pass', async () => {
    state.rows.set('tok-1', row());
    state.findLapsedPlayPass.mockResolvedValue(row());
    state.subscriptionsv2Get.mockResolvedValue(
      google(sub(ACTIVE, new Date(Date.now() + 30 * DAY), { latestOrderId: 'GPA.y..0' })),
    );
    expect(await refreshLapsedPlayPass('user-1')).toBe(true);
    expect(state.renewPass).toHaveBeenCalledTimes(1);
  });

  it('a silent grace period (Google moved the expiry, sent nothing) keeps the Pass working', async () => {
    state.rows.set('tok-1', row());
    state.findLapsedPlayPass.mockResolvedValue(row());
    state.subscriptionsv2Get.mockResolvedValue(google(sub(ACTIVE, new Date(Date.now() + DAY))));
    expect(await refreshLapsedPlayPass('user-1')).toBe(true);
    expect(state.renewPass).not.toHaveBeenCalled();
  });

  it('when Google is unreachable: no access granted, and no new call on every request', async () => {
    state.findLapsedPlayPass.mockResolvedValue(row());
    state.subscriptionsv2Get.mockRejectedValue(
      Object.assign(new Error('down'), { response: { status: 503 } }),
    );
    expect(await refreshLapsedPlayPass('user-1')).toBe(false);
    expect(state.updatePlayPass).toHaveBeenCalledWith('sub-1', {
      playSyncedAt: expect.any(Date),
    });
  });

  it('is a no-op without a lapsed Play Pass', async () => {
    expect(await refreshLapsedPlayPass('user-1')).toBe(false);
    expect(state.subscriptionsv2Get).not.toHaveBeenCalled();
  });
});

describe('account deletion', () => {
  it('cancels every Play Pass that could still charge, and keeps going past a failure with an admin alert', async () => {
    state.listRenewingPlayPasses.mockResolvedValue([
      row({ id: 'sub-a', externalId: 'tok-a' }),
      row({ id: 'sub-b', externalId: 'tok-b' }),
    ]);
    state.cancel.mockImplementation(({ token }: { token: string }) =>
      token === 'tok-a' ? Promise.resolve({}) : Promise.reject(new Error('play down')),
    );
    await expect(cancelPlayPassesForDeletedUser('user-1')).resolves.toBeUndefined();
    expect(state.cancel).toHaveBeenCalledWith(
      expect.objectContaining({ subscriptionId: 'aroha_pass_monthly', token: 'tok-a' }),
    );
    expect(state.updatePlayPass).toHaveBeenCalledWith(
      'sub-a',
      expect.objectContaining({ autoRenew: false, cancelledAt: expect.any(Date) }),
    );
    expect(state.sendAlert).toHaveBeenCalledTimes(1);
    expect(state.sendAlert.mock.calls[0]![1]).toMatch(/user-1/);
  });
});
