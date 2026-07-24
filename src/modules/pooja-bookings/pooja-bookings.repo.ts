// =============================================================================
// Pooja-bookings repo — the concierge pilot's booking primitives. Wallet
// debit-at-request and refund-on-cancel both follow the exact atomic
// transaction shape already proven in prime-reports.repo.ts#unlockPrimeReport
// (conditional balance-guarded UPDATE + walletTransactions ledger insert +
// row write, all in one db.transaction). assignPanditToBooking /
// completePoojaBooking use the same "conditional UPDATE as a claim" idea as
// prime-reports.repo.ts#claimPrimeReportGeneration: the WHERE clause itself
// is the concurrency guard, so two racing admin actions on the same booking
// can never both succeed.
// =============================================================================

import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  poojaCatalog,
  poojaBookings,
  users,
  walletTransactions,
  type PoojaCatalogRow,
  type PoojaBookingRow,
} from '../../db/schema.js';

export async function listActivePoojas(): Promise<PoojaCatalogRow[]> {
  return db.select().from(poojaCatalog).where(eq(poojaCatalog.isActive, true));
}

export async function findPoojaCatalogItem(poojaId: string): Promise<PoojaCatalogRow | undefined> {
  const rows = await db.select().from(poojaCatalog).where(eq(poojaCatalog.id, poojaId)).limit(1);
  return rows[0];
}

export interface CreatePoojaBookingInput {
  userId: string;
  birthProfileId: string | null;
  poojaId: string;
  preferredDate: string;
  shipAddress: string;
  shipPincode: string;
  notes: string | null;
  pricePaise: number;
}

/**
 * Atomically debits `pricePaise` from the wallet AND creates the booking row
 * (status 'requested') in one transaction — same balance-guarded-UPDATE +
 * ledger-insert + row-insert shape as unlockPrimeReport
 * (prime-reports.repo.ts), minus the pre-existence check (a user CAN book
 * the same pooja more than once — there is no uniqueness constraint on
 * pooja_bookings, unlike prime_reports). Returns undefined when the wallet
 * balance is insufficient; the whole transaction (charge + ledger row +
 * booking insert) rolls back before this resolves, so an insufficient-balance
 * attempt never partially charges.
 */
export async function createPoojaBooking(
  input: CreatePoojaBookingInput,
): Promise<PoojaBookingRow | undefined> {
  return db.transaction(async (tx) => {
    const [charged] = await tx
      .update(users)
      .set({ walletBalancePaise: sql`${users.walletBalancePaise} - ${input.pricePaise}` })
      .where(and(eq(users.id, input.userId), gte(users.walletBalancePaise, input.pricePaise)))
      .returning({ walletBalancePaise: users.walletBalancePaise });
    if (!charged) return undefined;

    await tx.insert(walletTransactions).values({
      userId: input.userId,
      delta: -input.pricePaise,
      reason: `pooja_booking:${input.poojaId}`,
      balanceAfter: charged.walletBalancePaise,
    });

    const [row] = await tx
      .insert(poojaBookings)
      .values({
        userId: input.userId,
        birthProfileId: input.birthProfileId,
        poojaId: input.poojaId,
        panditId: null,
        preferredDate: input.preferredDate,
        shipAddress: input.shipAddress,
        shipPincode: input.shipPincode,
        status: 'requested',
        pricePaisePaid: input.pricePaise,
        requestedAt: new Date(),
        notes: input.notes,
      })
      .returning();
    return row;
  });
}

/**
 * Atomically refunds a booking that is still `requested` or `assigned`:
 * flips it to `refunded`, credits `pricePaisePaid` back to the wallet, and
 * writes a POSITIVE-delta walletTransactions ledger row (a credit negates
 * the original booking charge's negative delta — same sign convention as
 * users.repo.ts#addWalletBalance). The booking's status UPDATE is issued
 * FIRST and doubles as the concurrency guard: its WHERE clause only matches
 * rows currently in ('requested', 'assigned'), so if two refund attempts
 * race (e.g. a double-tap on cancel), Postgres serializes them on the row
 * lock — the first commits the status flip, the second's WHERE no longer
 * matches (status is already 'refunded') and it returns zero rows, so the
 * wallet can never be credited twice for the same booking.
 *
 * `userId` scopes the refund to a specific owner (the customer-initiated
 * cancel route). Returns undefined if the booking doesn't exist, isn't owned
 * by `userId`, or is no longer in a refundable status.
 */
export async function refundPoojaBooking(
  bookingId: string,
  userId: string,
): Promise<PoojaBookingRow | undefined> {
  return db.transaction(async (tx) => {
    const [refunded] = await tx
      .update(poojaBookings)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(
        and(
          eq(poojaBookings.id, bookingId),
          eq(poojaBookings.userId, userId),
          inArray(poojaBookings.status, ['requested', 'assigned']),
        ),
      )
      .returning();
    if (!refunded) return undefined;

    const [credited] = await tx
      .update(users)
      .set({
        walletBalancePaise: sql`${users.walletBalancePaise} + ${refunded.pricePaisePaid}`,
      })
      .where(eq(users.id, refunded.userId))
      .returning({ walletBalancePaise: users.walletBalancePaise });
    if (!credited) {
      throw new Error(
        `refundPoojaBooking: user ${refunded.userId} not found while crediting refund for booking ${bookingId}`,
      );
    }

    await tx.insert(walletTransactions).values({
      userId: refunded.userId,
      delta: refunded.pricePaisePaid,
      reason: `pooja_booking_refund:${bookingId}`,
      balanceAfter: credited.walletBalancePaise,
    });

    return refunded;
  });
}

/**
 * Admin action: assigns a pandit to a booking still in `requested` status.
 * The WHERE clause's `status = 'requested'` check is itself the concurrency
 * guard (same "conditional UPDATE as a claim" idea as
 * prime-reports.repo.ts#claimPrimeReportGeneration) — returns undefined if
 * the booking has already been assigned, or was cancelled/refunded out from
 * under the admin since the previous state read.
 */
export async function assignPanditToBooking(
  bookingId: string,
  panditId: string,
): Promise<PoojaBookingRow | undefined> {
  const now = new Date();
  const [row] = await db
    .update(poojaBookings)
    .set({ panditId, status: 'assigned', assignedAt: now, updatedAt: now })
    .where(and(eq(poojaBookings.id, bookingId), eq(poojaBookings.status, 'requested')))
    .returning();
  return row;
}

/**
 * Admin action: manual completion acknowledgment — no automated fulfillment
 * tracking or video-proof requirement in this batch (a trust-the-admin/
 * ops-process step). Same conditional-UPDATE-as-claim guard, requiring
 * `status = 'assigned'`.
 */
export async function completePoojaBooking(
  bookingId: string,
): Promise<PoojaBookingRow | undefined> {
  const now = new Date();
  const [row] = await db
    .update(poojaBookings)
    .set({ status: 'completed', completedAt: now, updatedAt: now })
    .where(and(eq(poojaBookings.id, bookingId), eq(poojaBookings.status, 'assigned')))
    .returning();
  return row;
}

export async function findOwnedPoojaBooking(
  bookingId: string,
  userId: string,
): Promise<PoojaBookingRow | undefined> {
  const rows = await db
    .select()
    .from(poojaBookings)
    .where(and(eq(poojaBookings.id, bookingId), eq(poojaBookings.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function listPoojaBookingsForUser(userId: string): Promise<PoojaBookingRow[]> {
  return db
    .select()
    .from(poojaBookings)
    .where(eq(poojaBookings.userId, userId))
    .orderBy(desc(poojaBookings.createdAt));
}

/**
 * Newest-first list of a pandit's assigned/completed/cancelled bookings —
 * powers the `kind === 'pandit'` branch of the shared
 * GET /v1/provider/bookings route (src/modules/providers/provider.service.ts,
 * built by the Astrologer Marketplace Batch 1 plan). Same shape as
 * listPoojaBookingsForUser, just scoped by pandit_id instead of user_id.
 */
export async function listPoojaBookingsForPandit(panditId: string): Promise<PoojaBookingRow[]> {
  return db
    .select()
    .from(poojaBookings)
    .where(eq(poojaBookings.panditId, panditId))
    .orderBy(desc(poojaBookings.createdAt));
}

/**
 * Unscoped-by-owner lookup, used by the shared messaging service's `pooja`
 * branch (src/modules/messaging/messaging.service.ts, built by the
 * Astrologer Marketplace Batch 1 plan) to authorize a chat participant who
 * may be EITHER the booking's customer OR its assigned pandit — unlike
 * findOwnedPoojaBooking, which only ever checks one specific user_id.
 */
export async function findPoojaBookingById(
  bookingId: string,
): Promise<PoojaBookingRow | undefined> {
  const rows = await db
    .select()
    .from(poojaBookings)
    .where(eq(poojaBookings.id, bookingId))
    .limit(1);
  return rows[0];
}
