import { randomUUID } from 'node:crypto';
import { isFeatureOn } from '../features/features.service.js';
import { refundKeyFor, type WalletWriteOptions } from '../users/users.repo.js';

/**
 * One refund per charge (v7 Sprint 1 gap, switch `money.refundKeys`, OFF).
 *
 * A paid job (a chat turn, a report, a palm reading, a Vastu report, a yantra) can be refunded
 * from more than one place: the request's own error path, the background job's failure path and
 * the stale-job reaper. Each used to write its refund with no key, so two of them reaching the
 * same failure would both pay. With the switch on, the charge gets a key and every refund of it
 * carries `refund:<key>`; the wallet ledger's unique (user, key) index lets only the first in.
 *
 * Off, nothing changes: no key on the charge, and the refunds are written exactly as before.
 */
export async function refundKeysOn(userId: string): Promise<boolean> {
  try {
    return await isFeatureOn(userId, 'money.refundKeys');
  } catch {
    return false; // fails closed: an unreadable switch is an off switch
  }
}

/** A fresh key for one charge (`<reason>:<uuid>`), or undefined while the switch is off. */
export async function newChargeKey(userId: string, reason: string): Promise<string | undefined> {
  return (await refundKeysOn(userId)) ? `${reason}:${randomUUID()}` : undefined;
}

/**
 * The extra wallet-write argument for a key: `[]` without one, so a call made with the switch off
 * is the very same call as before (`addWalletBalance(user, amount, reason)`).
 */
export function keyed(key: string | undefined | null): [] | [WalletWriteOptions] {
  return key ? [{ idempotencyKey: key }] : [];
}

/** `keyed` for the refund of a keyed charge. */
export function refundOf(chargeKey: string | undefined | null): [] | [WalletWriteOptions] {
  return chargeKey ? [{ idempotencyKey: refundKeyFor(chargeKey) }] : [];
}
