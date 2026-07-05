export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Resolve booking/delivery dates when only one is provided by the user.
 * - Both given: used as-is.
 * - Booking only: delivery = booking + 5 days.
 * - Delivery only: booking = delivery - 5 days, but never later than
 *   yesterday (a lone future delivery date shouldn't imply a future booking).
 * - Neither: throws — callers must validate at least one is present first.
 */
export function resolveDates(
  bookingDate: string | undefined,
  deliveryDate: string | undefined,
): { resolvedBookingDate: string; resolvedDeliveryDate: string } {
  if (!bookingDate && !deliveryDate) {
    throw new Error('At least one of bookingDate or deliveryDate is required');
  }
  if (bookingDate && deliveryDate) {
    return { resolvedBookingDate: bookingDate, resolvedDeliveryDate: deliveryDate };
  }
  if (bookingDate) {
    return { resolvedBookingDate: bookingDate, resolvedDeliveryDate: addDays(bookingDate, 5) };
  }
  const proposedBooking = addDays(deliveryDate as string, -5);
  const yesterday = addDays(todayIso(), -1);
  const resolvedBookingDate = proposedBooking < yesterday ? proposedBooking : yesterday;
  return { resolvedBookingDate, resolvedDeliveryDate: deliveryDate as string };
}
