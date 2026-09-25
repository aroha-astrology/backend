/**
 * Entitlements — what a user has paid for beyond one-off wallet charges.
 *
 * `hasPass()` is the single check every "free with Aroha Pass" feature calls
 * (Life Timeline, Bonds, Decisions, Find My Date, birth-time checks, report
 * discount). A Pass counts while its current period hasn't ended — the
 * Aroha Pass itself ships switched off (nav.arohaPass), so until an admin
 * turns it on nobody has one and every feature charges its normal price.
 */
import { findActivePass } from '../modules/pass/pass.repo.js';

export async function hasPass(userId: string): Promise<boolean> {
  return (await findActivePass(userId)) !== null;
}
