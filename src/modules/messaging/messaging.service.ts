// =============================================================================
// Messaging module service — Batch 1 addition: shared, polymorphic booking
// chat between a customer and their assigned provider. `bookingType` is a
// discriminator switch (`'astrologer' | 'pooja'`) — the astrologer branch is
// fully implemented here; the pooja branch is a deliberate, localized
// early-return for the Pooja Booking Batch 1 plan (implemented right after
// this one) to extend — see resolveBookingParty below, which is the ONLY
// function that loads booking data differently per bookingType. sendMessage
// and listMessages themselves stay bookingType-agnostic and need no changes.
// assertCallerIsParty and notifyOtherParty DO need two small edits each (each
// currently hardcodes the literal 'astrologer' once) — see the Pooja Booking
// Batch 1 plan's Task 10, which replaces that literal with the resolved
// party's own providerKind rather than adding new bookingType-specific logic.
// =============================================================================

import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { sendPushBatch } from '../../lib/notifications/fcm.js';
import { findActiveTokensForUser } from '../device-tokens/device-tokens.repo.js';
import { findBookingById } from '../astrologers/astrologers.repo.js';
import { findProviderAccountByKindAndRefId } from '../providers/provider-accounts.repo.js';
import type { AstrologerBookingRow, BookingMessageRow } from '../../db/schema.js';
import { createMessage, listMessagesForBooking, markMessagesRead } from './messaging.repo.js';
import type { BookingMessageDto, BookingType } from './messaging.schemas.js';

export type Caller =
  | { role: 'customer'; userId: string }
  | {
      role: 'provider';
      providerId: string;
      providerKind: 'astrologer' | 'pandit';
      providerRefId: string;
    };

/** Narrows `bookingType` for callers — asserts, doesn't just check, so TypeScript propagates the narrowing to the caller's local variable. */
export function assertValidBookingType(bookingType: string): asserts bookingType is BookingType {
  if (bookingType !== 'astrologer' && bookingType !== 'pooja') {
    throw Errors.badRequest(`Invalid booking type: ${bookingType}`);
  }
}

interface ResolvedParty {
  booking: AstrologerBookingRow;
  customerUserId: string;
  providerRefId: string;
}

/**
 * Loads the underlying booking and resolves who its two chat participants
 * are, so callers can be authorized against it.
 *
 * `bookingType === 'pooja'` intentionally throws — this `if`/`throw` is the
 * exact extension point the Pooja Booking Batch 1 plan turns into a second
 * branch (loading from a pooja_bookings repo query instead). That plan's
 * Task 10 also makes two small follow-on edits elsewhere in this file
 * (assertCallerIsParty and notifyOtherParty each hardcode the literal
 * 'astrologer' once) — see that task for the exact diff.
 */
async function resolveBookingParty(
  bookingType: BookingType,
  bookingId: string,
): Promise<ResolvedParty> {
  if (bookingType === 'pooja') {
    throw Errors.badRequest('pooja booking chat not yet available');
  }
  const booking = await findBookingById(bookingId);
  if (!booking) throw Errors.notFound('Booking not found');
  return { booking, customerUserId: booking.userId, providerRefId: booking.astrologerId };
}

function assertCallerIsParty(caller: Caller, party: ResolvedParty): void {
  if (caller.role === 'customer') {
    if (party.customerUserId !== caller.userId) throw Errors.forbidden('Not your booking');
    return;
  }
  if (caller.providerKind !== 'astrologer' || party.providerRefId !== caller.providerRefId) {
    throw Errors.forbidden('Not your assigned booking');
  }
}

export function toMessageDto(row: BookingMessageRow): BookingMessageDto {
  return {
    id: row.id,
    bookingType: row.bookingType,
    bookingId: row.bookingId,
    senderRole: row.senderRole,
    body: row.body,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function sendMessage(
  caller: Caller,
  bookingType: string,
  bookingId: string,
  body: string,
): Promise<BookingMessageDto> {
  assertValidBookingType(bookingType);
  const party = await resolveBookingParty(bookingType, bookingId);
  assertCallerIsParty(caller, party);

  const row = await createMessage({
    bookingType,
    bookingId,
    senderRole: caller.role,
    senderUserId: caller.role === 'customer' ? caller.userId : null,
    senderProviderAccountId: caller.role === 'provider' ? caller.providerId : null,
    body,
  });

  void notifyOtherParty(caller, party).catch((err) => {
    logger.warn({ err, bookingType, bookingId }, 'messaging:notifyOtherParty failed');
  });

  return toMessageDto(row);
}

export async function listMessages(
  caller: Caller,
  bookingType: string,
  bookingId: string,
): Promise<BookingMessageDto[]> {
  assertValidBookingType(bookingType);
  const party = await resolveBookingParty(bookingType, bookingId);
  assertCallerIsParty(caller, party);

  const rows = await listMessagesForBooking(bookingType, bookingId);
  void markMessagesRead(bookingType, bookingId, caller.role).catch((err) => {
    logger.warn({ err, bookingType, bookingId }, 'messaging:markMessagesRead failed');
  });
  return rows.map(toMessageDto);
}

/**
 * Best-effort push on a new message to whichever party did NOT send it.
 *
 * If the recipient is the customer: a normal, reliable sendPushBatch call —
 * same as every other customer-facing notification in this codebase.
 *
 * If the recipient is the provider: ALSO attempted via sendPushBatch, but
 * this is explicitly best-effort and, in practice, always a no-op in this
 * batch — providers have no dedicated mobile app and no route to register a
 * device token yet, and device_push_tokens.userId is a NOT NULL FK to
 * users.id (a provider_accounts row is not a users row) — see this plan's
 * "Before you start". The SSE/poll stream (messaging.routes.ts) is the only
 * channel actually guaranteed to reach a provider, and only while their
 * portal tab is open. This is intentionally left as a documented "still
 * deferred" item, not silently assumed to work.
 */
async function notifyOtherParty(caller: Caller, party: ResolvedParty): Promise<void> {
  if (caller.role === 'customer') {
    const account = await findProviderAccountByKindAndRefId('astrologer', party.providerRefId);
    if (!account) return;
    const tokens = await findActiveTokensForUser(account.id);
    if (tokens.length === 0) return;
    await sendPushBatch(
      tokens.map((t) => t.token),
      '💬 New message from your customer',
      'You have a new message on a booking.',
      { type: 'booking_message', bookingId: party.booking.id },
    );
    return;
  }

  const tokens = await findActiveTokensForUser(party.customerUserId);
  if (tokens.length === 0) return;
  await sendPushBatch(
    tokens.map((t) => t.token),
    '💬 New message from your astrologer',
    'You have a new message on your booking.',
    { type: 'booking_message', bookingId: party.booking.id },
  );
}
