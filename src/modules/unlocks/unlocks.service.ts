import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { hasPass } from '../../lib/entitlements.js';
import { priceOf } from '../features/features.service.js';
import { addWalletBalance, deductWalletBalance } from '../users/users.repo.js';
import { findActiveUnlock, insertUnlock } from './unlocks.repo.js';

export interface UnlockState {
  unlocked: boolean;
  /** Why it's open: bought once, or included in the Aroha Pass. */
  via: 'purchase' | 'pass' | null;
  /** What unlocking costs now (0 with the Pass). */
  pricePaise: number;
}

/** Is `featureKey` open for this profile, and what would it cost? */
export async function unlockState(
  userId: string,
  birthProfileId: string | null,
  featureKey: string,
  fallbackPaise: number,
): Promise<UnlockState> {
  if (await hasPass(userId)) return { unlocked: true, via: 'pass', pricePaise: 0 };
  const existing = await findActiveUnlock(userId, birthProfileId, featureKey);
  if (existing) return { unlocked: true, via: 'purchase', pricePaise: 0 };
  return {
    unlocked: false,
    via: null,
    pricePaise: await priceOf(userId, featureKey, fallbackPaise),
  };
}

/**
 * Buys a one-off unlock of `featureKey` for a profile from the wallet.
 * Idempotent: an already-open feature is never charged twice, and a race
 * that loses the insert is refunded. `reason` is the wallet ledger reason
 * (also the payment-history / analytics key).
 */
export async function purchaseUnlock(opts: {
  userId: string;
  birthProfileId: string | null;
  featureKey: string;
  fallbackPaise: number;
  reason: string;
}): Promise<UnlockState> {
  const current = await unlockState(
    opts.userId,
    opts.birthProfileId,
    opts.featureKey,
    opts.fallbackPaise,
  );
  if (current.unlocked) return current;

  const price = current.pricePaise;
  if (price > 0) {
    const charged = await deductWalletBalance(opts.userId, price, opts.reason);
    if (!charged) throw Errors.conflict('INSUFFICIENT_CREDITS');
  }
  let inserted = false;
  try {
    inserted = await insertUnlock({
      userId: opts.userId,
      birthProfileId: opts.birthProfileId,
      featureKey: opts.featureKey,
      pricePaidPaise: price,
    });
  } catch (err) {
    if (price > 0) await refund(opts, price);
    throw err;
  }
  if (!inserted && price > 0) await refund(opts, price); // a concurrent purchase won
  return { unlocked: true, via: 'purchase', pricePaise: 0 };
}

async function refund(opts: { userId: string; reason: string }, price: number): Promise<void> {
  await addWalletBalance(opts.userId, price, `refund:${opts.reason}`).catch((err: unknown) =>
    logger.error({ err, userId: opts.userId, reason: opts.reason }, 'unlock refund failed'),
  );
}
