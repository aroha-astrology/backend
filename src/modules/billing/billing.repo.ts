import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  coupons,
  orders,
  users,
  creditTransactions,
  type CouponRow,
  type NewCouponRow,
  type OrderRow,
  type NewOrderRow,
} from '../../db/schema.js';

export async function findActiveCouponByCode(code: string): Promise<CouponRow | undefined> {
  const rows = await db
    .select()
    .from(coupons)
    .where(and(sql`upper(${coupons.code}) = upper(${code})`, eq(coupons.active, true)))
    .limit(1);
  return rows[0];
}

export async function listActiveCoupons(): Promise<CouponRow[]> {
  return db.select().from(coupons).where(eq(coupons.active, true)).orderBy(desc(coupons.createdAt));
}

export async function insertCoupon(values: NewCouponRow): Promise<CouponRow> {
  const [row] = await db.insert(coupons).values(values).returning();
  if (!row) throw new Error('Failed to insert coupon');
  return row;
}

export async function insertOrder(values: NewOrderRow): Promise<OrderRow> {
  const [row] = await db.insert(orders).values(values).returning();
  if (!row) throw new Error('Failed to insert order');
  return row;
}

export async function findOrderByIdForUser(
  id: string,
  userId: string,
): Promise<OrderRow | undefined> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, id), eq(orders.userId, userId)))
    .limit(1);
  return rows[0];
}

/** Most recent order (any status) for this user+pack — used to find the order a Google Play purchase belongs to without the client needing to remember an order ID. */
export async function findLatestOrderForPack(
  userId: string,
  packId: string,
): Promise<OrderRow | undefined> {
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.packId, packId)))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return rows[0];
}

/**
 * Marks a pending order paid, grants its credits, bumps the coupon's
 * redemption count, and appends a credit-ledger row — all atomically. Returns
 * undefined if the order wasn't found, didn't belong to the user, or was
 * already confirmed/cancelled (the `status = 'pending'` guard makes this
 * safe to call more than once, e.g. a retried gateway webhook later).
 */
export async function confirmOrderAndGrantCredits(
  orderId: string,
  userId: string,
  gatewayPaymentId: string,
): Promise<{ order: OrderRow; credits: number } | undefined> {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .update(orders)
      .set({ status: 'paid', paidAt: new Date(), gatewayPaymentId })
      .where(and(eq(orders.id, orderId), eq(orders.userId, userId), eq(orders.status, 'pending')))
      .returning();

    if (!order) return undefined;

    if (order.couponId) {
      await tx
        .update(coupons)
        .set({ redemptionCount: sql`${coupons.redemptionCount} + 1` })
        .where(eq(coupons.id, order.couponId));
    }

    const [userRow] = await tx
      .update(users)
      .set({ credits: sql`${users.credits} + ${order.credits}`, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ credits: users.credits });

    if (!userRow) throw new Error('User not found while granting purchased credits');

    await tx.insert(creditTransactions).values({
      userId,
      delta: order.credits,
      reason: `purchase:${order.packId}`,
      balanceAfter: userRow.credits,
    });

    return { order, credits: userRow.credits };
  });
}
