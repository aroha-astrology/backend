import type { UserRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';

/**
 * Refuses a new top-up or Question Pack for an account blocked after a second
 * Google Play refund (play-refunds.service.ts). Runs before the pending order
 * exists, so a blocked buyer is never sent to Google Play to pay for nothing.
 */
export function assertPurchasesAllowed(user: Pick<UserRow, 'purchasesBlockedAt'>): void {
  if (user.purchasesBlockedAt) throw Errors.forbidden('PURCHASES_BLOCKED');
}
