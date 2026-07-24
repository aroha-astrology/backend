import { and, asc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  bookingMessages,
  type BookingMessageRow,
  type NewBookingMessageRow,
} from '../../db/schema.js';

export async function createMessage(input: NewBookingMessageRow): Promise<BookingMessageRow> {
  const [row] = await db.insert(bookingMessages).values(input).returning();
  return row!;
}

export interface ListMessagesOptions {
  after?: Date;
}

/**
 * Oldest-first (chat transcript order). The SSE stream
 * (messaging.routes.ts) uses `options.after` to poll only for rows newer
 * than the last one it already sent.
 */
export async function listMessagesForBooking(
  bookingType: 'astrologer' | 'pooja',
  bookingId: string,
  options: ListMessagesOptions = {},
): Promise<BookingMessageRow[]> {
  const conditions = [
    eq(bookingMessages.bookingType, bookingType),
    eq(bookingMessages.bookingId, bookingId),
  ];
  if (options.after) {
    conditions.push(gt(bookingMessages.createdAt, options.after));
  }
  return db
    .select()
    .from(bookingMessages)
    .where(and(...conditions))
    .orderBy(asc(bookingMessages.createdAt));
}

/**
 * Marks every UNREAD message from the OTHER role as read — a customer
 * marking-read stamps the provider's messages (and vice versa), never their
 * own.
 */
export async function markMessagesRead(
  bookingType: 'astrologer' | 'pooja',
  bookingId: string,
  readerRole: 'customer' | 'provider',
): Promise<void> {
  const otherRole = readerRole === 'customer' ? 'provider' : 'customer';
  await db
    .update(bookingMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(bookingMessages.bookingType, bookingType),
        eq(bookingMessages.bookingId, bookingId),
        eq(bookingMessages.senderRole, otherRole),
        isNull(bookingMessages.readAt),
      ),
    );
}
