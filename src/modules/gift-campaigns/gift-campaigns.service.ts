import { findClaimCampaign } from '../../config/campaigns.js';
import { payoutOf } from '../features/features.service.js';
import { istDateString } from '../../lib/astro-tools/transit-events.js';
import { getGiftCampaignByKey } from './gift-campaigns.repo.js';

export interface ClaimCampaignResolution {
  key: string;
  amountPaise: number;
  maxBalancePaise: number | undefined;
  /** IST calendar date to compare against the user's signup date for the "signed up same day" guard. */
  eligibleIstDate: string;
  isOpenNow: boolean;
  /** Credit-expiry to stamp on the ledger row, if this campaign has one. */
  expiresAt: Date | undefined;
}

/**
 * Single lookup the claim-bonus route calls instead of the old sync
 * findClaimCampaign — checks the static CLAIM_CAMPAIGNS array first (unchanged
 * behavior, unchanged historical entries), then gift_campaigns. Normalizes
 * both into one shape so the route's eligibility checks don't need to branch
 * on where a campaign came from.
 */
export async function resolveClaimCampaign(
  campaignKey: string,
  userId: string,
  now: Date = new Date(),
): Promise<ClaimCampaignResolution | undefined> {
  const staticCampaign = findClaimCampaign(campaignKey);
  if (staticCampaign) {
    const amountPaise = await payoutOf(
      userId,
      staticCampaign.featureKey,
      staticCampaign.fallbackPaise,
    );
    return {
      key: staticCampaign.key,
      amountPaise,
      maxBalancePaise: staticCampaign.maxBalancePaise,
      eligibleIstDate: staticCampaign.istDate,
      isOpenNow: istDateString(now) === staticCampaign.istDate,
      expiresAt: undefined,
    };
  }

  const dbCampaign = await getGiftCampaignByKey(campaignKey);
  if (!dbCampaign || dbCampaign.deliveryMode !== 'self_claim' || dbCampaign.status !== 'sent') {
    return undefined;
  }

  const isOpenNow =
    dbCampaign.validFrom !== null &&
    dbCampaign.validUntil !== null &&
    now >= dbCampaign.validFrom &&
    now <= dbCampaign.validUntil;

  return {
    key: dbCampaign.key,
    amountPaise: dbCampaign.amountPaise,
    maxBalancePaise: dbCampaign.audienceMaxBalancePaise ?? undefined,
    eligibleIstDate: istDateString(dbCampaign.sentAt ?? now),
    isOpenNow,
    expiresAt: dbCampaign.creditExpiryDays
      ? new Date(now.getTime() + dbCampaign.creditExpiryDays * 24 * 60 * 60 * 1000)
      : undefined,
  };
}
