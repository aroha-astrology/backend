/**
 * One-time "claim a wallet bonus" campaigns — Independence Day today, whatever
 * festival/promo is next later. One entry here (+ a matching `referral.*` key
 * in features.ts for the admin-tunable amount) is the whole cost of a new
 * campaign; the route, ledger idempotency, and `/v1/me` DTO plumbing in
 * users.routes.ts/users.repo.ts all key off `campaign.key` and never change.
 */

export interface ClaimCampaignDef {
  /** Also used as the `wallet_transactions.reason` — must stay prefix-safe (see admin.repo.ts's `split_part` usage). */
  key: string;
  /** Feature-registry key resolving the payout amount; disabling it is this campaign's kill switch. */
  featureKey: string;
  /** Fail-open fallback paise, used only if the feature registry has no override yet. */
  fallbackPaise: number;
  /** Claimable only on this IST calendar date (YYYY-MM-DD), enforced server-side in the route. */
  istDate: string;
}

export const CLAIM_CAMPAIGNS: readonly ClaimCampaignDef[] = [
  {
    key: 'independence_day_2026',
    featureKey: 'referral.independenceBonus',
    fallbackPaise: 50000,
    istDate: '2026-08-15',
  },
  // Next event: add a new entry here + a matching referral.* key in features.ts.
];

export function findClaimCampaign(key: string): ClaimCampaignDef | undefined {
  return CLAIM_CAMPAIGNS.find((c) => c.key === key);
}

export const CLAIM_CAMPAIGN_KEYS: readonly string[] = CLAIM_CAMPAIGNS.map((c) => c.key);
