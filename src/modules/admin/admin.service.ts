import { FEATURE_REGISTRY, isKnownFeatureKey } from '../../config/features.js';
import { Errors } from '../../lib/errors.js';
import { resolveFeatures, invalidateFeatureCache } from '../features/features.service.js';
import { upsertFeatureOverride } from '../features/features.repo.js';
import {
  usersActiveBetween,
  usersCreatedBetween,
  sumWalletBalanceOutstanding,
  listUsersPage,
  countUsersMatching,
  addWalletBalance,
  deductWalletBalance,
  findActiveUserById,
  type UserSortBy,
} from '../users/users.repo.js';
import { costByAgent, type AgentCostRow } from './ai-usage.repo.js';
import {
  sumPaidOrdersBetween,
  revenueTimeSeries,
  spendByFeature,
  spendByReportKey,
  topUpFunnel,
  payingUserCount,
  logAdminAction,
  type DateRange,
} from './admin.repo.js';

/**
 * Bucket-size heuristic for the overview's revenueTimeSeries — coarser
 * granularity for long windows keeps the chart readable (a year of daily
 * points is not useful) while short/medium windows stay at daily
 * resolution. Not specified beyond "day/week/month" support in the repo
 * primitive, so this is a reasonable admin-dashboard default.
 */
function bucketForPreset(preset: string): 'day' | 'week' | 'month' {
  if (preset === 'this_year' || preset === 'lifetime') return 'month';
  if (preset === 'last90d' || preset === 'this_quarter') return 'week';
  return 'day';
}

export interface OverviewDto {
  range: { from: string; to: string };
  cashInPaise: number;
  orderCount: number;
  walletSpendPaise: number;
  walletLiabilityPaise: number;
  payingUsers: number;
  arpuPaise: number;
  newUsers: number;
  activeUsers: number;
  timeSeries: { bucketStart: string; totalPaise: number; count: number }[];
  spendByFeature: { reasonPrefix: string; totalPaise: number; count: number }[];
  topUpFunnel: { status: string; count: number }[];
  llmCostByAgent: AgentCostRow[];
}

/** `arpu` = cash collected in `range` / active users in `range`, floored at 1 user to avoid a divide-by-zero on a quiet window. Computed here (service layer), not in the repo, per the task spec. */
export async function arpu(range: DateRange): Promise<number> {
  const [{ totalPaise }, activeUsers] = await Promise.all([
    sumPaidOrdersBetween(range),
    usersActiveBetween(range),
  ]);
  return Math.round(totalPaise / Math.max(1, activeUsers));
}

export async function getOverview(
  range: DateRange,
  preset: string,
  opts: { llmUserId?: string } = {},
): Promise<OverviewDto> {
  const [
    { totalPaise: cashInPaise, count: orderCount },
    timeSeries,
    spend,
    funnel,
    payingUsers,
    newUsers,
    activeUsers,
    walletLiabilityPaise,
    llmCostByAgent,
  ] = await Promise.all([
    sumPaidOrdersBetween(range),
    revenueTimeSeries(range, bucketForPreset(preset)),
    spendByFeature(range),
    topUpFunnel(range),
    payingUserCount(range),
    usersCreatedBetween(range),
    usersActiveBetween(range),
    sumWalletBalanceOutstanding(),
    // Only the AI-cost breakdown honours the user filter — the revenue and
    // funnel figures beside it are business-wide by definition, so narrowing
    // them to one user would be meaningless rather than useful.
    costByAgent(range, opts.llmUserId ? { userId: opts.llmUserId } : {}),
  ]);

  const walletSpendPaise = spend.reduce((sum, entry) => sum + entry.totalPaise, 0);
  const arpuPaise = Math.round(cashInPaise / Math.max(1, activeUsers));

  return {
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    cashInPaise,
    orderCount,
    walletSpendPaise,
    walletLiabilityPaise,
    payingUsers,
    arpuPaise,
    newUsers,
    activeUsers,
    timeSeries,
    spendByFeature: spend,
    topUpFunnel: funnel,
    llmCostByAgent,
  };
}

/* -------------------------------------------------------------------------- */
/* Feature flags                                                              */
/* -------------------------------------------------------------------------- */

export interface AdminFeatureRow {
  key: string;
  label: string;
  group: string;
  enabled: boolean;
  pricePaise: number | null;
  originalPricePaise: number | null;
}

/** Merges FEATURE_REGISTRY (the source of truth for what features exist) with resolveFeatures()'s admin overrides. */
export async function listFeaturesForAdmin(): Promise<AdminFeatureRow[]> {
  const resolved = await resolveFeatures();
  return FEATURE_REGISTRY.map((feature) => ({
    key: feature.key,
    label: feature.label,
    group: feature.group,
    enabled: resolved[feature.key]?.enabled ?? feature.defaultEnabled,
    pricePaise: resolved[feature.key]?.pricePaise ?? feature.defaultPricePaise ?? null,
    // No registry-level default for this one (unlike pricePaise/basePricePaise)
    // — a feature with no admin override simply has no discount to show.
    originalPricePaise: resolved[feature.key]?.originalPricePaise ?? null,
  }));
}

/**
 * Toggles/prices a feature. `pricePaise === undefined` means "leave the
 * price as it currently resolves" (registry default or existing override) —
 * distinct from an explicit `null`, which clears it. `originalPricePaise`
 * follows the identical undefined-preserves/null-clears convention,
 * independently of `pricePaise`. Rejects an unknown key up front since
 * FEATURE_REGISTRY is the source of truth for what keys exist; writing an
 * override row for a key nothing reads would be silent dead configuration.
 */
export async function updateFeature(
  key: string,
  enabled: boolean,
  pricePaise: number | null | undefined,
  originalPricePaise: number | null | undefined,
  adminPhone: string,
): Promise<AdminFeatureRow> {
  if (!isKnownFeatureKey(key)) {
    throw Errors.badRequest(`Unknown feature key "${key}"`);
  }
  const registryEntry = FEATURE_REGISTRY.find((feature) => feature.key === key)!;

  let resolvedPrice: number | null;
  let resolvedOriginalPrice: number | null;
  if (pricePaise === undefined || originalPricePaise === undefined) {
    const resolved = await resolveFeatures();
    resolvedPrice =
      pricePaise === undefined
        ? (resolved[key]?.pricePaise ?? registryEntry.defaultPricePaise ?? null)
        : pricePaise;
    resolvedOriginalPrice =
      originalPricePaise === undefined
        ? (resolved[key]?.originalPricePaise ?? null)
        : originalPricePaise;
  } else {
    resolvedPrice = pricePaise;
    resolvedOriginalPrice = originalPricePaise;
  }

  const row = await upsertFeatureOverride(
    key,
    enabled,
    resolvedPrice,
    resolvedOriginalPrice,
    adminPhone,
  );
  invalidateFeatureCache();
  await logAdminAction(adminPhone, 'PUT /v1/admin/features', {
    key,
    enabled,
    pricePaise: resolvedPrice,
    originalPricePaise: resolvedOriginalPrice,
  });

  return {
    key: row.key,
    label: registryEntry.label,
    group: registryEntry.group,
    enabled: row.enabled,
    pricePaise: row.pricePaise,
    originalPricePaise: row.originalPricePaise,
  };
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export async function searchUsers(
  q: string | undefined,
  limit: number,
  offset: number,
  sortBy: UserSortBy = 'createdAt',
  sortDir: 'asc' | 'desc' = 'desc',
) {
  const [rows, total] = await Promise.all([
    listUsersPage(limit, offset, q, sortBy, sortDir),
    countUsersMatching(q),
  ]);
  const users = rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    lastActiveAt: row.lastActiveAt ? row.lastActiveAt.toISOString() : null,
  }));
  return { users, total, offset, limit };
}

/**
 * The web equivalent of the Telegram `/money` command (telegram-bot.commands.ts
 * cmdMoney) — same reasons (`admin_grant`/`admin_deduction`), same refusal
 * behavior when a deduction would exceed the balance (409, NOT a floor-at-
 * zero — deductWalletBalance's own conditional-UPDATE guard already refuses,
 * this just surfaces that as an HTTP error instead of a chat reply).
 */
export async function adjustWallet(
  userId: string,
  deltaPaise: number,
  note: string,
  adminPhone: string,
): Promise<{ walletBalancePaise: number }> {
  const user = await findActiveUserById(userId);
  if (!user) throw Errors.notFound('User not found');

  if (deltaPaise === 0) {
    throw Errors.badRequest('deltaPaise must be non-zero');
  }

  const amountPaise = Math.round(Math.abs(deltaPaise));
  if (deltaPaise > 0) {
    await addWalletBalance(userId, amountPaise, 'admin_grant');
  } else {
    const ok = await deductWalletBalance(userId, amountPaise, 'admin_deduction');
    if (!ok) {
      throw Errors.conflict(
        `Cannot deduct ${amountPaise} paise from this user — balance is only ${user.walletBalancePaise} paise`,
      );
    }
  }

  const updated = await findActiveUserById(userId);
  await logAdminAction(adminPhone, `POST /v1/admin/users/${userId}/wallet`, { deltaPaise, note });
  return { walletBalancePaise: updated?.walletBalancePaise ?? 0 };
}

/* -------------------------------------------------------------------------- */
/* Reports                                                                    */
/* -------------------------------------------------------------------------- */

export async function getReportsBreakdown(range: DateRange) {
  return spendByReportKey(range);
}
