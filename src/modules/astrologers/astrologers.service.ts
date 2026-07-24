// =============================================================================
// Astrologers module service — Batch 1 (FOUNDATION): astrologer profiles +
// admin-curated roster + scheduled-callback booking request/confirm/complete,
// wallet-only payment (no astrologer payout automation).
//
// Explicitly deferred to a later batch (do not build here):
//   - Live video/audio/chat delivery of any kind. This batch only gets the
//     booking mechanics working end-to-end with a manual "admin marks it
//     done" completion step (adminCompleteBooking) — the actual consultation
//     happens by whatever off-platform means (e.g. a phone call the
//     astrologer makes directly), same as the old apps/api CRM-tool
//     astrologers already did.
//   - Astrologer self-onboarding (no signup/claim route — profiles are
//     admin-created only, see adminCreateAstrologer).
//   - Real-time availability/calendar slots — v1 uses a free-text
//     `preferredTimeWindow`, not bookable time slots.
//   - Astrologer payouts — a known gap; ops handles this manually outside
//     the app for now.
//   - Ratings/reviews.
//   - Auto-refund once a booking is confirmed/completed — refundBooking()
//     (astrologers.repo.ts) is only ever invoked while status is still
//     'requested'; a customer who wants to cancel an already-confirmed
//     session has no in-app path in this batch (known limitation).
// =============================================================================

import type { AstrologerBookingRow, AstrologerRow } from '../../db/schema.js';
import { getFirebaseAuth } from '../../config/firebase.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import { findActiveTokensForUser } from '../device-tokens/device-tokens.repo.js';
import type { ProfileContext } from '../birth-profiles/profile-context.js';
import {
  createProviderAccount,
  findProviderAccountByKindAndRefId,
} from '../providers/provider-accounts.repo.js';
import {
  confirmBooking,
  completeBooking,
  findAstrologerById,
  findOwnedBooking,
  insertAstrologer,
  listBookableAstrologers,
  listBookingsForUser,
  refundBooking,
  requestAstrologerBooking,
  updateAstrologer,
  type AstrologerUpdatePatch,
} from './astrologers.repo.js';
import type {
  AstrologerBookingDto,
  AstrologerDto,
  CreateAstrologerBody,
  CreateBookingBody,
  InviteAstrologerResponse,
  UpdateAstrologerBody,
} from './astrologers.schemas.js';

export function toAstrologerDto(row: AstrologerRow): AstrologerDto {
  return {
    id: row.id,
    displayName: row.displayName,
    bio: row.bio,
    specialties: row.specialties,
    languages: row.languages,
    photoUrl: row.photoUrl,
    ratePaisePerSession: row.ratePaisePerSession,
    verified: row.verified,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toBookingDto(row: AstrologerBookingRow): AstrologerBookingDto {
  return {
    id: row.id,
    userId: row.userId,
    astrologerId: row.astrologerId,
    birthProfileId: row.birthProfileId,
    preferredTimeWindow: row.preferredTimeWindow,
    status: row.status,
    pricePaisePaid: row.pricePaisePaid,
    requestedAt: row.requestedAt.toISOString(),
    confirmedAt: row.confirmedAt ? row.confirmedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listDirectory(): Promise<AstrologerRow[]> {
  return listBookableAstrologers();
}

export async function listMyBookings(userId: string): Promise<AstrologerBookingRow[]> {
  return listBookingsForUser(userId);
}

export type CreateBookingResult =
  | { outcome: 'created'; booking: AstrologerBookingRow }
  | { outcome: 'astrologer_not_found' }
  | { outcome: 'not_bookable_or_insufficient_balance' };

/**
 * Debits the customer's wallet upfront and creates the booking in
 * 'requested' status — mirrors how prime-reports charges upfront on unlock.
 * Looks the astrologer up first (a plain read, outside the debit
 * transaction) purely to tell "no such astrologer" (404) apart from "exists
 * but isn't bookable, or the wallet balance is too low" (409) — both of
 * those latter cases collapse into ONE outcome bucket here, same as
 * prime-reports.service.ts#unlockReport bundles "already unlocked" and
 * "insufficient balance" into one 409. There is a benign TOCTOU window
 * between this lookup and the repo transaction's own re-check — that's
 * fine, since the repo transaction re-validates verified/active/price
 * atomically anyway (see requestAstrologerBooking's doc comment); this
 * lookup exists only to pick the right HTTP status, not to guard the charge.
 */
export async function createBooking(
  userId: string,
  astrologerId: string,
  profile: ProfileContext,
  body: CreateBookingBody,
): Promise<CreateBookingResult> {
  const astrologer = await findAstrologerById(astrologerId);
  if (!astrologer) return { outcome: 'astrologer_not_found' };

  const result = await requestAstrologerBooking(
    userId,
    astrologerId,
    profile.birthProfileId,
    body.preferredTimeWindow,
    body.notes ?? null,
  );
  if (result === 'not_bookable' || result === 'insufficient_balance') {
    return { outcome: 'not_bookable_or_insufficient_balance' };
  }
  return { outcome: 'created', booking: result };
}

export type CancelBookingResult =
  | { outcome: 'refunded'; booking: AstrologerBookingRow }
  | { outcome: 'not_found' }
  | { outcome: 'not_cancellable' };

/**
 * Customer-initiated cancel. Pre-checks ownership + astrologer match +
 * current status (via findOwnedBooking) so the route can tell "no such
 * booking / not yours / wrong astrologer in the URL" (404) apart from
 * "exists but isn't in a cancellable state" (409) — the atomic
 * refundBooking() call itself only distinguishes success/failure, not WHY
 * it failed, so this pre-check is what supplies the 404 vs 409 split. A
 * benign race (status changes between the pre-check and the CAS inside
 * refundBooking) still resolves safely to 'not_cancellable' — see
 * refundBooking's own doc comment for why that's race-safe.
 */
export async function cancelBooking(
  astrologerId: string,
  bookingId: string,
  userId: string,
): Promise<CancelBookingResult> {
  const existing = await findOwnedBooking(bookingId, userId);
  if (!existing || existing.astrologerId !== astrologerId) return { outcome: 'not_found' };
  if (existing.status !== 'requested') return { outcome: 'not_cancellable' };

  const refunded = await refundBooking(bookingId, userId);
  if (!refunded) return { outcome: 'not_cancellable' };

  void notifyBookingStatus(userId, bookingId, 'refunded').catch(() => {
    /* already logged inside notifyBookingStatus */
  });
  return { outcome: 'refunded', booking: refunded };
}

export async function adminCreateAstrologer(body: CreateAstrologerBody): Promise<AstrologerRow> {
  return insertAstrologer({
    userId: body.userId ?? null,
    displayName: body.displayName,
    bio: body.bio ?? null,
    specialties: body.specialties ?? [],
    languages: body.languages ?? [],
    photoUrl: body.photoUrl ?? null,
    phone: body.phone ?? null,
    ratePaisePerSession: body.ratePaisePerSession,
    verified: body.verified ?? false,
    active: body.active ?? true,
  });
}

const ADMIN_UPDATE_FIELDS = [
  'displayName',
  'bio',
  'specialties',
  'languages',
  'photoUrl',
  'phone',
  'ratePaisePerSession',
  'verified',
  'active',
] as const;

function buildAstrologerPatch(body: UpdateAstrologerBody): AstrologerUpdatePatch {
  const out: AstrologerUpdatePatch = {};
  for (const key of ADMIN_UPDATE_FIELDS) {
    const value = (body as Record<string, unknown>)[key];
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/** userId is deliberately NOT patchable here — the linked account (if any) is set at creation time only in this batch. */
export async function adminUpdateAstrologer(
  id: string,
  body: UpdateAstrologerBody,
): Promise<AstrologerRow> {
  const row = await updateAstrologer(id, buildAstrologerPatch(body));
  if (!row) throw Errors.notFound('Astrologer not found');
  return row;
}

/**
 * Self-serve provider portal admin-invite flow (see requireProvider,
 * src/middleware/auth.ts). Phone+OTP login, exactly like customer login —
 * NOT email+password: there is no temporary password to generate or relay
 * off-platform. Reads the astrologer's own stored `phone` (set earlier via
 * the create/update admin routes) and creates BOTH a Firebase Auth user
 * (keyed on that phone number) and the linking provider_accounts row.
 */
export async function adminInviteAstrologer(
  astrologerId: string,
): Promise<InviteAstrologerResponse> {
  const astrologer = await findAstrologerById(astrologerId);
  if (!astrologer) throw Errors.notFound('Astrologer not found');

  if (!astrologer.phone) {
    throw Errors.badRequest(
      'This astrologer has no phone number on file — set one via the create/update admin routes before inviting.',
    );
  }

  const existing = await findProviderAccountByKindAndRefId('astrologer', astrologerId);
  if (existing) throw Errors.conflict('Astrologer has already been invited');

  const createdUser = await getFirebaseAuth().createUser({ phoneNumber: astrologer.phone });

  await createProviderAccount({
    kind: 'astrologer',
    refId: astrologerId,
    firebaseUid: createdUser.uid,
    displayName: astrologer.displayName,
  });

  return { phoneE164: astrologer.phone };
}

/** Admin manually confirms a REQUESTED booking on the astrologer's behalf — see this file's header for why (no astrologer self-service portal in this batch). */
export async function adminConfirmBooking(bookingId: string): Promise<AstrologerBookingRow> {
  const row = await confirmBooking(bookingId);
  if (!row) throw Errors.conflict('Booking is not in a confirmable state (must be "requested")');
  void notifyBookingStatus(row.userId, row.id, 'confirmed').catch(() => {
    /* already logged inside notifyBookingStatus */
  });
  return row;
}

/** Admin manually marks a CONFIRMED booking complete — the acknowledgment that the off-platform consultation happened (see this file's header — no automated call-completion signal without live telephony/video infra). */
export async function adminCompleteBooking(bookingId: string): Promise<AstrologerBookingRow> {
  const row = await completeBooking(bookingId);
  if (!row) throw Errors.conflict('Booking is not in a completable state (must be "confirmed")');
  void notifyBookingStatus(row.userId, row.id, 'completed').catch(() => {
    /* already logged inside notifyBookingStatus */
  });
  return row;
}

type BookingNotificationStatus = 'confirmed' | 'completed' | 'refunded';

const NOTIFICATION_COPY: Record<BookingNotificationStatus, { title: string; body: string }> = {
  confirmed: {
    title: '🔮 Your astrologer session is confirmed',
    body: 'Your astrologer has confirmed your booking — they will reach out to you at your preferred time.',
  },
  completed: {
    title: '✅ Your astrologer session is complete',
    body: 'Your consultation has been marked complete. We hope it was helpful!',
  },
  refunded: {
    title: '💰 Your booking was refunded',
    body: 'Your astrologer booking was cancelled and the amount has been credited back to your Aroha wallet.',
  },
};

/**
 * Best-effort push notification on a booking status transition. Follows the
 * same fire-and-forget, never-throws contract as `notifyPurchasePlanReady`
 * in purchase-plan.service.ts. Exported so it can be unit-tested in
 * isolation.
 */
export async function notifyBookingStatus(
  userId: string,
  bookingId: string,
  status: BookingNotificationStatus,
): Promise<void> {
  try {
    const tokens = await findActiveTokensForUser(userId);
    if (tokens.length === 0) return;
    const copy = NOTIFICATION_COPY[status];
    await sendPushBatch(
      tokens.map((t) => t.token),
      copy.title,
      copy.body,
      {
        type: 'astrologer_booking_status',
        bookingId,
        status,
        navigate: '/astrologers/bookings',
      },
    );
    logger.info({ userId, bookingId, status }, 'astrologer-booking:push sent');
  } catch (err) {
    logger.warn({ err, userId, bookingId, status }, 'astrologer-booking:push failed');
  }
}
