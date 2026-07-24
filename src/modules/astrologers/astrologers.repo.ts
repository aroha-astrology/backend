// =============================================================================
// Astrologers module repo — Batch 1 (foundation): admin-curated astrologer
// profiles + scheduled-callback booking requests, wallet-only payment, no
// live video/chat delivery mechanism yet (see astrologers.service.ts's file
// header for the full list of what's deferred to a later batch).
//
// requestAstrologerBooking() mirrors the atomic debit-then-insert transaction
// pattern from prime-reports.repo.ts#unlockPrimeReport (balance-guarded
// UPDATE + walletTransactions ledger insert + row insert, all in one Drizzle
// transaction) — EXCEPT bookings are repeatable (a customer can book the
// same astrologer more than once), so there is no "already exists" dedupe
// check and no unique-violation race to catch on the final INSERT.
//
// refundBooking() is a genuinely NEW primitive — prime_reports has no refund
// path at all (unlocked reports never refund). It is race-safe via a
// compare-and-swap on the booking's own status column (the UPDATE's
// `WHERE status = 'requested'` IS the fence — see its own doc comment).
// =============================================================================

import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  astrologerBookings,
  astrologers,
  users,
  walletTransactions,
  type AstrologerBookingRow,
  type AstrologerRow,
  type NewAstrologerRow,
} from '../../db/schema.js';

export async function listBookableAstrologers(): Promise<AstrologerRow[]> {
  return db
    .select()
    .from(astrologers)
    .where(and(eq(astrologers.verified, true), eq(astrologers.active, true)))
    .orderBy(desc(astrologers.createdAt));
}

export async function findAstrologerById(id: string): Promise<AstrologerRow | undefined> {
  const rows = await db.select().from(astrologers).where(eq(astrologers.id, id)).limit(1);
  return rows[0];
}

export async function insertAstrologer(patch: NewAstrologerRow): Promise<AstrologerRow> {
  const [row] = await db.insert(astrologers).values(patch).returning();
  return row!;
}

// Prefixed with `_` solely to satisfy eslint's no-unused-vars (this array is
// only ever referenced in a type position below, via `typeof`, which eslint's
// static usage check doesn't recognize as a "use") — see varsIgnorePattern
// '^_' in eslint.config.js. A deviation from the plan's exact code (which
// left this unprefixed and did not survive `eslint --fix` in this repo).
const _ASTROLOGER_UPDATABLE_FIELDS = [
  'displayName',
  'bio',
  'specialties',
  'languages',
  'photoUrl',
  'ratePaisePerSession',
  'verified',
  'active',
] as const;

export type AstrologerUpdatePatch = Partial<
  Pick<NewAstrologerRow, (typeof _ASTROLOGER_UPDATABLE_FIELDS)[number]>
>;

export async function updateAstrologer(
  id: string,
  patch: AstrologerUpdatePatch,
): Promise<AstrologerRow | undefined> {
  const [row] = await db
    .update(astrologers)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(astrologers.id, id))
    .returning();
  return row;
}

/**
 * Atomically debits the customer's wallet AND creates the booking row (status
 * 'requested') in one transaction — mirrors unlockPrimeReport's pattern.
 * Re-reads the astrologer's CURRENT rate/verified/active state inside the
 * transaction (both to snapshot the exact price charged and to guard
 * against booking an astrologer an admin just deactivated) rather than
 * trusting a value resolved earlier by the caller.
 *
 * Returns:
 * - the new booking row on success
 * - 'not_bookable' if the astrologer doesn't exist, isn't verified, or isn't active
 * - 'insufficient_balance' if the wallet balance guard on the UPDATE fails
 *   (same `WHERE walletBalancePaise >= price` guard as unlockPrimeReport —
 *   Postgres row-level locking on that UPDATE is what makes this safe against
 *   two concurrent booking requests double-spending the same balance).
 */
export async function requestAstrologerBooking(
  userId: string,
  astrologerId: string,
  birthProfileId: string | null,
  preferredTimeWindow: string,
  notes: string | null,
): Promise<AstrologerBookingRow | 'not_bookable' | 'insufficient_balance'> {
  return db.transaction(async (tx) => {
    const [astrologer] = await tx
      .select({
        ratePaisePerSession: astrologers.ratePaisePerSession,
        verified: astrologers.verified,
        active: astrologers.active,
      })
      .from(astrologers)
      .where(eq(astrologers.id, astrologerId))
      .limit(1);
    if (!astrologer || !astrologer.verified || !astrologer.active) return 'not_bookable';

    const price = astrologer.ratePaisePerSession;

    const [charged] = await tx
      .update(users)
      .set({ walletBalancePaise: sql`${users.walletBalancePaise} - ${price}` })
      .where(and(eq(users.id, userId), gte(users.walletBalancePaise, price)))
      .returning({ walletBalancePaise: users.walletBalancePaise });
    if (!charged) return 'insufficient_balance';

    await tx.insert(walletTransactions).values({
      userId,
      delta: -price,
      reason: `astrologer_booking_request:${astrologerId}`,
      balanceAfter: charged.walletBalancePaise,
    });

    const [row] = await tx
      .insert(astrologerBookings)
      .values({
        userId,
        astrologerId,
        birthProfileId,
        preferredTimeWindow,
        status: 'requested',
        pricePaisePaid: price,
        notes,
      })
      .returning();
    return row!;
  });
}

/**
 * Cancels a REQUESTED booking and credits the customer's wallet back the
 * exact amount originally charged, recording a matching wallet_transactions
 * ledger row (delta = +pricePaisePaid — the exact negative of the original
 * debit's delta). A genuinely NEW primitive: prime_reports has no refund
 * path (unlocked reports never refund).
 *
 * Only callable while status is 'requested' — confirmed/completed bookings
 * do NOT auto-refund in this batch (known limitation, see
 * astrologers.service.ts's file header).
 *
 * Race-safe via a compare-and-swap on the booking row itself, NOT a
 * claim-token: the `WHERE status = 'requested'` clause on the booking
 * UPDATE IS the fence. Two concurrent cancel calls for the same booking
 * both enter this function, but Postgres serializes their row-level
 * UPDATEs on that row — only the first to commit actually flips the row to
 * 'refunded' and gets a `.returning()` row back; the second's UPDATE
 * matches zero rows (status is no longer 'requested' by the time its
 * UPDATE runs) and this function returns `undefined` for it WITHOUT
 * crediting the wallet a second time — the wallet credit + ledger insert
 * only run after the CAS above already succeeded, so a losing/no-op call
 * never touches the wallet at all.
 */
export async function refundBooking(
  bookingId: string,
  userId: string,
): Promise<AstrologerBookingRow | undefined> {
  return db.transaction(async (tx) => {
    const [cancelled] = await tx
      .update(astrologerBookings)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(
        and(
          eq(astrologerBookings.id, bookingId),
          eq(astrologerBookings.userId, userId),
          eq(astrologerBookings.status, 'requested'),
        ),
      )
      .returning();
    if (!cancelled) return undefined;

    const [credited] = await tx
      .update(users)
      .set({ walletBalancePaise: sql`${users.walletBalancePaise} + ${cancelled.pricePaisePaid}` })
      .where(eq(users.id, userId))
      .returning({ walletBalancePaise: users.walletBalancePaise });
    // astrologer_bookings.user_id is NOT NULL and FKs to users.id ON DELETE
    // CASCADE, so if the booking row above matched, its owning user row is
    // guaranteed to still exist — this branch is unreachable in practice,
    // guarded defensively rather than silently swallowed.
    if (!credited) {
      throw new Error(`refundBooking: user ${userId} not found mid-transaction`);
    }

    await tx.insert(walletTransactions).values({
      userId,
      delta: cancelled.pricePaisePaid,
      reason: `astrologer_booking_refund:${bookingId}`,
      balanceAfter: credited.walletBalancePaise,
    });

    return cancelled;
  });
}

/** Admin manually confirms a REQUESTED booking on the astrologer's behalf (no astrologer self-service portal in this batch). Scoped by current status so an already-confirmed/completed/cancelled/refunded/declined booking can't be re-confirmed. */
export async function confirmBooking(bookingId: string): Promise<AstrologerBookingRow | undefined> {
  const [row] = await db
    .update(astrologerBookings)
    .set({ status: 'confirmed', confirmedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(astrologerBookings.id, bookingId), eq(astrologerBookings.status, 'requested')))
    .returning();
  return row;
}

/** Admin manually marks a CONFIRMED booking complete — the acknowledgment that the off-platform consultation happened, since there is no automated call-completion signal without live telephony/video infra. Scoped by current status, same reasoning as confirmBooking. */
export async function completeBooking(
  bookingId: string,
): Promise<AstrologerBookingRow | undefined> {
  const [row] = await db
    .update(astrologerBookings)
    .set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(astrologerBookings.id, bookingId), eq(astrologerBookings.status, 'confirmed')))
    .returning();
  return row;
}

export async function listBookingsForUser(userId: string): Promise<AstrologerBookingRow[]> {
  return db
    .select()
    .from(astrologerBookings)
    .where(eq(astrologerBookings.userId, userId))
    .orderBy(desc(astrologerBookings.createdAt));
}

export async function listBookingsForAstrologer(
  astrologerId: string,
): Promise<AstrologerBookingRow[]> {
  return db
    .select()
    .from(astrologerBookings)
    .where(eq(astrologerBookings.astrologerId, astrologerId))
    .orderBy(desc(astrologerBookings.createdAt));
}

export async function findOwnedBooking(
  bookingId: string,
  userId: string,
): Promise<AstrologerBookingRow | undefined> {
  const rows = await db
    .select()
    .from(astrologerBookings)
    .where(and(eq(astrologerBookings.id, bookingId), eq(astrologerBookings.userId, userId)))
    .limit(1);
  return rows[0];
}
