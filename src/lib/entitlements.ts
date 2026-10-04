/**
 * Entitlements — what a user has paid for beyond one-off wallet charges.
 *
 * The Aroha Pass is a Google Play subscription (never paid from the wallet)
 * in three tiers: Silver, Gold and Platinum (modules/pass/pass.config.ts).
 * Life Timeline, Bonds, Decisions, Find My Date, the birth-time check and
 * Relocation are Pass-only: each calls `requirePass()` with its own name
 * before doing anything, and the app shows a "subscribe" lock on
 * PASS_REQUIRED, which is also the answer when the user's tier doesn't
 * include that feature. The chat quota and the report discount come from the
 * tier too. A Pass counts while its current period hasn't ended.
 */
import { Errors } from './errors.js';
import {
  entitlementForRow,
  GROUP_ENTITLEMENT,
  type PassEntitlement,
  type PassFeature,
} from '../modules/pass/pass.config.js';
import { findActivePass } from '../modules/pass/pass.repo.js';
import { listGroupIdsForUser } from '../modules/user-groups/user-groups.repo.js';

/** What the user's live Pass gives, or null without one. */
export async function passEntitlement(userId: string): Promise<PassEntitlement | null> {
  try {
    const groupIds = await listGroupIdsForUser(userId);
    if (groupIds.length > 0) return GROUP_ENTITLEMENT;
  } catch {
    // Fail open to standard pass check
  }
  const row = await findActivePass(userId);
  return row ? entitlementForRow(row) : null;
}

export async function hasPass(userId: string): Promise<boolean> {
  return (await passEntitlement(userId)) !== null;
}

/** Percent off reports for this user: their Pass tier's discount, 0 without a Pass. */
export async function passReportDiscountPct(userId: string): Promise<number> {
  return (await passEntitlement(userId))?.reportDiscountPct ?? 0;
}

/** Throws 403 PASS_REQUIRED unless the user has a live Aroha Pass whose tier includes `feature`. */
export async function requirePass(userId: string, feature: PassFeature): Promise<void> {
  const pass = await passEntitlement(userId);
  if (!pass?.features.includes(feature)) throw Errors.forbidden('PASS_REQUIRED');
}
