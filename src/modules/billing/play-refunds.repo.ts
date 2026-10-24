// =============================================================================
// Google Play refunds — the play_refunds table and the take-back itself
// =============================================================================
// See play-refunds.service.ts for when this runs. Every write that moves money
// or questions happens in one transaction guarded on the order still being
// `paid`, so the hourly check and Google's push notice can both see the same
// refund and only one of them takes anything back.

import { and, desc, eq, gte, inArray, isNotNull, like, lt, ne, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  orders,
  playRefunds,
  reports,
  users,
  walletTransactions,
  type NewPlayRefundRow,
  type OrderRow,
  type PlayRefundRow,
} from '../../db/schema.js';
import { consumeExpiringCredits } from '../users/users.repo.js';

/** The recharge bonus lands in the same transaction as the purchase; this window finds it. */
const BONUS_MATCH_WINDOW_MS = 60_000;

export async function findPlayRefundByKey(refundKey: string): Promise<PlayRefundRow | undefined> {
  const [row] = await db
    .select()
    .from(playRefunds)
    .where(eq(playRefunds.refundKey, refundKey))
    .limit(1);
  return row;
}

/** Inserts a refund once; a second sighting of the same Google order returns undefined. */
export async function insertPlayRefund(
  values: NewPlayRefundRow,
): Promise<PlayRefundRow | undefined> {
  const [row] = await db
    .insert(playRefunds)
    .values(values)
    .onConflictDoNothing({ target: playRefunds.refundKey })
    .returning();
  return row;
}

export async function updatePlayRefund(
  id: string,
  patch: Partial<NewPlayRefundRow>,
): Promise<void> {
  await db
    .update(playRefunds)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(playRefunds.id, id));
}

/** Refunds recorded while the switch was off, to take back once it is on for that user. */
export async function listRecordedPlayRefunds(): Promise<PlayRefundRow[]> {
  return db
    .select()
    .from(playRefunds)
    .where(and(eq(playRefunds.status, 'recorded'), isNotNull(playRefunds.userId)))
    .orderBy(playRefunds.createdAt);
}

/** How many of this user's purchases Google has refunded (Pass refunds included). */
export async function countPlayRefundsForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(playRefunds)
    .where(and(eq(playRefunds.userId, userId), ne(playRefunds.status, 'unmatched')));
  return row?.n ?? 0;
}

/** Our order for a Play purchase token (any status). */
export async function findOrderByPurchaseToken(token: string): Promise<OrderRow | undefined> {
  const [row] = await db
    .select()
    .from(orders)
    .where(eq(orders.gatewayPaymentId, token))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return row;
}

/** The recharge bonus a paid order actually got (0 before the 2026-10-17 offer). */
export async function bonusGrantedFor(order: OrderRow): Promise<number> {
  if (!order.paidAt) return 0;
  const from = new Date(order.paidAt.getTime() - BONUS_MATCH_WINDOW_MS);
  const to = new Date(order.paidAt.getTime() + BONUS_MATCH_WINDOW_MS);
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${walletTransactions.delta}), 0)::int` })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.userId, order.userId),
        eq(walletTransactions.reason, `recharge_bonus:${order.packId}`),
        gte(walletTransactions.createdAt, from),
        lt(walletTransactions.createdAt, to),
      ),
    );
  return row?.total ?? 0;
}

export interface ClawBackResult {
  walletBalancePaise: number;
  questionCredits: number;
  reportsLocked: number;
}

/**
 * Takes back what a refunded order gave: marks it `refunded`, removes the
 * wallet money (price plus bonus) or the pack's questions, even below zero,
 * and logs a `play_refund:<pack>` ledger row. When that leaves the wallet below
 * zero, the reports bought since the order was paid are closed until the debt
 * is paid. Undefined when the order is no longer `paid` (already taken back).
 */
export async function clawBackOrder(
  order: OrderRow,
  take: { walletPaise: number; questions: number },
): Promise<ClawBackResult | undefined> {
  return db.transaction(async (tx) => {
    const [refunded] = await tx
      .update(orders)
      .set({ status: 'refunded' })
      .where(and(eq(orders.id, order.id), eq(orders.status, 'paid')))
      .returning({ id: orders.id });
    if (!refunded) return undefined;

    const [user] = await tx
      .update(users)
      .set({
        walletBalancePaise: sql`${users.walletBalancePaise} - ${take.walletPaise}`,
        questionCredits: sql`${users.questionCredits} - ${take.questions}`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, order.userId))
      .returning({
        walletBalancePaise: users.walletBalancePaise,
        questionCredits: users.questionCredits,
      });
    if (!user) throw new Error('User not found while taking back a refunded order');

    if (take.walletPaise > 0) {
      await tx.insert(walletTransactions).values({
        userId: order.userId,
        delta: -take.walletPaise,
        reason: `play_refund:${order.packId}`,
        balanceAfter: user.walletBalancePaise,
      });
      // Expiring reward lots are part of the balance being taken: drain them so the
      // expiry sweep never takes the same money a second time.
      await consumeExpiringCredits(tx, order.userId, take.walletPaise);
    }

    let reportsLocked = 0;
    if (user.walletBalancePaise < 0 && order.paidAt) {
      // Which reports the refunded money paid for: every report bought from the wallet
      // after the order was paid. A preview bought later counts too (its row is older
      // but was updated by the purchase).
      const debits = await tx
        .select({ reason: walletTransactions.reason })
        .from(walletTransactions)
        .where(
          and(
            eq(walletTransactions.userId, order.userId),
            like(walletTransactions.reason, 'report_unlock:%'),
            lt(walletTransactions.delta, 0),
            gte(walletTransactions.createdAt, order.paidAt),
          ),
        );
      const keys = [...new Set(debits.map((d) => d.reason.split(':')[1]).filter(Boolean))];
      if (keys.length > 0) {
        const locked = await tx
          .update(reports)
          .set({ refundLockedAt: new Date() })
          .where(
            and(
              eq(reports.userId, order.userId),
              inArray(reports.reportKey, keys as string[]),
              eq(reports.isPreview, false),
              sql`${reports.pricePaidPaise} > 0`,
              gte(reports.updatedAt, order.paidAt),
            ),
          )
          .returning({ id: reports.id });
        reportsLocked = locked.length;
      }
    }

    return { ...user, reportsLocked };
  });
}

/**
 * What a user still owes from a refund, or null once nothing is (wallet and
 * questions back at zero or above) — in which case their refund-locked reports
 * are opened again here.
 */
export async function refundDebtOrRelease(
  userId: string,
): Promise<{ owedPaise: number; owedQuestions: number } | null> {
  const [user] = await db
    .select({ wallet: users.walletBalancePaise, questions: users.questionCredits })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (user && (user.wallet < 0 || user.questions < 0)) {
    return {
      owedPaise: Math.max(0, -user.wallet),
      owedQuestions: Math.max(0, -user.questions),
    };
  }
  await db
    .update(reports)
    .set({ refundLockedAt: null })
    .where(and(eq(reports.userId, userId), isNotNull(reports.refundLockedAt)));
  return null;
}

export async function setPurchasesBlocked(userId: string, blocked: boolean): Promise<void> {
  await db
    .update(users)
    .set({ purchasesBlockedAt: blocked ? new Date() : null, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

export interface PlayRefundListRow extends PlayRefundRow {
  userName: string | null;
  walletBalancePaise: number | null;
  purchasesBlocked: boolean;
}

/** Admin list, newest refund first, with who it was and where their wallet stands now. */
export async function listPlayRefunds(limit: number, offset: number): Promise<PlayRefundListRow[]> {
  const rows = await db
    .select({
      refund: playRefunds,
      userName: users.displayName,
      walletBalancePaise: users.walletBalancePaise,
      purchasesBlockedAt: users.purchasesBlockedAt,
    })
    .from(playRefunds)
    .leftJoin(users, eq(users.id, playRefunds.userId))
    .orderBy(desc(sql`coalesce(${playRefunds.voidedAt}, ${playRefunds.createdAt})`))
    .limit(limit)
    .offset(offset);
  return rows.map((r) => ({
    ...r.refund,
    userName: r.userName,
    walletBalancePaise: r.walletBalancePaise,
    purchasesBlocked: r.purchasesBlockedAt !== null,
  }));
}

export async function countPlayRefunds(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(playRefunds);
  return row?.n ?? 0;
}
