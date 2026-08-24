import { randomUUID } from 'node:crypto';
import { and, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  giftCampaigns,
  users,
  walletTransactions,
  type GiftCampaignRow,
  type NewGiftCampaignRow,
} from '../../db/schema.js';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** `_` + 8 hex chars makes a title-collision astronomically unlikely without a DB round-trip to check. */
export function generateCampaignKey(title: string): string {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
  return `${slugify(title)}_${suffix}`;
}

export interface CreateGiftCampaignRow {
  key: string;
  title: string;
  amountPaise: number;
  audienceMaxBalancePaise: number | null;
  deliveryMode: 'self_claim' | 'auto_credit';
  claimWindowDays: number | null;
  creditExpiryDays: number | null;
  scheduledSendAt: Date | null;
  status: 'draft' | 'scheduled';
  createdBy: string;
}

export async function insertGiftCampaign(input: CreateGiftCampaignRow): Promise<GiftCampaignRow> {
  const [row] = await db
    .insert(giftCampaigns)
    .values(input satisfies NewGiftCampaignRow)
    .returning();
  return row!;
}

export async function listGiftCampaigns(): Promise<GiftCampaignRow[]> {
  return db.select().from(giftCampaigns).orderBy(giftCampaigns.createdAt);
}

export async function getGiftCampaignById(id: string): Promise<GiftCampaignRow | undefined> {
  const [row] = await db.select().from(giftCampaigns).where(eq(giftCampaigns.id, id)).limit(1);
  return row;
}

export async function getGiftCampaignByKey(key: string): Promise<GiftCampaignRow | undefined> {
  const [row] = await db.select().from(giftCampaigns).where(eq(giftCampaigns.key, key)).limit(1);
  return row;
}

/** Returns true if a row was actually canceled (still draft/scheduled); false if already sent/canceled. */
export async function cancelGiftCampaignIfPending(id: string): Promise<boolean> {
  const rows = await db
    .update(giftCampaigns)
    .set({ status: 'canceled', updatedAt: new Date() })
    .where(and(eq(giftCampaigns.id, id), inArray(giftCampaigns.status, ['draft', 'scheduled'])))
    .returning({ id: giftCampaigns.id });
  return rows.length > 0;
}

/**
 * Atomically claims a draft/scheduled campaign for sending — the send fan-out (minutes of
 * wallet credits + push notifications) is bracketed by nothing else, so without this CAS a
 * double-clicked "Send Now" or a manual send racing the daily cron sweep (sweepDueCampaigns)
 * can both pass a separate status check and both fan out, blasting every recipient twice.
 * Same atomic-CAS shape as cancelGiftCampaignIfPending. Returns false if someone else already
 * claimed it — the caller must then do nothing at all (not even a partial re-send).
 */
export async function claimGiftCampaignForSend(
  id: string,
  fields: { sentAt: Date; validFrom: Date; validUntil: Date | null },
): Promise<boolean> {
  const rows = await db
    .update(giftCampaigns)
    .set({ status: 'sent', ...fields, updatedAt: new Date() })
    .where(and(eq(giftCampaigns.id, id), inArray(giftCampaigns.status, ['draft', 'scheduled'])))
    .returning({ id: giftCampaigns.id });
  return rows.length > 0;
}

/** Scheduled campaigns whose fire time has arrived — swept by the daily cron. */
export async function findDueScheduledCampaigns(now: Date): Promise<GiftCampaignRow[]> {
  return db
    .select()
    .from(giftCampaigns)
    .where(
      and(
        eq(giftCampaigns.status, 'scheduled'),
        lt(giftCampaigns.scheduledSendAt, now),
        isNull(giftCampaigns.sentAt),
      ),
    );
}

/** The one self-claim campaign currently in its send→validUntil window, if any (there should only ever be 0 or 1). */
export async function findLiveSelfClaimCampaign(now: Date): Promise<GiftCampaignRow | undefined> {
  const [row] = await db
    .select()
    .from(giftCampaigns)
    .where(
      and(
        eq(giftCampaigns.status, 'sent'),
        eq(giftCampaigns.deliveryMode, 'self_claim'),
        lt(giftCampaigns.validFrom, now),
        gt(giftCampaigns.validUntil, now),
      ),
    )
    .limit(1);
  return row;
}

export interface AudienceMember {
  userId: string;
  walletBalancePaise: number;
  locale: string | null;
  createdAt: Date;
}

/**
 * Every non-anonymized user, optionally capped to wallets strictly under
 * `maxBalancePaise` (null = everyone). Pushable-vs-total is computed by the
 * caller (gift-campaigns.service.ts) by cross-referencing
 * device-tokens.repo.ts's getAllActiveTokens() — kept out of this query so
 * the "what counts as an active token" definition lives in exactly one place.
 */
export async function resolveAudience(maxBalancePaise: number | null): Promise<AudienceMember[]> {
  return db
    .select({
      userId: users.id,
      walletBalancePaise: users.walletBalancePaise,
      locale: users.locale,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(
      maxBalancePaise !== null
        ? and(isNull(users.anonymizedAt), lt(users.walletBalancePaise, maxBalancePaise))
        : isNull(users.anonymizedAt),
    );
}

export interface DueExpiredGrant {
  id: string;
  userId: string;
  delta: number;
  reason: string;
  currentBalancePaise: number;
}

export async function findDueExpiredGrants(now: Date): Promise<DueExpiredGrant[]> {
  return db
    .select({
      id: walletTransactions.id,
      userId: walletTransactions.userId,
      delta: walletTransactions.delta,
      reason: walletTransactions.reason,
      currentBalancePaise: users.walletBalancePaise,
    })
    .from(walletTransactions)
    .innerJoin(users, eq(users.id, walletTransactions.userId))
    .where(and(lt(walletTransactions.expiresAt, now), isNull(walletTransactions.expiredAt)));
}

/**
 * Deducts `clawbackPaise` from the user's wallet, logs the reversal as its
 * own wallet_transactions row (reason = `${originalReason}_expired`), and
 * marks the original grant `expired_at` so the sweep never revisits it —
 * same lock-then-write shape as claimCampaignBonus, one transaction.
 */
export async function applyExpiryClawback(
  grantId: string,
  userId: string,
  clawbackPaise: number,
  reason: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ walletBalancePaise: sql`${users.walletBalancePaise} - ${clawbackPaise}` })
      .where(eq(users.id, userId))
      .returning({ walletBalancePaise: users.walletBalancePaise });
    if (!updated) return;

    await tx.insert(walletTransactions).values({
      userId,
      delta: -clawbackPaise,
      reason,
      balanceAfter: updated.walletBalancePaise,
    });
    await tx
      .update(walletTransactions)
      .set({ expiredAt: new Date() })
      .where(eq(walletTransactions.id, grantId));
  });
}

/** Nothing left to claw back (clawback computed as 0) — just stop the sweep from re-checking this grant. */
export async function markGrantExpired(grantId: string): Promise<void> {
  await db
    .update(walletTransactions)
    .set({ expiredAt: new Date() })
    .where(eq(walletTransactions.id, grantId));
}
