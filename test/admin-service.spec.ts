import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  sumPaidOrdersBetween: vi.fn(),
  revenueTimeSeries: vi.fn(),
  spendByFeature: vi.fn(),
  spendByReportKey: vi.fn(),
  topUpFunnel: vi.fn(),
  payingUserCount: vi.fn(),
  logAdminAction: vi.fn().mockResolvedValue(undefined),
  costByAgent: vi.fn(),
  usersActiveBetween: vi.fn(),
  usersCreatedBetween: vi.fn(),
  sumWalletBalanceOutstanding: vi.fn(),
  listUsersPage: vi.fn(),
  countUsersMatching: vi.fn(),
  addWalletBalance: vi.fn().mockResolvedValue(undefined),
  deductWalletBalance: vi.fn(),
  findActiveUserById: vi.fn(),
  resolveFeatures: vi.fn(),
  invalidateFeatureCache: vi.fn(),
  upsertFeatureOverride: vi.fn(),
}));

vi.mock('../src/modules/admin/admin.repo.js', () => ({
  sumPaidOrdersBetween: state.sumPaidOrdersBetween,
  revenueTimeSeries: state.revenueTimeSeries,
  spendByFeature: state.spendByFeature,
  spendByReportKey: state.spendByReportKey,
  topUpFunnel: state.topUpFunnel,
  payingUserCount: state.payingUserCount,
  logAdminAction: state.logAdminAction,
}));

vi.mock('../src/modules/admin/ai-usage.repo.js', () => ({
  costByAgent: state.costByAgent,
}));

vi.mock('../src/modules/users/users.repo.js', () => ({
  usersActiveBetween: state.usersActiveBetween,
  usersCreatedBetween: state.usersCreatedBetween,
  sumWalletBalanceOutstanding: state.sumWalletBalanceOutstanding,
  listUsersPage: state.listUsersPage,
  countUsersMatching: state.countUsersMatching,
  addWalletBalance: state.addWalletBalance,
  deductWalletBalance: state.deductWalletBalance,
  findActiveUserById: state.findActiveUserById,
}));

vi.mock('../src/modules/features/features.service.js', () => ({
  resolveFeatures: state.resolveFeatures,
  invalidateFeatureCache: state.invalidateFeatureCache,
}));

vi.mock('../src/modules/features/features.repo.js', () => ({
  upsertFeatureOverride: state.upsertFeatureOverride,
}));

const {
  getOverview,
  listFeaturesForAdmin,
  updateFeature,
  searchUsers,
  adjustWallet,
  getReportsBreakdown,
} = await import('../src/modules/admin/admin.service.js');

const range = { from: new Date('2026-07-01T00:00:00Z'), to: new Date('2026-07-08T00:00:00Z') };

beforeEach(() => {
  for (const fn of Object.values(state)) {
    if (typeof fn === 'function' && 'mockReset' in fn) (fn as any).mockReset();
  }
  state.logAdminAction.mockResolvedValue(undefined);
  state.addWalletBalance.mockResolvedValue(undefined);
});

describe('getOverview', () => {
  it('assembles every metric into the overview shape', async () => {
    state.sumPaidOrdersBetween.mockResolvedValue({ totalPaise: 100000, count: 20 });
    state.revenueTimeSeries.mockResolvedValue([
      { bucketStart: '2026-07-01', totalPaise: 5000, count: 1 },
    ]);
    state.spendByFeature.mockResolvedValue([
      { reasonPrefix: 'chat_message', totalPaise: 4000, count: 2 },
    ]);
    state.topUpFunnel.mockResolvedValue([{ status: 'paid', count: 20 }]);
    state.payingUserCount.mockResolvedValue(15);
    state.usersCreatedBetween.mockResolvedValue(30);
    state.usersActiveBetween.mockResolvedValue(50);
    state.sumWalletBalanceOutstanding.mockResolvedValue(200000);
    state.costByAgent.mockResolvedValue([
      { agent: 'chat', tokensIn: 100, tokensOut: 200, calls: 5 },
    ]);

    const result = await getOverview(range, 'last7d');

    expect(result.cashInPaise).toBe(100000);
    expect(result.orderCount).toBe(20);
    expect(result.walletSpendPaise).toBe(4000);
    expect(result.walletLiabilityPaise).toBe(200000);
    expect(result.payingUsers).toBe(15);
    expect(result.newUsers).toBe(30);
    expect(result.activeUsers).toBe(50);
    // arpu = cashInPaise / max(1, activeUsers) = 100000 / 50 = 2000
    expect(result.arpuPaise).toBe(2000);
    expect(result.timeSeries).toEqual([{ bucketStart: '2026-07-01', totalPaise: 5000, count: 1 }]);
    expect(result.spendByFeature).toEqual([
      { reasonPrefix: 'chat_message', totalPaise: 4000, count: 2 },
    ]);
    expect(result.topUpFunnel).toEqual([{ status: 'paid', count: 20 }]);
    expect(result.llmCostByAgent).toEqual([
      { agent: 'chat', tokensIn: 100, tokensOut: 200, calls: 5 },
    ]);
    expect(result.range).toEqual({ from: range.from.toISOString(), to: range.to.toISOString() });
  });

  it('floors arpu denominator at 1 active user to avoid a divide-by-zero', async () => {
    state.sumPaidOrdersBetween.mockResolvedValue({ totalPaise: 5000, count: 1 });
    state.revenueTimeSeries.mockResolvedValue([]);
    state.spendByFeature.mockResolvedValue([]);
    state.topUpFunnel.mockResolvedValue([]);
    state.payingUserCount.mockResolvedValue(0);
    state.usersCreatedBetween.mockResolvedValue(0);
    state.usersActiveBetween.mockResolvedValue(0);
    state.sumWalletBalanceOutstanding.mockResolvedValue(0);
    state.costByAgent.mockResolvedValue([]);

    const result = await getOverview(range, 'today');

    expect(result.arpuPaise).toBe(5000);
  });
});

describe('listFeaturesForAdmin', () => {
  it('merges the FEATURE_REGISTRY with resolveFeatures() overrides', async () => {
    state.resolveFeatures.mockResolvedValue({
      'paid.chat': { enabled: false, pricePaise: 1500, originalPricePaise: 2500 },
    });

    const result = await listFeaturesForAdmin();

    const chat = result.find((f) => f.key === 'paid.chat');
    expect(chat).toEqual({
      key: 'paid.chat',
      label: 'AI Chat',
      group: 'paid',
      enabled: false,
      pricePaise: 1500,
      originalPricePaise: 2500,
      model: null,
      modelOptions: [],
    });
    // A key with no override falls back to its registry default.
    const navHome = result.find((f) => f.key === 'nav.home');
    expect(navHome).toEqual({
      key: 'nav.home',
      label: 'Home tab',
      group: 'nav',
      enabled: true,
      pricePaise: null,
      originalPricePaise: null,
      model: null,
      modelOptions: [],
    });
  });

  it('falls back to null originalPricePaise when the override has no discount configured (no basePricePaise fallback)', async () => {
    state.resolveFeatures.mockResolvedValue({
      'paid.chat': { enabled: true, pricePaise: 2000, originalPricePaise: null },
    });

    const result = await listFeaturesForAdmin();

    const chat = result.find((f) => f.key === 'paid.chat');
    expect(chat?.originalPricePaise).toBeNull();
  });
});

describe('updateFeature', () => {
  it('rejects an unknown feature key with a 400', async () => {
    await expect(
      updateFeature('not.a.real.key', true, undefined, undefined, undefined, '+919999111111'),
    ).rejects.toMatchObject({ status: 400 });
    expect(state.upsertFeatureOverride).not.toHaveBeenCalled();
  });

  it('upserts, invalidates the cache, and audit-logs on a known key', async () => {
    state.resolveFeatures.mockResolvedValue({});
    state.upsertFeatureOverride.mockResolvedValue({
      key: 'paid.chat',
      enabled: false,
      pricePaise: 2000,
      originalPricePaise: null,
      updatedAt: new Date(),
      updatedBy: '+919999111111',
    });

    const result = await updateFeature(
      'paid.chat',
      false,
      undefined,
      undefined,
      undefined,
      '+919999111111',
    );

    expect(state.upsertFeatureOverride).toHaveBeenCalledWith(
      'paid.chat',
      false,
      2000,
      null,
      null,
      '+919999111111',
      null,
    );
    expect(state.invalidateFeatureCache).toHaveBeenCalledTimes(1);
    expect(state.logAdminAction).toHaveBeenCalledWith(
      '+919999111111',
      'PUT /v1/admin/features',
      expect.objectContaining({ key: 'paid.chat', enabled: false }),
    );
    expect(result).toEqual({
      key: 'paid.chat',
      label: 'AI Chat',
      group: 'paid',
      enabled: false,
      pricePaise: 2000,
      originalPricePaise: null,
      model: null,
      modelOptions: [],
    });
  });

  it('preserves the current resolved price when pricePaise is omitted', async () => {
    state.resolveFeatures.mockResolvedValue({
      'paid.chat': { enabled: true, pricePaise: 3500, originalPricePaise: null },
    });
    state.upsertFeatureOverride.mockResolvedValue({
      key: 'paid.chat',
      enabled: false,
      pricePaise: 3500,
      originalPricePaise: null,
      updatedAt: new Date(),
      updatedBy: 'admin',
    });

    await updateFeature('paid.chat', false, undefined, undefined, undefined, '+919999111111');

    expect(state.upsertFeatureOverride).toHaveBeenCalledWith(
      'paid.chat',
      false,
      3500,
      null,
      null,
      '+919999111111',
      null,
    );
  });

  it('accepts an explicit null pricePaise (clearing the price)', async () => {
    state.resolveFeatures.mockResolvedValue({
      'paid.chat': { enabled: true, pricePaise: 3500, originalPricePaise: null },
    });
    state.upsertFeatureOverride.mockResolvedValue({
      key: 'paid.chat',
      enabled: true,
      pricePaise: null,
      originalPricePaise: null,
      updatedAt: new Date(),
      updatedBy: 'admin',
    });

    await updateFeature('paid.chat', true, null, undefined, undefined, '+919999111111');

    expect(state.upsertFeatureOverride).toHaveBeenCalledWith(
      'paid.chat',
      true,
      null,
      null,
      null,
      '+919999111111',
      null,
    );
  });

  it('preserves the current resolved originalPricePaise when it is omitted, independently of pricePaise', async () => {
    state.resolveFeatures.mockResolvedValue({
      'paid.chat': { enabled: true, pricePaise: 3500, originalPricePaise: 6000 },
    });
    state.upsertFeatureOverride.mockResolvedValue({
      key: 'paid.chat',
      enabled: true,
      pricePaise: 3500,
      originalPricePaise: 6000,
      updatedAt: new Date(),
      updatedBy: 'admin',
    });

    await updateFeature('paid.chat', true, undefined, undefined, undefined, '+919999111111');

    expect(state.upsertFeatureOverride).toHaveBeenCalledWith(
      'paid.chat',
      true,
      3500,
      6000,
      null,
      '+919999111111',
      null,
    );
  });

  it('accepts an explicit null originalPricePaise (clearing the discount) while leaving pricePaise as given', async () => {
    state.resolveFeatures.mockResolvedValue({});
    state.upsertFeatureOverride.mockResolvedValue({
      key: 'paid.chat',
      enabled: true,
      pricePaise: 2000,
      originalPricePaise: null,
      updatedAt: new Date(),
      updatedBy: 'admin',
    });

    await updateFeature('paid.chat', true, 2000, null, undefined, '+919999111111');

    expect(state.upsertFeatureOverride).toHaveBeenCalledWith(
      'paid.chat',
      true,
      2000,
      null,
      null,
      '+919999111111',
      null,
    );
  });

  it('sets both pricePaise and originalPricePaise together to configure a discount', async () => {
    state.resolveFeatures.mockResolvedValue({});
    state.upsertFeatureOverride.mockResolvedValue({
      key: 'paid.chat',
      enabled: true,
      pricePaise: 14900,
      originalPricePaise: 49900,
      updatedAt: new Date(),
      updatedBy: 'admin',
    });

    const result = await updateFeature('paid.chat', true, 14900, 49900, undefined, '+919999111111');

    expect(state.upsertFeatureOverride).toHaveBeenCalledWith(
      'paid.chat',
      true,
      14900,
      49900,
      null,
      '+919999111111',
      null,
    );
    expect(result.pricePaise).toBe(14900);
    expect(result.originalPricePaise).toBe(49900);
  });

  it('sets enabledAt to now on a false->true transition (drives the report catalogue "New" badge)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-04T12:00:00Z'));
    state.resolveFeatures.mockResolvedValue({
      'paid.chat': {
        enabled: false,
        pricePaise: 3500,
        originalPricePaise: null,
        model: null,
        enabledAt: null,
      },
    });
    state.upsertFeatureOverride.mockResolvedValue({
      key: 'paid.chat',
      enabled: true,
      pricePaise: 3500,
      originalPricePaise: null,
      updatedAt: new Date(),
      updatedBy: '+919999111111',
    });

    await updateFeature('paid.chat', true, undefined, undefined, undefined, '+919999111111');

    expect(state.upsertFeatureOverride).toHaveBeenCalledWith(
      'paid.chat',
      true,
      3500,
      null,
      null,
      '+919999111111',
      new Date('2026-09-04T12:00:00Z'),
    );
    vi.useRealTimers();
  });

  it('preserves the existing enabledAt when already enabled and only the price changes', async () => {
    const originalEnabledAt = new Date('2026-08-01T00:00:00Z');
    state.resolveFeatures.mockResolvedValue({
      'paid.chat': {
        enabled: true,
        pricePaise: 3500,
        originalPricePaise: null,
        model: null,
        enabledAt: originalEnabledAt,
      },
    });
    state.upsertFeatureOverride.mockResolvedValue({
      key: 'paid.chat',
      enabled: true,
      pricePaise: 4000,
      originalPricePaise: null,
      updatedAt: new Date(),
      updatedBy: '+919999111111',
    });

    await updateFeature('paid.chat', true, 4000, undefined, undefined, '+919999111111');

    expect(state.upsertFeatureOverride).toHaveBeenCalledWith(
      'paid.chat',
      true,
      4000,
      null,
      null,
      '+919999111111',
      originalEnabledAt,
    );
  });

  it('does not reset enabledAt when disabling a feature (only a false->true transition sets it)', async () => {
    const originalEnabledAt = new Date('2026-08-01T00:00:00Z');
    state.resolveFeatures.mockResolvedValue({
      'paid.chat': {
        enabled: true,
        pricePaise: 3500,
        originalPricePaise: null,
        model: null,
        enabledAt: originalEnabledAt,
      },
    });
    state.upsertFeatureOverride.mockResolvedValue({
      key: 'paid.chat',
      enabled: false,
      pricePaise: 3500,
      originalPricePaise: null,
      updatedAt: new Date(),
      updatedBy: '+919999111111',
    });

    await updateFeature('paid.chat', false, undefined, undefined, undefined, '+919999111111');

    expect(state.upsertFeatureOverride).toHaveBeenCalledWith(
      'paid.chat',
      false,
      3500,
      null,
      null,
      '+919999111111',
      originalEnabledAt,
    );
  });
});

describe('searchUsers', () => {
  it('pages through listUsersPage/countUsersMatching with the same q, serializing dates to ISO strings', async () => {
    state.listUsersPage.mockResolvedValue([
      {
        id: 'u1',
        displayName: 'Asha',
        phoneE164: '+919999999999',
        email: 'asha@test.com',
        walletBalancePaise: 1000,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        lastActiveAt: new Date('2026-07-20T00:00:00Z'),
      },
    ]);
    state.countUsersMatching.mockResolvedValue(1);

    const result = await searchUsers('asha', 20, 0);

    expect(state.listUsersPage).toHaveBeenCalledWith(20, 0, 'asha', 'createdAt', 'desc', 'all');
    expect(state.countUsersMatching).toHaveBeenCalledWith('asha', 'all');
    expect(result).toEqual({
      users: [
        {
          id: 'u1',
          displayName: 'Asha',
          phoneE164: '+919999999999',
          email: 'asha@test.com',
          walletBalancePaise: 1000,
          createdAt: '2026-07-01T00:00:00.000Z',
          lastActiveAt: '2026-07-20T00:00:00.000Z',
        },
      ],
      total: 1,
      offset: 0,
      limit: 20,
    });
  });

  it('serializes a null lastActiveAt (never active) as null, not a crash', async () => {
    state.listUsersPage.mockResolvedValue([
      {
        id: 'u2',
        displayName: null,
        phoneE164: null,
        email: null,
        walletBalancePaise: 0,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        lastActiveAt: null,
      },
    ]);
    state.countUsersMatching.mockResolvedValue(1);

    const result = await searchUsers(undefined, 20, 0);

    expect(result.users[0]!.lastActiveAt).toBeNull();
  });
});

describe('adjustWallet', () => {
  it('grants a positive delta via addWalletBalance with reason admin_grant', async () => {
    state.findActiveUserById.mockResolvedValueOnce({ id: 'u1', walletBalancePaise: 1000 });
    state.findActiveUserById.mockResolvedValueOnce({ id: 'u1', walletBalancePaise: 6000 });

    const result = await adjustWallet('u1', 5000, 'goodwill credit', '+919999111111');

    expect(state.addWalletBalance).toHaveBeenCalledWith('u1', 5000, 'admin_grant');
    expect(state.deductWalletBalance).not.toHaveBeenCalled();
    expect(result).toEqual({ walletBalancePaise: 6000 });
    expect(state.logAdminAction).toHaveBeenCalledWith(
      '+919999111111',
      'POST /v1/admin/users/u1/wallet',
      { deltaPaise: 5000, note: 'goodwill credit' },
    );
  });

  it('deducts a negative delta via deductWalletBalance with reason admin_deduction', async () => {
    state.findActiveUserById.mockResolvedValueOnce({ id: 'u1', walletBalancePaise: 6000 });
    state.deductWalletBalance.mockResolvedValueOnce(true);
    state.findActiveUserById.mockResolvedValueOnce({ id: 'u1', walletBalancePaise: 1000 });

    const result = await adjustWallet('u1', -5000, 'correction', '+919999111111');

    expect(state.deductWalletBalance).toHaveBeenCalledWith('u1', 5000, 'admin_deduction');
    expect(result).toEqual({ walletBalancePaise: 1000 });
  });

  it('refuses (does not floor at zero) when a deduction would exceed the balance — same as Telegram /money', async () => {
    state.findActiveUserById.mockResolvedValueOnce({ id: 'u1', walletBalancePaise: 1000 });
    state.deductWalletBalance.mockResolvedValueOnce(false);

    await expect(adjustWallet('u1', -5000, 'oops', '+919999111111')).rejects.toMatchObject({
      status: 409,
    });
    expect(state.logAdminAction).not.toHaveBeenCalled();
  });

  it('404s when the target user does not exist', async () => {
    state.findActiveUserById.mockResolvedValueOnce(undefined);

    await expect(adjustWallet('ghost', 100, 'x', '+919999111111')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('rejects a zero delta', async () => {
    state.findActiveUserById.mockResolvedValueOnce({ id: 'u1', walletBalancePaise: 1000 });

    await expect(adjustWallet('u1', 0, 'x', '+919999111111')).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('getReportsBreakdown', () => {
  it('returns the per-report-key spend breakdown', async () => {
    state.spendByReportKey.mockResolvedValue([
      { reportKey: 'marriage', totalPaise: 9900, count: 1 },
    ]);

    const result = await getReportsBreakdown(range);

    expect(state.spendByReportKey).toHaveBeenCalledWith(range);
    expect(result).toEqual([{ reportKey: 'marriage', totalPaise: 9900, count: 1 }]);
  });
});
