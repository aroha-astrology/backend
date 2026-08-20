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
import {
  getGiftCampaignByKey,
  generateCampaignKey,
  insertGiftCampaign,
  resolveAudience,
  cancelGiftCampaignIfPending,
  getGiftCampaignById,
  markGiftCampaignSent,
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
 * Shared by the manual "Send Now" admin action and the daily cron sweep.
 * Callers are responsible for only invoking this once per campaign (both
 * only ever call it for a draft/scheduled row, then this marks it sent).
 */
export async function executeSend(campaign: GiftCampaignRow): Promise<void> {
  const now = new Date();
  const audience = await resolveAudience(campaign.audienceMaxBalancePaise);
  const expiresAt = campaign.creditExpiryDays
    ? new Date(now.getTime() + campaign.creditExpiryDays * 24 * 60 * 60 * 1000)
    : undefined;
  const limit = pLimit(SEND_CONCURRENCY);
  const amountLabel = formatRupeeLabel(campaign.amountPaise);

  await Promise.all(
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
          link: '/wallet',
        });
      }),
    ),
  );

  const validUntil =
    campaign.deliveryMode === 'self_claim' && campaign.claimWindowDays
      ? new Date(now.getTime() + campaign.claimWindowDays * 24 * 60 * 60 * 1000)
      : null;
  await markGiftCampaignSent(campaign.id, { sentAt: now, validFrom: now, validUntil });
}

export async function sendCampaignNow(id: string, adminPhone: string): Promise<GiftCampaignRow> {
  const campaign = await getGiftCampaignById(id);
  if (!campaign) throw Errors.notFound('Unknown campaign');
  if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
    throw Errors.conflict('This campaign has already been sent or canceled');
  }
  await executeSend(campaign);
  await logAdminAction(adminPhone, `POST /v1/admin/gift-campaigns/${id}/send`, {});
  const updated = await getGiftCampaignById(id);
  return updated!;
}
