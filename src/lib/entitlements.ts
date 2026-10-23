/**
 * Entitlements — what a user has paid for beyond one-off wallet charges.
 *
 * The Aroha Pass is a Google Play subscription (never paid from the wallet)
 * in three tiers: Silver, Gold and Platinum (modules/pass/pass.config.ts).
 * Life Timeline, Bonds, Decisions, Find My Date, the birth-time check and
 * Relocation are Pass-only: each calls `requirePass()` with its own name
 * before doing anything, and the app shows a "subscribe" lock on
 * PASS_REQUIRED, which is also the answer when the user's tier doesn't
 * include that feature. Palm Reading's full reading is a benefit of every tier,
 * one per Pass period (the photo scan stays free). The chat quota and the
 * report discount come from the tier too. A Pass counts while its current
 * period hasn't ended; a Play Pass that has just reached its end is checked
 * with Google first (its renewal notice may be late, or it is in a grace
 * period), so a paying member is never shut out by a missing notice.
 */
import { Errors } from './errors.js';
import {
  entitlementForRow,
  GROUP_ENTITLEMENT,
  PASS_PERIOD_DAYS,
  type PassEntitlement,
  type PassFeature,
} from '../modules/pass/pass.config.js';
import { findActivePass } from '../modules/pass/pass.repo.js';
import { refreshLapsedPlayPass } from '../modules/pass/pass-play.service.js';
import { listGroupIdsForUser } from '../modules/user-groups/user-groups.repo.js';

/** What the user's live Pass gives, or null without one. */
export async function passEntitlement(userId: string): Promise<PassEntitlement | null> {
  try {
    const groupIds = await listGroupIdsForUser(userId);
    if (groupIds.length > 0) return GROUP_ENTITLEMENT;
  } catch {
    // Fail open to standard pass check
  }
  let row = await findActivePass(userId);
  if (!row && (await refreshLapsedPlayPass(userId))) row = await findActivePass(userId);
  return row ? entitlementForRow(row) : null;
}

export async function hasPass(userId: string): Promise<boolean> {
  return (await passEntitlement(userId)) !== null;
}

/** Percent off reports for this user: their Pass tier's discount, 0 without a Pass. */
export async function passReportDiscountPct(userId: string): Promise<number> {
  return (await passEntitlement(userId))?.reportDiscountPct ?? 0;
}

/**
 * Where the user's current Pass period began, for allowances counted per period (palm
 * readings). A member of an admin user group has the top Pass with no subscription row, so
 * their period is the last PASS_PERIOD_DAYS days, the same rule voice minutes use.
 */
export async function passPeriodStart(userId: string, now: Date = new Date()): Promise<Date> {
  const row = await findActivePass(userId).catch(() => null);
  return (
    row?.periodStart ?? row?.startedAt ?? new Date(now.getTime() - PASS_PERIOD_DAYS * 86_400_000)
  );
}

/** Throws 403 PASS_REQUIRED unless the user has a live Aroha Pass whose tier includes `feature`. */
export async function requirePass(userId: string, feature: PassFeature): Promise<void> {
  const pass = await passEntitlement(userId);
  if (!pass?.features.includes(feature)) throw Errors.forbidden('PASS_REQUIRED');
}
