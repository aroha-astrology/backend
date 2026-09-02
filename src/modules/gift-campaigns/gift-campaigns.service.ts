import pLimit from 'p-limit';
import { findClaimCampaign } from '../../config/campaigns.js';
import { payoutOf } from '../features/features.service.js';
import { istDateString } from '../../lib/astro-tools/transit-events.js';
import { Errors } from '../../lib/errors.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { logAdminAction } from '../admin/admin.repo.js';
import { getAllActiveTokens } from '../device-tokens/device-tokens.repo.js';
import { claimCampaignBonus } from '../users/users.repo.js';
import type { GiftCampaignRow } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import {
  getGiftCampaignByKey,
  generateCampaignKey,
  insertGiftCampaign,
  resolveAudience,
  cancelGiftCampaignIfPending,
  getGiftCampaignById,
  claimGiftCampaignForSend,
  type CreateGiftCampaignRow,
} from './gift-campaigns.repo.js';
import { getGiftCampaignPushCopy, normalizeLang } from './gift-campaign-copy.js';

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
  if (!dbCampaign) {
    return undefined;
  }

  // A row that exists but isn't a currently-sent self-claim offer (still draft/scheduled,
  // canceled, or auto_credit) is "not available right now", not "never existed" — the route
  // turns isOpenNow: false into a 409, which is the honest status for a campaign a user found
  // out about before it actually went live, rather than a confusing 404.
  const isOpenNow =
    dbCampaign.deliveryMode === 'self_claim' &&
    dbCampaign.status === 'sent' &&
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

export interface CreateGiftCampaignInput {
  title: string;
  amountPaise: number;
  audienceMaxBalancePaise: number | null;
  deliveryMode: 'self_claim' | 'auto_credit';
  claimWindowDays: number | null;
  creditExpiryDays: number | null;
  scheduledSendAt: Date | null;
}

export async function createCampaign(
  input: CreateGiftCampaignInput,
  adminPhone: string,
): Promise<GiftCampaignRow> {
  if (input.amountPaise <= 0) {
    throw Errors.badRequest('Amount must be greater than zero');
  }
  if (
    input.deliveryMode === 'self_claim' &&
    (!input.claimWindowDays || input.claimWindowDays <= 0)
  ) {
    throw Errors.badRequest('Self-claim campaigns need a claim window of at least 1 day');
  }

  const key = generateCampaignKey(input.title);
  const row: CreateGiftCampaignRow = {
    key,
    title: input.title,
    amountPaise: input.amountPaise,
    audienceMaxBalancePaise: input.audienceMaxBalancePaise,
    deliveryMode: input.deliveryMode,
    claimWindowDays: input.claimWindowDays,
    creditExpiryDays: input.creditExpiryDays,
    scheduledSendAt: input.scheduledSendAt,
    status: input.scheduledSendAt ? 'scheduled' : 'draft',
    createdBy: adminPhone,
  };
  const created = await insertGiftCampaign(row);
  await logAdminAction(adminPhone, 'POST /v1/admin/gift-campaigns', { key, title: input.title });
  return created;
}

export interface AudiencePreview {
  eligibleCount: number;
  pushableCount: number;
  totalCostPaise: number;
}

/** Dry run — no wallet or push side effects. Used by the admin UI before every send/schedule. */
export async function previewAudience(
  amountPaise: number,
  maxBalancePaise: number | null,
): Promise<AudiencePreview> {
  const [audience, activeTokens] = await Promise.all([
    resolveAudience(maxBalancePaise),
    getAllActiveTokens(),
  ]);
  const pushableUserIds = new Set(activeTokens.map((t) => t.userId));
  const pushableCount = audience.filter((m) => pushableUserIds.has(m.userId)).length;
  return {
    eligibleCount: audience.length,
    pushableCount,
    totalCostPaise: audience.length * amountPaise,
  };
}

export async function cancelCampaign(id: string, adminPhone: string): Promise<void> {
  const canceled = await cancelGiftCampaignIfPending(id);
  if (!canceled) {
    throw Errors.conflict('Only draft or scheduled campaigns can be canceled');
  }
  await logAdminAction(adminPhone, `DELETE /v1/admin/gift-campaigns/${id}`, {});
}

/** Matches the horoscope batch job's concurrency — plenty at this app's user counts (~hundreds, not millions). */
const SEND_CONCURRENCY = 10;

function formatRupeeLabel(paise: number): string {
  return `₹${Math.round(paise / 100)}`;
}

/**
 * Shared by the manual "Send Now" admin action and the daily cron sweep
 * (sweepDueCampaigns). Both can legitimately race for the same campaign — a
 * double-clicked "Send Now", or a manual send landing the same minute the cron sweep picks up
 * a scheduled one — so the guarantee that this only ever fans out once per campaign lives HERE,
 * as an atomic claim, not in whichever caller happens to check status first. Returns false
 * (and does nothing else) if another call already claimed this campaign.
 */
export async function executeSend(campaign: GiftCampaignRow): Promise<boolean> {
  const now = new Date();
  const validUntil =
    campaign.deliveryMode === 'self_claim' && campaign.claimWindowDays
      ? new Date(now.getTime() + campaign.claimWindowDays * 24 * 60 * 60 * 1000)
      : null;

  // Claim FIRST, before any wallet credit or push goes out — this is the single point that
  // decides who, if anyone, gets to fan out to the audience.
  const claimed = await claimGiftCampaignForSend(campaign.id, {
    sentAt: now,
    validFrom: now,
    validUntil,
  });
  if (!claimed) {
    logger.warn({ campaignId: campaign.id }, 'gift-campaign: already claimed, skipping send');
    return false;
  }

  const audience = await resolveAudience(campaign.audienceMaxBalancePaise);
  const expiresAt = campaign.creditExpiryDays
    ? new Date(now.getTime() + campaign.creditExpiryDays * 24 * 60 * 60 * 1000)
    : undefined;
  const limit = pLimit(SEND_CONCURRENCY);
  const amountLabel = formatRupeeLabel(campaign.amountPaise);

  // allSettled, not all: one recipient's failed credit/push must never abort the rest of the
  // batch — claimCampaignBonus is idempotent (FOR UPDATE + prior-reason check), so a manual
  // retry after a partial failure re-credits nobody who already got it, but a Promise.all
  // rejecting here would have left the campaign stuck unclaimed with an arbitrary prefix of
  // the audience already paid, and no way to safely retry (retrying would re-fan-out to all).
  const results = await Promise.allSettled(
    audience.map((member) =>
      limit(async () => {
        if (campaign.deliveryMode === 'auto_credit') {
          await claimCampaignBonus(member.userId, campaign.key, campaign.amountPaise, expiresAt);
        }
        const copy = getGiftCampaignPushCopy(
          normalizeLang(member.locale),
          campaign.deliveryMode,
          campaign.title,
          amountLabel,
        );
        await notifyUser(member.userId, {
          title: copy.title,
          body: copy.body,
          type: 'gift_campaign',
          // There is no /wallet route (it 404'd — the wallet/transaction history page is
          // /profile/orders); the self-claim modal is mounted globally in layout.tsx and pops
          // up over whatever page loads regardless, so this only has to be a real route.
          link: '/profile/orders',
        });
      }),
    ),
  );

  const failed = results.filter((r) => r.status === 'rejected').length;
  if (failed > 0) {
    logger.error(
      { campaignId: campaign.id, failed, total: audience.length },
      'gift-campaign: some recipients failed during send',
    );
  }
  return true;
}

export async function sendCampaignNow(id: string, adminPhone: string): Promise<GiftCampaignRow> {
  const campaign = await getGiftCampaignById(id);
  if (!campaign) throw Errors.notFound('Unknown campaign');
  // Fast, friendly rejection for the common case (a stale UI showing a Send button for a
  // campaign already sent/canceled). The real guarantee against a genuine race is the atomic
  // claim inside executeSend — this check is advisory, not the source of truth.
  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    throw Errors.conflict('This campaign has already been sent or canceled');
  }
  const sent = await executeSend(campaign);
  if (!sent) {
    throw Errors.conflict('This campaign has already been sent or canceled');
  }
  await logAdminAction(adminPhone, `POST /v1/admin/gift-campaigns/${id}/send`, {});
  const updated = await getGiftCampaignById(id);
  if (!updated) throw Errors.internal('Campaign vanished mid-send');
  return updated;
}
