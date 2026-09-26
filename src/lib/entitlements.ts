/**
 * Entitlements — what a user has paid for beyond one-off wallet charges.
 *
 * The Aroha Pass is a Google Play subscription (never paid from the wallet).
 * Life Timeline, Bonds, Decisions, Find My Date, the birth-time check and
 * Relocation are Pass-only: each calls `requirePass()` before doing anything,
 * and the app shows a "subscribe" lock on PASS_REQUIRED. `hasPass()` is also
 * read for the Pass's other benefits (chat quota, report discount). A Pass
 * counts while its current period hasn't ended.
 */
import { Errors } from './errors.js';
import { findActivePass } from '../modules/pass/pass.repo.js';
import { listGroupIdsForUser } from '../modules/user-groups/user-groups.repo.js';

export async function hasPass(userId: string): Promise<boolean> {
  try {
    const groupIds = await listGroupIdsForUser(userId);
    if (groupIds.length > 0) return true;
  } catch {
    // Fail open to standard pass check
  }
  return (await findActivePass(userId)) !== null;
}

/** Throws 403 PASS_REQUIRED unless the user has a live Aroha Pass. */
export async function requirePass(userId: string): Promise<void> {
  if (!(await hasPass(userId))) throw Errors.forbidden('PASS_REQUIRED');
}
