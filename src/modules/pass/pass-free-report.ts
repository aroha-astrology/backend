// =============================================================================
// The Platinum Pass free report (v7 spec, switch `money.platinumReport`, OFF)
// =============================================================================
// A tier with `freeReportsPerPeriod` (Platinum: 1) gets one report free in each Pass period.
// It covers one report bought on its own (one row: a one-time report, a yearly one or a single
// month); a multi-month bundle is charged as usual. Taking it is one conditional UPDATE on
// users.pass_free_report_at, so two purchases at once can't both get it. The report row keeps
// the claim in reports.charge_key ("pass_free_report:<iso>"), and a report that fails gives
// the free report back instead of a refund (there was no money).
//
// A member of an admin user group has the top Pass with no subscription row, so their period
// is the last PASS_PERIOD_DAYS days (passPeriodStart), the same rule palm readings use.
// =============================================================================

import { logger } from '../../lib/logger.js';
import { passEntitlement, passPeriodStart } from '../../lib/entitlements.js';
import { isFeatureOn } from '../features/features.service.js';
import { claimPassFreeReport, releasePassFreeReport } from './pass.repo.js';

export const PASS_FREE_REPORT_PREFIX = 'pass_free_report:';

/** True for a report row paid with the Pass free report rather than money. */
export function isPassFreeReportKey(chargeKey: string | null | undefined): chargeKey is string {
  return typeof chargeKey === 'string' && chargeKey.startsWith(PASS_FREE_REPORT_PREFIX);
}

/** Whether the user's Pass gives a free report and the switch is on (not whether it is used). */
async function hasFreeReportBenefit(userId: string): Promise<boolean> {
  try {
    if (!(await isFeatureOn(userId, 'money.platinumReport'))) return false;
    const pass = await passEntitlement(userId);
    return (pass?.freeReportsPerPeriod ?? 0) > 0;
  } catch {
    return false; // fails closed: no free report when the switch or the Pass can't be read
  }
}

/**
 * Whether this period's free report is still there to take, for the Pass page and the
 * purchase sheet. False with the switch off, without a Platinum Pass, or once it is used.
 */
export async function passFreeReportAvailable(
  user: { id: string; passFreeReportAt: Date | null },
): Promise<boolean> {
  try {
    if (!(await hasFreeReportBenefit(user.id))) return false;
    if (!user.passFreeReportAt) return true;
    return user.passFreeReportAt < (await passPeriodStart(user.id));
  } catch (err) {
    logger.warn({ err, userId: user.id }, 'pass free report: availability check failed');
    return false;
  }
}

/**
 * Takes this period's free report for one purchase. Returns the charge key to store on the
 * report row, or null when there is none to take (switch off, no Platinum Pass, already used).
 */
export async function takePassFreeReport(userId: string, now: Date = new Date()): Promise<string | null> {
  if (!(await hasFreeReportBenefit(userId))) return null;
  const periodStart = await passPeriodStart(userId, now);
  const at = new Date(Math.floor(now.getTime()));
  return (await claimPassFreeReport(userId, periodStart, at))
    ? `${PASS_FREE_REPORT_PREFIX}${at.toISOString()}`
    : null;
}

/** Gives the free report back (the report it was used on failed or was a repeat). Never throws. */
export async function givePassFreeReportBack(userId: string, chargeKey: string): Promise<void> {
  const at = new Date(chargeKey.slice(PASS_FREE_REPORT_PREFIX.length));
  if (Number.isNaN(at.getTime())) return;
  await releasePassFreeReport(userId, at).catch((err: unknown) =>
    logger.error({ err, userId }, 'pass free report: give back failed'),
  );
}
