import { and, desc, eq, gt, gte, isNull, lte, not, or, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  subscriptionPlans,
  userSubscriptions,
  users,
  walletTransactions,
  type UserSubscriptionRow,
} from '../../db/schema.js';
import { PASS_PLAN_NAME, PASS_QUESTIONS_PER_PERIOD } from './pass.config.js';

export type PassSource = 'wallet' | 'google_play';

/** The seeded Aroha Pass plan's id (migration 0080), cached for the process. */
let planIdCache: string | null = null;
export async function passPlanId(): Promise<string> {
  if (planIdCache) return planIdCache;
  const [row] = await db
    .select({ id: subscriptionPlans.id })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.name, PASS_PLAN_NAME))
    .limit(1);
  if (row) {
    planIdCache = row.id;
    return row.id;
  }
  const [created] = await db
    .insert(subscriptionPlans)
    .values({ name: PASS_PLAN_NAME, monthlyPrice: 29900 })
    .returning({ id: subscriptionPlans.id });
  planIdCache = created!.id;
  return planIdCache;
}

/** The user's Pass whose current period hasn't ended, if any. */
export async function findActivePass(
  userId: string,
  now: Date = new Date(),
): Promise<UserSubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.status, 'active'),
        gt(userSubscriptions.periodEnd, now),
      ),
    )
    .orderBy(desc(userSubscriptions.periodEnd))
    .limit(1);
  return row ?? null;
}

/** The user's most recent Pass row of any status (for "renew" / history). */
export async function findLatestPass(userId: string): Promise<UserSubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.userId, userId))
    .orderBy(desc(userSubscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function insertPass(values: {
  userId: string;
  source: PassSource;
  externalId?: string | null;
  priceVariant: string | null;
  pricePaise: number;
  autoRenew: boolean;
  periodStart: Date;
  periodEnd: Date;
}): Promise<UserSubscriptionRow> {
  const [row] = await db
    .insert(userSubscriptions)
    .values({
      ...values,
      planId: await passPlanId(),
      status: 'active',
      startedAt: values.periodStart,
      expiresAt: values.periodEnd,
    })
    .returning();
  return row!;
}

/** Starts the next period on an existing row: new dates, fresh question quota. */
export async function renewPass(
  id: string,
  period: { start: Date; end: Date },
  pricePaise?: number,
): Promise<void> {
  await db
    .update(userSubscriptions)
    .set({
      status: 'active',
      periodStart: period.start,
      periodEnd: period.end,
      expiresAt: period.end,
      questionsUsed: 0,
      remindedAt: null,
      updatedAt: new Date(),
      ...(pricePaise !== undefined ? { pricePaise } : {}),
    })
    .where(eq(userSubscriptions.id, id));
}

export async function setPassAutoRenew(id: string, autoRenew: boolean): Promise<void> {
  await db
    .update(userSubscriptions)
    .set({ autoRenew, cancelledAt: autoRenew ? null : new Date(), updatedAt: new Date() })
    .where(eq(userSubscriptions.id, id));
}

export async function markPassReminded(id: string): Promise<void> {
  await db
    .update(userSubscriptions)
    .set({ remindedAt: new Date(), updatedAt: new Date() })
    .where(eq(userSubscriptions.id, id));
}

export async function expirePass(id: string): Promise<void> {
  await db
    .update(userSubscriptions)
    .set({ status: 'expired', updatedAt: new Date() })
    .where(eq(userSubscriptions.id, id));
}

/**
 * Spends one question from the active Pass's quota, atomically. False when
 * there's no active Pass or its quota is used up.
 */
export async function consumePassQuestion(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const rows = await db
    .update(userSubscriptions)
    .set({ questionsUsed: sql`${userSubscriptions.questionsUsed} + 1`, updatedAt: now })
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.status, 'active'),
        gt(userSubscriptions.periodEnd, now),
        sql`${userSubscriptions.questionsUsed} < ${PASS_QUESTIONS_PER_PERIOD}`,
      ),
    )
    .returning({ id: userSubscriptions.id });
  return rows.length > 0;
}

export async function refundPassQuestion(userId: string, now: Date = new Date()): Promise<void> {
  await db
    .update(userSubscriptions)
    .set({
      questionsUsed: sql`greatest(${userSubscriptions.questionsUsed} - 1, 0)`,
      updatedAt: now,
    })
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.status, 'active'),
        gt(userSubscriptions.periodEnd, now),
      ),
    );
}

/** Spends one prepaid question credit, atomically. False when there are none. */
export async function consumeQuestionCredit(userId: string): Promise<boolean> {
  const rows = await db
    .update(users)
    .set({ questionCredits: sql`${users.questionCredits} - 1` })
    .where(and(eq(users.id, userId), gt(users.questionCredits, 0)))
    .returning({ id: users.id });
  return rows.length > 0;
}

export async function addQuestionCredits(userId: string, count: number): Promise<number> {
  const [row] = await db
    .update(users)
    .set({ questionCredits: sql`${users.questionCredits} + ${count}` })
    .where(eq(users.id, userId))
    .returning({ questionCredits: users.questionCredits });
  return row?.questionCredits ?? 0;
}

/** Wallet Passes past their end with auto-renew on (the renewal cron's work list). */
export async function listWalletRenewalsDue(now: Date): Promise<UserSubscriptionRow[]> {
  return db
    .select()
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.source, 'wallet'),
        eq(userSubscriptions.status, 'active'),
        eq(userSubscriptions.autoRenew, true),
        lte(userSubscriptions.periodEnd, now),
      ),
    );
}

/** Active wallet Passes ending before `before` that haven't had this period's reminder. */
export async function listWalletRemindersDue(
  now: Date,
  before: Date,
): Promise<UserSubscriptionRow[]> {
  return db
    .select()
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.source, 'wallet'),
        eq(userSubscriptions.status, 'active'),
        gt(userSubscriptions.periodEnd, now),
        lte(userSubscriptions.periodEnd, before),
        isNull(userSubscriptions.remindedAt),
      ),
    );
}

/** Active rows whose period is over and that won't renew — expired now. Returns how many. */
export async function expireLapsedPasses(now: Date): Promise<number> {
  const rows = await db
    .update(userSubscriptions)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(userSubscriptions.status, 'active'),
        lte(userSubscriptions.periodEnd, now),
        // Wallet auto-renewals are the cron's to try first; Play renewals arrive by RTDN.
        sql`not (${userSubscriptions.source} = 'wallet' and ${userSubscriptions.autoRenew})`,
        // Column-bound so the Date is serialised; a bare Date in sql`` crashes postgres-js.
        not(
          and(
            eq(userSubscriptions.source, 'google_play'),
            gt(userSubscriptions.periodEnd, new Date(now.getTime() - 3 * 86_400_000)),
          )!,
        ),
      ),
    )
    .returning({ id: userSubscriptions.id });
  return rows.length;
}

export async function findPassByExternalId(
  externalId: string,
): Promise<UserSubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(userSubscriptions)
    .where(eq(userSubscriptions.externalId, externalId))
    .limit(1);
  return row ?? null;
}

export async function updatePlayPass(
  id: string,
  patch: Partial<
    Pick<UserSubscriptionRow, 'status' | 'autoRenew' | 'periodEnd' | 'expiresAt' | 'cancelledAt'>
  >,
): Promise<void> {
  await db
    .update(userSubscriptions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(userSubscriptions.id, id));
}

/* -------------------------------------------------------------------------- */
/* Admin numbers                                                               */
/* -------------------------------------------------------------------------- */

export interface PassStats {
  active: { total: number; bySource: Record<string, number>; byVariant: Record<string, number> };
  /** Rupees taken for Passes (wallet) in the last 30 days, in paise. */
  walletRevenuePaise30d: number;
  started30d: number;
  endedOrCancelled30d: number;
  packSales30d: { count: number; revenuePaise: number };
}

export async function passStats(now: Date = new Date()): Promise<PassStats> {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const active = await db
    .select({ source: userSubscriptions.source, variant: userSubscriptions.priceVariant })
    .from(userSubscriptions)
    .where(and(eq(userSubscriptions.status, 'active'), gt(userSubscriptions.periodEnd, now)));
  const bySource: Record<string, number> = {};
  const byVariant: Record<string, number> = {};
  for (const r of active) {
    bySource[r.source] = (bySource[r.source] ?? 0) + 1;
    const v = r.variant ?? 'none';
    byVariant[v] = (byVariant[v] ?? 0) + 1;
  }

  const [started] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userSubscriptions)
    .where(gte(userSubscriptions.createdAt, since));
  const [ended] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userSubscriptions)
    .where(
      or(
        gte(userSubscriptions.cancelledAt, since),
        and(eq(userSubscriptions.status, 'expired'), gte(userSubscriptions.updatedAt, since)),
      ),
    );

  const money = await db
    .select({
      kind: sql<string>`case when ${walletTransactions.reason} like 'question_pack:%' then 'pack' else 'pass' end`,
      n: sql<number>`count(*)::int`,
      paise: sql<number>`coalesce(sum(-${walletTransactions.delta}), 0)::int`,
    })
    .from(walletTransactions)
    .where(
      and(
        gte(walletTransactions.createdAt, since),
        sql`(${walletTransactions.reason} like 'question_pack:%' or ${walletTransactions.reason} like 'aroha_pass%')`,
      ),
    )
    .groupBy(sql`1`);
  const pass = money.find((m) => m.kind === 'pass');
  const pack = money.find((m) => m.kind === 'pack');

  return {
    active: { total: active.length, bySource, byVariant },
    walletRevenuePaise30d: pass?.paise ?? 0,
    started30d: started?.n ?? 0,
    endedOrCancelled30d: ended?.n ?? 0,
    packSales30d: { count: pack?.n ?? 0, revenuePaise: pack?.paise ?? 0 },
  };
}
