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
 * The credit-expiry half. Clawback is whatever the grant still holds
 * (`remaining_paise`) — spends drain expiring lots soonest-first
 * (`consumeExpiringCredits` in users.repo.ts), so a bonus the user actually
 * used is already at 0 here and costs them nothing at expiry. This used to be
 * `min(originally granted, current balance)`, which took a spent bonus back
 * out of the user's own paid balance — charging them twice for one bonus.
 *
 * No clamping here: `applyExpiryClawback` floors the deduction at the balance
 * inside its own transaction, which is the only place that can do it without
 * racing a concurrent spend.
 */
export async function sweepExpiredGrants(now: Date = new Date()): Promise<{ expired: number }> {
  const due = await findDueExpiredGrants(now);
  for (const grant of due) {
    if (grant.remainingPaise > 0) {
      await applyExpiryClawback(
        grant.id,
        grant.userId,
        grant.remainingPaise,
        `${grant.reason}_expired`,
      );
    } else {
      await markGrantExpired(grant.id);
    }
  }
  return { expired: due.length };
}
