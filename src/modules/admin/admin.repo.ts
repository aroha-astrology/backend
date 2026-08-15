import { and, count, desc, eq, gte, like, lt, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { Errors } from '../../lib/errors.js';
import {
  orders,
  walletTransactions,
  adminAuditLog,
  aiUsage,
  chatSessions,
  voiceSessions,
  reports,
} from '../../db/schema.js';

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
/* Recurring users                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The four fixed weekly windows the "Recurring Users" admin card compares:
 * the current week-to-date, and each of the three preceding full weeks.
 * Weeks run Monday-Sunday, IST-anchored like every other boundary in this
 * module. Index 0 = this week, 1 = last week, 2 = last week+1, 3 = last week+2.
 */
export function recurringUserWeeks(now: Date = new Date()): DateRange[] {
  const { year, monthIndex0, day } = istPartsOf(now);
  // Day-of-week is a pure calendar property of (year, monthIndex0, day), so
  // reading it off a UTC-midnight Date for that same calendar date is safe
  // regardless of server-local timezone — same reasoning istBoundary already
  // relies on for date arithmetic. 0=Sun..6=Sat -> days-since-Monday.
  const dow = new Date(Date.UTC(year, monthIndex0, day)).getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  const thisWeekStartDay = day - daysSinceMonday;
  return [0, 1, 2, 3].map((weeksAgo) => ({
    from: istBoundary(year, monthIndex0, thisWeekStartDay - weeksAgo * 7),
    to: istBoundary(year, monthIndex0, thisWeekStartDay - weeksAgo * 7 + 7),
  }));
}

/**
 * "Active"/"recurring" have no dedicated tracking table — `users.lastActiveAt`
 * is a single field overwritten on every request, so it cannot answer "was
 * this user active in a past week" retroactively. Instead this unions every
 * table that already timestamps a real user action (AI calls, chat sessions,
 * voice sessions, orders, report generations) and treats "recurring" as
 * active in `range` AND active at least once before `range.from`.
 */
export async function recurringUsersForWeek(
  range: DateRange,
): Promise<{ activeCount: number; recurringCount: number }> {
  const result = await db.execute<{ activeCount: string; recurringCount: string }>(sql`
    WITH activity AS (
      SELECT user_id, created_at FROM ${aiUsage} WHERE user_id IS NOT NULL
      UNION ALL
      SELECT user_id, created_at FROM ${chatSessions}
      UNION ALL
      SELECT user_id, created_at FROM ${voiceSessions}
      UNION ALL
      SELECT user_id, created_at FROM ${orders}
      UNION ALL
      SELECT user_id, created_at FROM ${reports}
    )
    SELECT
      count(DISTINCT user_id) FILTER (
        WHERE created_at >= ${range.from} AND created_at < ${range.to}
      ) AS "activeCount",
      count(DISTINCT user_id) FILTER (
        WHERE created_at >= ${range.from} AND created_at < ${range.to}
        AND user_id IN (SELECT user_id FROM activity WHERE created_at < ${range.from})
      ) AS "recurringCount"
    FROM activity
  `);
  const row = result[0];
  return {
    activeCount: Number(row?.activeCount ?? 0),
    recurringCount: Number(row?.recurringCount ?? 0),
  };
}

/**
 * Approximate hours of engagement within `range`: chat session wall-clock
 * duration (updatedAt - createdAt) plus voice minutes actually charged.
 * Undercounts time spent reading reports/kundli/browsing, since nothing
 * timestamps the start/end of that today — see the two source tables' own
 * caveats (chatSessions.updatedAt drifts with any edit, not just messages;
 * voiceSessions.minutesCharged is billed minutes, not measured wall clock).
 */
export async function timeSpentHoursForWeek(range: DateRange): Promise<number> {
  const [chatRow] = await db
    .select({
      seconds: sql<number>`coalesce(sum(extract(epoch from (${chatSessions.updatedAt} - ${chatSessions.createdAt}))), 0)`,
    })
    .from(chatSessions)
    .where(and(gte(chatSessions.createdAt, range.from), lt(chatSessions.createdAt, range.to)));

  const [voiceRow] = await db
    .select({ minutes: sql<number>`coalesce(sum(${voiceSessions.minutesCharged}), 0)` })
    .from(voiceSessions)
    .where(and(gte(voiceSessions.createdAt, range.from), lt(voiceSessions.createdAt, range.to)));

  return Number(chatRow?.seconds ?? 0) / 3600 + Number(voiceRow?.minutes ?? 0) / 60;
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
    .where(
      and(eq(orders.status, 'paid'), gte(orders.paidAt, range.from), lt(orders.paidAt, range.to)),
    );
  return { totalPaise: Number(res?.total ?? 0), count: res?.count ?? 0 };
}

/** Paid-order revenue bucketed by day/week/month (IST-anchored bucketing, ascending). */
export async function revenueTimeSeries(
  range: DateRange,
  bucket: 'day' | 'week' | 'month',
): Promise<{ bucketStart: string; totalPaise: number; count: number }[]> {
  // `bucket` is bound as a query parameter (`${bucket}`) rather than inlined,
  // so Drizzle emits a fresh placeholder each time this SQL fragment object
  // is spliced into the query (select vs. groupBy vs. orderBy) — Postgres's
  // GROUP BY validation matches expressions by parse tree BEFORE parameter
  // binding, so three placeholders bound to the same runtime string still
  // read as three different expressions, and it rejects `orders.paid_at` as
  // "not in GROUP BY" even though the bucketed expression is identical every
  // time. `bucket` only ever comes from bucketForPreset() (one of exactly
  // three hardcoded literals, never user input), so sql.raw() here carries
  // no injection risk and sidesteps the parameter-identity mismatch entirely.
  const bucketExpr = sql<string>`date_trunc(${sql.raw(`'${bucket}'`)}, ${orders.paidAt} at time zone 'Asia/Kolkata')`;
  const rows = await db
    .select({
      bucketStart: bucketExpr,
      totalPaise: sql<number>`coalesce(sum(${orders.finalAmountPaise}), 0)`,
      count: count(),
    })
    .from(orders)
    .where(
      and(eq(orders.status, 'paid'), gte(orders.paidAt, range.from), lt(orders.paidAt, range.to)),
    )
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
export async function topUpFunnel(range: DateRange): Promise<{ status: string; count: number }[]> {
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
    .where(
      and(eq(orders.status, 'paid'), gte(orders.paidAt, range.from), lt(orders.paidAt, range.to)),
    );
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
