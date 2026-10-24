import {
  and,
  count as drizzleCount,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  not,
  or,
  sql,
} from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  notifications,
  orders,
  subscriptionPlans,
  userSubscriptions,
  users,
  walletTransactions,
  type UserRow,
  type UserSubscriptionRow,
} from '../../db/schema.js';
import { decryptField } from '../../lib/crypto/field-encryption.js';
import {
  entitlementForRow,
  GROUP_ENTITLEMENT,
  PASS_PERIOD_DAYS,
  PASS_PLAN_NAME,
  QUESTION_PACKS,
} from './pass.config.js';

/**
 * Where a Pass was bought: 'wallet' (from before the Pass went store-only), 'google_play', 'razorpay'
 * (a Razorpay Subscription on the website, money.razorpayPass) or 'app_store' (StoreKit on an iPhone,
 * money.storekit). The play_state / play_synced_at columns hold the store's own state for all three.
 */
export type PassSource = 'wallet' | 'google_play' | 'razorpay' | 'app_store';

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
  /** Questions already spent this period (a plan change carries them over). */
  questionsUsed?: number;
  playState?: string | null;
  latestOrderId?: string | null;
  playSyncedAt?: Date | null;
}): Promise<UserSubscriptionRow> {
  const [row] = await db
    .insert(userSubscriptions)
    .values({
      ...values,
      questionsUsed: values.questionsUsed ?? 0,
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
 * Spends one question from the active Pass's quota (its tier's), atomically.
 * False when there's no active Pass or its quota is used up.
 */
export async function consumePassQuestion(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const pass = await findActivePass(userId, now);
  if (!pass) return false;
  const rows = await db
    .update(userSubscriptions)
    .set({ questionsUsed: sql`${userSubscriptions.questionsUsed} + 1`, updatedAt: now })
    .where(
      and(
        eq(userSubscriptions.id, pass.id),
        eq(userSubscriptions.status, 'active'),
        gt(userSubscriptions.periodEnd, now),
        lt(userSubscriptions.questionsUsed, entitlementForRow(pass).questions),
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

const PERIOD_MS = PASS_PERIOD_DAYS * 24 * 60 * 60 * 1000;

/** An admin-group member's questions left this period: the full allowance once it lapses. */
export function groupQuestionsLeft(
  user: Pick<UserRow, 'groupQuestionsUsed' | 'groupQuestionsPeriodStart'>,
  now: Date = new Date(),
): number {
  const start = user.groupQuestionsPeriodStart;
  if (!start || start.getTime() <= now.getTime() - PERIOD_MS) return GROUP_ENTITLEMENT.questions;
  return Math.max(0, GROUP_ENTITLEMENT.questions - user.groupQuestionsUsed);
}

/**
 * Counts one question against an admin-group member's free allowance, atomically.
 * A period that has lapsed (or never started) restarts at this question. False when
 * this period's allowance is used up; the member still pays nothing.
 */
export async function consumeGroupQuestion(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const cutoff = new Date(now.getTime() - PERIOD_MS).toISOString();
  const lapsed = sql`(${users.groupQuestionsPeriodStart} is null or ${users.groupQuestionsPeriodStart} <= ${cutoff}::timestamptz)`;
  const rows = await db
    .update(users)
    .set({
      groupQuestionsUsed: sql`case when ${lapsed} then 1 else ${users.groupQuestionsUsed} + 1 end`,
      groupQuestionsPeriodStart: sql`case when ${lapsed} then ${now.toISOString()}::timestamptz else ${users.groupQuestionsPeriodStart} end`,
    })
    .where(
      and(
        eq(users.id, userId),
        or(lapsed, lt(users.groupQuestionsUsed, GROUP_ENTITLEMENT.questions)),
      ),
    )
    .returning({ id: users.id });
  return rows.length > 0;
}

export async function refundGroupQuestion(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ groupQuestionsUsed: sql`greatest(${users.groupQuestionsUsed} - 1, 0)` })
    .where(eq(users.id, userId));
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
        // Wallet auto-renewals are the cron's to try first.
        sql`not (${userSubscriptions.source} = 'wallet' and ${userSubscriptions.autoRenew})`,
        // A Play Pass ends only when Google says so (reconcilePlayPasses asks): ending it here
        // on the date alone would cut off someone whose renewal notice is late or lost. Until
        // then an out-of-date row gives nothing anyway, since findActivePass checks periodEnd.
        // The same goes for a Razorpay or App Store Pass (their reconciles ask those stores).
        not(inArray(userSubscriptions.source, ['google_play', 'razorpay', 'app_store'])),
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
    Pick<
      UserSubscriptionRow,
      | 'status'
      | 'autoRenew'
      | 'periodEnd'
      | 'expiresAt'
      | 'cancelledAt'
      | 'playState'
      | 'latestOrderId'
      | 'playSyncedAt'
    >
  >,
): Promise<void> {
  await db
    .update(userSubscriptions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(userSubscriptions.id, id));
}

const PLAY_STATE_GRACE = 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD';
const PLAY_STATE_HOLD = 'SUBSCRIPTION_STATE_ON_HOLD';
const PLAY_STATE_PAUSED = 'SUBSCRIPTION_STATE_PAUSED';
/** How long after its end a Play Pass is still worth asking Google about (the longest account hold is 60 days). */
const PLAY_WATCH_DAYS = 65;

/**
 * Play Passes the hourly reconcile asks Google about: still marked active and at (or within
 * an hour of) their end, or in a grace period, on hold or paused — and not checked in the last
 * 50 minutes. Oldest check first.
 */
export async function listPlayPassesToReconcile(
  now: Date,
  limit: number,
): Promise<UserSubscriptionRow[]> {
  const soon = new Date(now.getTime() + 60 * 60_000);
  const watchFrom = new Date(now.getTime() - PLAY_WATCH_DAYS * 86_400_000);
  const checkedBefore = new Date(now.getTime() - 50 * 60_000);
  return db
    .select()
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.source, 'google_play'),
        or(
          and(
            eq(userSubscriptions.status, 'active'),
            lte(userSubscriptions.periodEnd, soon),
            gt(userSubscriptions.periodEnd, watchFrom),
          ),
          and(
            inArray(userSubscriptions.playState, [
              PLAY_STATE_GRACE,
              PLAY_STATE_HOLD,
              PLAY_STATE_PAUSED,
            ]),
            gt(userSubscriptions.updatedAt, watchFrom),
          ),
        ),
        or(
          isNull(userSubscriptions.playSyncedAt),
          lt(userSubscriptions.playSyncedAt, checkedBefore),
        ),
      ),
    )
    .orderBy(sql`${userSubscriptions.playSyncedAt} asc nulls first`)
    .limit(limit);
}

/**
 * The user's Play Pass that has reached its end while still marked active and hasn't been
 * checked with Google since `checkedBefore` (the on-demand check's work), if any.
 */
export async function findLapsedPlayPass(
  userId: string,
  now: Date,
  checkedBefore: Date,
): Promise<UserSubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.source, 'google_play'),
        eq(userSubscriptions.status, 'active'),
        lte(userSubscriptions.periodEnd, now),
        gt(userSubscriptions.periodEnd, new Date(now.getTime() - PLAY_WATCH_DAYS * 86_400_000)),
        or(
          isNull(userSubscriptions.playSyncedAt),
          lt(userSubscriptions.playSyncedAt, checkedBefore),
        ),
      ),
    )
    .orderBy(desc(userSubscriptions.periodEnd))
    .limit(1);
  return row ?? null;
}

/** The user's newest Play Pass row of any status (the one a payment problem would be on). */
export async function findLatestPlayPass(userId: string): Promise<UserSubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(userSubscriptions)
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.source, 'google_play')))
    .orderBy(desc(userSubscriptions.createdAt))
    .limit(1);
  return row ?? null;
}

/** The user's Play Passes Google may still charge for (account deletion cancels them). */
export async function listRenewingPlayPasses(userId: string): Promise<UserSubscriptionRow[]> {
  return db
    .select()
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.source, 'google_play'),
        eq(userSubscriptions.autoRenew, true),
        or(
          eq(userSubscriptions.status, 'active'),
          inArray(userSubscriptions.playState, [PLAY_STATE_HOLD, PLAY_STATE_PAUSED]),
        ),
      ),
    );
}

/** Every user who already has a notification of `type` (how a one-off send avoids a second copy). */
export async function listUserIdsNotified(type: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ userId: notifications.userId })
    .from(notifications)
    .where(eq(notifications.type, type));
  return new Set(rows.map((r) => r.userId));
}

/* -------------------------------------------------------------------------- */
/* Admin numbers                                                               */
/* -------------------------------------------------------------------------- */

export interface PassStats {
  active: { total: number; bySource: Record<string, number>; byVariant: Record<string, number> };
  /** Play Passes whose renewal payment failed: still working (grace) and stopped (on hold). */
  paymentIssues: { grace: number; onHold: number };
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

  const issues = await db
    .select({ state: userSubscriptions.playState, n: sql<number>`count(*)::int` })
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.source, 'google_play'),
        inArray(userSubscriptions.playState, [PLAY_STATE_GRACE, PLAY_STATE_HOLD]),
        gt(userSubscriptions.updatedAt, new Date(now.getTime() - PLAY_WATCH_DAYS * 86_400_000)),
      ),
    )
    .groupBy(userSubscriptions.playState);

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
  // Since 2026-10-23 packs are bought on Google Play: paid orders for a pack product.
  const [playPacks] = await db
    .select({
      n: sql<number>`count(*)::int`,
      paise: sql<number>`coalesce(sum(${orders.amountPaise}), 0)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.status, 'paid'),
        gte(orders.paidAt, since),
        inArray(
          orders.packId,
          QUESTION_PACKS.map((p) => p.playProductId),
        ),
      ),
    );

  return {
    active: { total: active.length, bySource, byVariant },
    paymentIssues: {
      grace: issues.find((r) => r.state === PLAY_STATE_GRACE)?.n ?? 0,
      onHold: issues.find((r) => r.state === PLAY_STATE_HOLD)?.n ?? 0,
    },
    walletRevenuePaise30d: pass?.paise ?? 0,
    started30d: started?.n ?? 0,
    endedOrCancelled30d: ended?.n ?? 0,
    packSales30d: {
      count: (pack?.n ?? 0) + (playPacks?.n ?? 0),
      revenuePaise: (pack?.paise ?? 0) + (playPacks?.paise ?? 0),
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Admin: paginated list of current pass subscribers                          */
/* -------------------------------------------------------------------------- */

export interface PassSubscriberRow {
  userId: string;
  displayName: string | null;
  phoneE164: string | null;
  tier: string | null;
  source: string;
  pricePaise: number;
  periodEnd: string;
  autoRenew: boolean;
  startedAt: string;
  /** Google's state for a Play Pass (grace period, ...); null otherwise. */
  playState: string | null;
}

export interface PassSubscribersPage {
  subscribers: PassSubscriberRow[];
  total: number;
  offset: number;
  limit: number;
}

export async function listPassSubscribers(
  limit: number,
  offset: number,
  now: Date = new Date(),
): Promise<PassSubscribersPage> {
  const where = and(eq(userSubscriptions.status, 'active'), gt(userSubscriptions.periodEnd, now));

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        userId: userSubscriptions.userId,
        displayName: users.displayName,
        phoneE164: users.phoneE164,
        tier: userSubscriptions.priceVariant,
        source: userSubscriptions.source,
        pricePaise: userSubscriptions.pricePaise,
        periodEnd: userSubscriptions.periodEnd,
        autoRenew: userSubscriptions.autoRenew,
        startedAt: userSubscriptions.periodStart,
        playState: userSubscriptions.playState,
      })
      .from(userSubscriptions)
      .innerJoin(users, eq(userSubscriptions.userId, users.id))
      .where(where)
      .orderBy(desc(userSubscriptions.periodEnd))
      .limit(limit)
      .offset(offset),
    db.select({ n: drizzleCount() }).from(userSubscriptions).where(where),
  ]);

  const subscribers = rows.map((r) => ({
    userId: r.userId,
    displayName: r.displayName,
    phoneE164: decryptField(r.phoneE164),
    tier: r.tier,
    source: r.source,
    pricePaise: r.pricePaise,
    periodEnd: r.periodEnd ? r.periodEnd.toISOString() : '',
    autoRenew: r.autoRenew,
    startedAt: r.startedAt ? r.startedAt.toISOString() : '',
    playState: r.playState,
  }));

  return { subscribers, total: Number(countRow?.n ?? 0), offset, limit };
}

// -----------------------------------------------------------------------------
// The Platinum Pass free report (money.platinumReport)
// -----------------------------------------------------------------------------

/**
 * Takes this period's free report: one conditional UPDATE, so two purchases at the same moment
 * cannot both get it. `at` is written as given (millisecond precision) so the exact value can be
 * matched again by `releasePassFreeReport`. True when it was taken.
 */
export async function claimPassFreeReport(
  userId: string,
  periodStart: Date,
  at: Date,
): Promise<boolean> {
  const [row] = await db
    .update(users)
    .set({ passFreeReportAt: at })
    .where(
      and(
        eq(users.id, userId),
        or(isNull(users.passFreeReportAt), lt(users.passFreeReportAt, periodStart)),
      ),
    )
    .returning({ id: users.id });
  return Boolean(row);
}

/** Gives the free report back (the report it paid for failed), only if it is still that claim. */
export async function releasePassFreeReport(userId: string, at: Date): Promise<boolean> {
  const [row] = await db
    .update(users)
    .set({ passFreeReportAt: null })
    .where(and(eq(users.id, userId), eq(users.passFreeReportAt, at)))
    .returning({ id: users.id });
  return Boolean(row);
}

// -----------------------------------------------------------------------------
// Store Passes other than Google Play: Razorpay (web) and the App Store (iPhone)
// -----------------------------------------------------------------------------

/** Store fields a Razorpay or App Store sync writes (status, period, renewal, the store's state). */
export async function updateStorePass(
  id: string,
  values: Partial<
    Pick<
      UserSubscriptionRow,
      | 'status'
      | 'autoRenew'
      | 'periodEnd'
      | 'expiresAt'
      | 'cancelledAt'
      | 'playState'
      | 'latestOrderId'
      | 'playSyncedAt'
      | 'priceVariant'
      | 'pricePaise'
    >
  >,
): Promise<void> {
  await db
    .update(userSubscriptions)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(userSubscriptions.id, id));
}

/**
 * The user's store Pass of `source` that has just reached its end and was not checked with the
 * store since `checkedBefore` (the on-demand check when a renewal notice is late).
 */
export async function findLapsedStorePass(
  userId: string,
  source: 'razorpay' | 'app_store',
  now: Date,
  checkedBefore: Date,
  watchDays: number,
): Promise<UserSubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.userId, userId),
        eq(userSubscriptions.source, source),
        eq(userSubscriptions.status, 'active'),
        lte(userSubscriptions.periodEnd, now),
        gt(userSubscriptions.periodEnd, new Date(now.getTime() - watchDays * 86_400_000)),
        or(
          isNull(userSubscriptions.playSyncedAt),
          lt(userSubscriptions.playSyncedAt, checkedBefore),
        ),
      ),
    )
    .orderBy(desc(userSubscriptions.periodEnd))
    .limit(1);
  return row ?? null;
}

/**
 * Active store Passes of `source` ending before `endsBefore` (the hourly reconcile: anything
 * about to renew, or past its end within the watch window).
 */
export async function listStorePassesToReconcile(
  source: 'razorpay' | 'app_store',
  endsBefore: Date,
  endedAfter: Date,
  limit = 200,
): Promise<UserSubscriptionRow[]> {
  return db
    .select()
    .from(userSubscriptions)
    .where(
      and(
        eq(userSubscriptions.source, source),
        eq(userSubscriptions.status, 'active'),
        lte(userSubscriptions.periodEnd, endsBefore),
        gt(userSubscriptions.periodEnd, endedAfter),
      ),
    )
    .orderBy(userSubscriptions.periodEnd)
    .limit(limit);
}
