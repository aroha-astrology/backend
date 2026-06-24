/**
 * Dhanam pricing for a puja booking.
 *
 * Members beyond the first cost +10 Dhanam each (1 ≈ Rs 10, 10 Dhanam ≈ Rs 100).
 */
export const DHANAM_PER_EXTRA_MEMBER = 10;
export const MAX_BOOKING_MEMBERS = 6;

export interface OfferingPick {
  id: string;
  dhanam_cost: number;
}

export interface PricingBreakdown {
  base: number;
  members: number;       // count
  member_dhanam: number; // (members - 1) * 10
  offerings_dhanam: number;
  total: number;
}

export function computeBookingDhanam(
  baseDhanam: number,
  memberCount: number,
  offerings: OfferingPick[],
): PricingBreakdown {
  const members = Math.max(1, Math.min(MAX_BOOKING_MEMBERS, memberCount));
  const member_dhanam = (members - 1) * DHANAM_PER_EXTRA_MEMBER;
  const offerings_dhanam = offerings.reduce((sum, o) => sum + (o.dhanam_cost ?? 0), 0);
  return {
    base: baseDhanam,
    members,
    member_dhanam,
    offerings_dhanam,
    total: baseDhanam + member_dhanam + offerings_dhanam,
  };
}
