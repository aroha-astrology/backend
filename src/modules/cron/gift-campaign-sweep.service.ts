import {
  findDueScheduledCampaigns,
  findDueExpiredGrants,
  applyExpiryClawback,
  markGrantExpired,
} from '../gift-campaigns/gift-campaigns.repo.js';
import { executeSend } from '../gift-campaigns/gift-campaigns.service.js';

/** The claim-window/schedule half of the daily gift-campaigns sweep. */
export async function sweepDueCampaigns(now: Date = new Date()): Promise<{ sent: number }> {
  const due = await findDueScheduledCampaigns(now);
  for (const campaign of due) {
    await executeSend(campaign);
  }
  return { sent: due.length };
}

/**
 * The credit-expiry half. Clawback is `min(originally granted, currently
 * held)` — see the design spec's note on why this is an approximation, not a
 * per-rupee spend-ordering ledger.
 */
export async function sweepExpiredGrants(now: Date = new Date()): Promise<{ expired: number }> {
  const due = await findDueExpiredGrants(now);
  for (const grant of due) {
    const clawbackPaise = Math.max(0, Math.min(grant.delta, grant.currentBalancePaise));
    if (clawbackPaise > 0) {
      await applyExpiryClawback(grant.id, grant.userId, clawbackPaise, `${grant.reason}_expired`);
    } else {
      await markGrantExpired(grant.id);
    }
  }
  return { expired: due.length };
}
