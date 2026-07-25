import { and, count, desc, eq, gte, like, lt, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { Errors } from '../../lib/errors.js';
import { orders, walletTransactions, adminAuditLog } from '../../db/schema.js';

/* -------------------------------------------------------------------------- */
/* IST-anchored date range resolution                                          */
/* -------------------------------------------------------------------------- */

export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Asia/Kolkata is a fixed UTC+5:30 offset — India observes no DST, so this
 * never needs a timezone-database lookup, just constant arithmetic. Every
 * date-range boundary in this module is computed against this offset, NOT
 * server-local time — see billing.repo.ts's old `sumPaidOrdersToday` for the
 * bug this avoids (server-local midnight is off by 5:30 on a UTC box, so
 * "today" silently included/excluded the wrong orders).
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * The UTC instant of IST midnight for the given (year, zero-indexed month,
 * day-of-month). `Date.UTC` normalizes out-of-range components (day 0, day
 * 32, month -1, month 12, ...) the same way `new Date(y, m, d)` does, so
 * every caller below can do plain integer +/- arithmetic on `day`/`month`
 * without manually handling month-length or year-boundary rollover.
 */
function istBoundary(year: number, monthIndex0: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex0, day, 0, 0, 0) - IST_OFFSET_MS);
}

/** The IST calendar (year, zero-indexed month, day) for a given instant, independent of server-local timezone. */
function istPartsOf(instant: Date): { year: number; monthIndex0: number; day: number } {
  const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex0: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

const CUSTOM_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseCustomDateBoundary(
  value: string,
  which: 'from' | 'to',
): { year: number; monthIndex0: number; day: number } {
  if (!CUSTOM_DATE_RE.test(value)) {
    throw Errors.badRequest(`Invalid "${which}" date for the custom preset — expected YYYY-MM-DD`);
  }
  const [yearStr, monthStr, dayStr] = value.split('-') as [string, string, string];
  return { year: Number(yearStr), monthIndex0: Number(monthStr) - 1, day: Number(dayStr) };
}

/**
 * IST-anchored preset resolver for every admin revenue/analytics query.
 * `to` is always EXCLUSIVE (callers filter `column < to`, never `<=`).
 *
 * `now` defaults to the real current time but can be pinned by tests/callers
 * so "today"/"yesterday"/etc. are deterministic — same test-time-injection
 * convention as `listRecentlyActiveUsersAfter`-style code elsewhere in this
 * codebase (an optional trailing parameter with a `new Date()` default).
 */
export function resolveDateRangePreset(
  preset: string,
  from?: string,
  to?: string,
  now: Date = new Date(),
): DateRange {
  const { year, monthIndex0, day } = istPartsOf(now);

  switch (preset) {
    case 'today':
      return {
        from: istBoundary(year, monthIndex0, day),
        to: istBoundary(year, monthIndex0, day + 1),
      };
    case 'yesterday':
      return {
        from: istBoundary(year, monthIndex0, day - 1),
        to: istBoundary(year, monthIndex0, day),
      };
    case 'last7d':
      return {
        from: istBoundary(year, monthIndex0, day - 6),
        to: istBoundary(year, monthIndex0, day + 1),
      };
    case 'last15d':
      return {
        from: istBoundary(year, monthIndex0, day - 14),
        to: istBoundary(year, monthIndex0, day + 1),
      };
    case 'last30d':
      return {
        from: istBoundary(year, monthIndex0, day - 29),
        to: istBoundary(year, monthIndex0, day + 1),
      };
    case 'last90d':
      return {
        from: istBoundary(year, monthIndex0, day - 89),
        to: istBoundary(year, monthIndex0, day + 1),
      };
    case 'this_month':
      return {
        from: istBoundary(year, monthIndex0, 1),
        to: istBoundary(year, monthIndex0 + 1, 1),
      };
    case 'last_month':
      return {
        from: istBoundary(year, monthIndex0 - 1, 1),
        to: istBoundary(year, monthIndex0, 1),
      };
    case 'this_quarter': {
      const quarterStartMonth0 = Math.floor(monthIndex0 / 3) * 3;
      return {
        from: istBoundary(year, quarterStartMonth0, 1),
        to: istBoundary(year, quarterStartMonth0 + 3, 1),
      };
    }
    case 'this_year':
      return { from: istBoundary(year, 0, 1), to: istBoundary(year + 1, 0, 1) };
    case 'lifetime':
      // Nothing predates the epoch; the exclusive upper bound is the same
      // "start of IST tomorrow" every other preset uses as its ceiling.
      return { from: new Date(0), to: istBoundary(year, monthIndex0, day + 1) };
    case 'custom': {
      if (!from || !to) {
        throw Errors.badRequest('The "custom" preset requires both "from" and "to" query params');
      }
      const fromParts = parseCustomDateBoundary(from, 'from');
      const toParts = parseCustomDateBoundary(to, 'to');
      return {
        from: istBoundary(fromParts.year, fromParts.monthIndex0, fromParts.day),
        // `to` is an inclusive calendar day from the caller's point of view —
        // the exclusive boundary this function returns is the day after it.
        to: istBoundary(toParts.year, toParts.monthIndex0, toParts.day + 1),
      };
    }
    default:
      throw Errors.badRequest(`Unknown date range preset "${preset}"`);
  }
}

/* -------------------------------------------------------------------------- */
/* Revenue / analytics queries                                                 */
/* -------------------------------------------------------------------------- */

/** Sum + count of paid orders within `range` (by `paidAt`). Generic form of billing.repo.ts's `sumPaidOrdersToday`. */
export async function sumPaidOrdersBetween(
  range: DateRange,
): Promise<{ totalPaise: number; count: number }> {
  const [res] = await db
    .select({ total: sql<number>`coalesce(sum(${orders.finalAmountPaise}), 0)`, count: count() })
    .from(orders)
    .where(and(eq(orders.status, 'paid'), gte(orders.paidAt, range.from), lt(orders.paidAt, range.to)));
  return { totalPaise: Number(res?.total ?? 0), count: res?.count ?? 0 };
}

/** Paid-order revenue bucketed by day/week/month (IST-anchored bucketing, ascending). */
export async function revenueTimeSeries(
  range: DateRange,
  bucket: 'day' | 'week' | 'month',
): Promise<{ bucketStart: string; totalPaise: number; count: number }[]> {
  const bucketExpr = sql<string>`date_trunc(${bucket}, ${orders.paidAt} at time zone 'Asia/Kolkata')`;
  const rows = await db
    .select({
      bucketStart: bucketExpr,
      totalPaise: sql<number>`coalesce(sum(${orders.finalAmountPaise}), 0)`,
      count: count(),
    })
    .from(orders)
    .where(and(eq(orders.status, 'paid'), gte(orders.paidAt, range.from), lt(orders.paidAt, range.to)))
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);
  return rows.map((row) => ({
    bucketStart: String(row.bucketStart),
    totalPaise: Number(row.totalPaise),
    count: row.count,
  }));
}

/** Wallet-transaction debits within `range` (by `createdAt`), grouped by the reason prefix up to the first `:` (or the whole reason if there is none). */
export async function spendByFeature(
  range: DateRange,
): Promise<{ reasonPrefix: string; totalPaise: number; count: number }[]> {
  const prefixExpr = sql<string>`split_part(${walletTransactions.reason}, ':', 1)`;
  const rows = await db
    .select({
      reasonPrefix: prefixExpr,
      totalPaise: sql<number>`coalesce(sum(-${walletTransactions.delta}), 0)`,
      count: count(),
    })
    .from(walletTransactions)
    .where(
      and(
        lt(walletTransactions.delta, 0),
        gte(walletTransactions.createdAt, range.from),
        lt(walletTransactions.createdAt, range.to),
      ),
    )
    .groupBy(prefixExpr)
    .orderBy(desc(sql`sum(-${walletTransactions.delta})`));
  return rows.map((row) => ({
    reasonPrefix: String(row.reasonPrefix),
    totalPaise: Number(row.totalPaise),
    count: row.count,
  }));
}

/**
 * `report_unlock:*` debits within `range` (by `createdAt`), grouped by
 * report key (the reason's 2nd `:`-delimited segment) — finer-grained than
 * `spendByFeature`, which would bucket every report under the single
 * `report_unlock` prefix. Powers `GET /v1/admin/reports`'s per-report
 * breakdown.
 */
export async function spendByReportKey(
  range: DateRange,
): Promise<{ reportKey: string; totalPaise: number; count: number }[]> {
  const reportKeyExpr = sql<string>`split_part(${walletTransactions.reason}, ':', 2)`;
  const rows = await db
    .select({
      reportKey: reportKeyExpr,
      totalPaise: sql<number>`coalesce(sum(-${walletTransactions.delta}), 0)`,
      count: count(),
    })
    .from(walletTransactions)
    .where(
      and(
        lt(walletTransactions.delta, 0),
        like(walletTransactions.reason, 'report_unlock:%'),
        gte(walletTransactions.createdAt, range.from),
        lt(walletTransactions.createdAt, range.to),
      ),
    )
    .groupBy(reportKeyExpr)
    .orderBy(desc(sql`sum(-${walletTransactions.delta})`));
  return rows.map((row) => ({
    reportKey: String(row.reportKey),
    totalPaise: Number(row.totalPaise),
    count: row.count,
  }));
}

/** Orders within `range` (by `createdAt`), grouped by status — the top-up funnel breakdown. */
export async function topUpFunnel(
  range: DateRange,
): Promise<{ status: string; count: number }[]> {
  const rows = await db
    .select({ status: orders.status, count: count() })
    .from(orders)
    .where(and(gte(orders.createdAt, range.from), lt(orders.createdAt, range.to)))
    .groupBy(orders.status);
  return rows.map((row) => ({ status: row.status, count: row.count }));
}

/** Distinct users with at least one paid order within `range` (by `paidAt`). */
export async function payingUserCount(range: DateRange): Promise<number> {
  const [res] = await db
    .select({ count: sql<number>`count(distinct ${orders.userId})` })
    .from(orders)
    .where(and(eq(orders.status, 'paid'), gte(orders.paidAt, range.from), lt(orders.paidAt, range.to)));
  return Number(res?.count ?? 0);
}

/* -------------------------------------------------------------------------- */
/* Audit log                                                                   */
/* -------------------------------------------------------------------------- */

/** Appends one row to the append-only admin_audit_log for every write (and, per the route spec, every read) made through /v1/admin/*. */
export async function logAdminAction(
  adminPhone: string,
  route: string,
  params: unknown,
): Promise<void> {
  await db.insert(adminAuditLog).values({
    adminPhone,
    route,
    params: params ?? null,
  });
}
