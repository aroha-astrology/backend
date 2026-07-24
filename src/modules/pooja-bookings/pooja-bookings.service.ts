// =============================================================================
// Pooja-bookings service — business logic on top of the repo layer: resolves
// the pooja catalog price at booking time (never trusts a client-supplied
// price), wires the customer-cancel route to refundPoojaBooking(), and fires
// a best-effort push notification on every status transition
// (assigned/completed/refunded). Notification sends follow the exact
// fire-and-forget-with-error-logging convention already used in
// prime-reports.service.ts (`void doThing().catch((err) => logger.error(...))`)
// — a failed push never fails the underlying booking action.
// =============================================================================

import { logger } from '../../lib/logger.js';
import { findActiveTokensForUser } from '../device-tokens/device-tokens.repo.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import {
  createPoojaBooking,
  refundPoojaBooking,
  assignPanditToBooking,
  completePoojaBooking,
  findPoojaCatalogItem,
  listPoojaBookingsForUser,
  listActivePoojas,
} from './pooja-bookings.repo.js';
import { findPanditById } from './pandits.repo.js';
import type { PoojaBookingRow, PoojaCatalogRow } from '../../db/schema.js';
import type { ProfileContext } from '../birth-profiles/profile-context.js';

async function notifyBookingStatus(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  const tokens = await findActiveTokensForUser(userId);
  if (tokens.length === 0) return;
  await sendPushBatch(
    tokens.map((t) => t.token),
    title,
    body,
    data,
  );
}

function fireNotify(
  userId: string,
  title: string,
  body: string,
  data: Record<string, string>,
): void {
  void notifyBookingStatus(userId, title, body, data).catch((err: unknown) => {
    logger.error({ err, userId }, 'pooja-bookings:push failed');
  });
}

export async function listCatalog(): Promise<PoojaCatalogRow[]> {
  return listActivePoojas();
}

export interface BookPoojaInput {
  poojaId: string;
  preferredDate: string;
  shipAddress: string;
  shipPincode: string;
  notes?: string | null;
}

export type BookPoojaResult =
  | { outcome: 'booked'; booking: PoojaBookingRow }
  | { outcome: 'unknown_pooja' }
  | { outcome: 'insufficient_balance' };

/**
 * Resolves the pooja's current price from the catalog at booking time (never
 * trusts a client-supplied price) and debits the wallet atomically via
 * createPoojaBooking.
 */
export async function bookPooja(
  userId: string,
  profile: ProfileContext,
  input: BookPoojaInput,
): Promise<BookPoojaResult> {
  const pooja = await findPoojaCatalogItem(input.poojaId);
  if (!pooja || !pooja.isActive) return { outcome: 'unknown_pooja' };

  const booking = await createPoojaBooking({
    userId,
    birthProfileId: profile.birthProfileId,
    poojaId: pooja.id,
    preferredDate: input.preferredDate,
    shipAddress: input.shipAddress,
    shipPincode: input.shipPincode,
    notes: input.notes ?? null,
    pricePaise: pooja.basePricePaise,
  });
  if (!booking) return { outcome: 'insufficient_balance' };
  return { outcome: 'booked', booking };
}

export async function cancelBooking(
  bookingId: string,
  userId: string,
): Promise<PoojaBookingRow | undefined> {
  const refunded = await refundPoojaBooking(bookingId, userId);
  if (refunded) {
    fireNotify(
      refunded.userId,
      'Pooja booking cancelled',
      'Your pooja booking was cancelled and the amount has been refunded to your wallet.',
      { type: 'pooja_booking_refunded', bookingId: refunded.id },
    );
  }
  return refunded;
}

export async function listMyBookings(userId: string): Promise<PoojaBookingRow[]> {
  return listPoojaBookingsForUser(userId);
}

export type AssignPanditResult = PoojaBookingRow | 'unknown_pandit' | undefined;

export async function adminAssignPandit(
  bookingId: string,
  panditId: string,
): Promise<AssignPanditResult> {
  const pandit = await findPanditById(panditId);
  if (!pandit || !pandit.active) return 'unknown_pandit';

  const updated = await assignPanditToBooking(bookingId, panditId);
  if (updated) {
    fireNotify(
      updated.userId,
      'Pandit assigned to your pooja',
      `${pandit.displayName} has been assigned to your upcoming pooja.`,
      { type: 'pooja_booking_assigned', bookingId: updated.id },
    );
  }
  return updated;
}

export async function adminCompleteBooking(
  bookingId: string,
): Promise<PoojaBookingRow | undefined> {
  const updated = await completePoojaBooking(bookingId);
  if (updated) {
    fireNotify(
      updated.userId,
      'Your pooja is complete',
      'Your booked pooja has been marked complete. Thank you!',
      { type: 'pooja_booking_completed', bookingId: updated.id },
    );
  }
  return updated;
}
