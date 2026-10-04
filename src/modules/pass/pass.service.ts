// =============================================================================
// Aroha Pass + Question Packs (roadmap step 10, all switched off)
// =============================================================================
// The Pass comes in three tiers (pass.config.ts): Silver, Gold and Platinum.
// Each gives 30 days of chat questions (15 / 30 / 60), some of the Pass-only
// features (Life Timeline, Bonds, Decisions, Find My Date, the birth-time
// check, Relocation — see lib/entitlements.ts) and a discount on reports
// (10 / 20 / 30%). It is a Google Play subscription only (nav.arohaPass + at
// least one tier key): an auto-renewing Play subscription on Android, one
// base plan per tier, kept in step by the RTDN webhook — see
// pass-play.service.ts. It is never paid from the wallet. Rows with source
// 'wallet' are from before that rule: they run to their end and never renew.
// A user sees every tier that is on and picks one. Question Packs: prepaid
// chat questions bought from the wallet; chat spends Pass quota, then pack
// credits, then the wallet (question-billing.ts).
// =============================================================================

import type { UserRow, UserSubscriptionRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { resolveFeaturesForUser } from '../features/features.service.js';
import { addWalletBalance, deductWalletBalance } from '../users/users.repo.js';
import {
  entitlementForRow,
  GROUP_ENTITLEMENT,
  PASS_PERIOD_DAYS,
  PASS_PLAY_PRODUCT_ID,
  PASS_REMINDER_DAYS,
  PASS_TIERS,
  QUESTION_PACKS,
  type PassEntitlement,
  type PassFeature,
  type PassTier,
  type PassVariant,
  type QuestionPack,
} from './pass.config.js';
import {
  addQuestionCredits,
  expireLapsedPasses,
  expirePass,
  findActivePass,
  listWalletRemindersDue,
  listWalletRenewalsDue,
  markPassReminded,
} from './pass.repo.js';
import { listGroupIdsForUser } from '../user-groups/user-groups.repo.js';

const MS_PER_DAY = 86_400_000;
export const PASS_NOTIFICATION_TYPE = 'aroha_pass';

/** What one tier gives, as the app shows it. */
interface TierBenefits {
  questionsPerPeriod: number;
  reportDiscountPct: number;
  features: readonly PassFeature[];
}

export interface PassOffer extends TierBenefits {
  tier: PassTier;
  variant: PassVariant;
  /** Shown price. Google Play charges the base plan's own price, set in Play Console to match. */
  pricePaise: number;
  /** The Play subscription to buy (Android only). */
  play: { productId: string; basePlanId: string };
}

export interface PassStatus {
  /** The Pass page is on for this user (nav.arohaPass). */
  enabled: boolean;
  /** Every tier that is switched on, cheapest first. Empty while the Pass is off. */
  offers: PassOffer[];
  pass:
    | ({
        /** Null on a Pass from before the tiers. */
        tier: PassTier | null;
        /** 'google_play', 'wallet' (from before the Pass went Play-only) or 'group' (free for an admin user group). */
        source: string;
        variant: string | null;
        pricePaise: number;
        periodEnd: string;
        autoRenew: boolean;
        questionsLeft: number;
      } & TierBenefits)
    | null;
  questionCredits: number;
  packs: Array<{ pack: QuestionPack; questions: number; pricePaise: number }>;
  periodDays: number;
}

type Features = Awaited<ReturnType<typeof resolveFeaturesForUser>>;

const benefitsOf = (e: PassEntitlement): TierBenefits => ({
  questionsPerPeriod: e.questions,
  reportDiscountPct: e.reportDiscountPct,
  features: e.features,
});

function offersFor(features: Features): PassOffer[] {
  if (features['nav.arohaPass']?.enabled !== true) return [];
  return PASS_TIERS.filter((t) => features[t.key]?.enabled === true).map((t) => ({
    tier: t.tier,
    variant: t.variant,
    pricePaise: features[t.key]?.pricePaise ?? t.fallbackPaise,
    play: { productId: PASS_PLAY_PRODUCT_ID, basePlanId: t.playBasePlan },
    questionsPerPeriod: t.questions,
    reportDiscountPct: t.reportDiscountPct,
    features: t.features,
  }));
}

function packsFor(features: Features): PassStatus['packs'] {
  return QUESTION_PACKS.filter((p) => features[p.key]?.enabled === true).map((p) => ({
    pack: p.pack,
    questions: p.questions,
    pricePaise: features[p.key]?.pricePaise ?? p.fallbackPaise,
  }));
}

function passDto(row: UserSubscriptionRow): NonNullable<PassStatus['pass']> {
  const entitlement = entitlementForRow(row);
  return {
    tier: entitlement.tier,
    source: row.source,
    variant: row.priceVariant,
    pricePaise: row.pricePaise,
    periodEnd: row.periodEnd!.toISOString(),
    autoRenew: row.autoRenew,
    questionsLeft: Math.max(0, entitlement.questions - row.questionsUsed),
    ...benefitsOf(entitlement),
  };
}

export async function getPassStatus(user: UserRow): Promise<PassStatus> {
  const features = await resolveFeaturesForUser(user.id);
  const active = await findActivePass(user.id);
  const inGroup = (await listGroupIdsForUser(user.id).catch(() => [])).length > 0;

  let pass = active ? passDto(active) : null;
  if (!pass && inGroup) {
    // Free for an admin user group: the top tier, never charged, with no end date to act on.
    pass = {
      tier: GROUP_ENTITLEMENT.tier,
      source: 'group',
      variant: null,
      pricePaise: 0,
      periodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      autoRenew: true,
      questionsLeft: GROUP_ENTITLEMENT.questions,
      ...benefitsOf(GROUP_ENTITLEMENT),
    };
  }

  return {
    enabled: features['nav.arohaPass']?.enabled === true || inGroup,
    offers: offersFor(features),
    pass,
    questionCredits: user.questionCredits,
    packs: packsFor(features),
    periodDays: PASS_PERIOD_DAYS,
  };
}

export async function buyQuestionPack(user: UserRow, pack: QuestionPack): Promise<PassStatus> {
  const def = QUESTION_PACKS.find((p) => p.pack === pack)!;
  const features = await resolveFeaturesForUser(user.id);
  if (features[def.key]?.enabled !== true) throw Errors.forbidden('QUESTION_PACK_NOT_AVAILABLE');
  const price = features[def.key]?.pricePaise ?? def.fallbackPaise;
  const reason = `question_pack:${pack}`;

  const charged = await deductWalletBalance(user.id, price, reason);
  if (!charged) throw Errors.conflict('INSUFFICIENT_CREDITS');
  let credits: number;
  try {
    credits = await addQuestionCredits(user.id, def.questions);
  } catch (err) {
    await addWalletBalance(user.id, price, `refund:${reason}`).catch((e: unknown) =>
      logger.error({ err: e, userId: user.id }, 'pass: pack refund failed'),
    );
    throw err;
  }
  return getPassStatus({ ...user, questionCredits: credits });
}

/* -------------------------------------------------------------------------- */
/* Renewals (cron)                                                             */
/* -------------------------------------------------------------------------- */

export interface RenewalRun {
  /** Wallet Passes (from before the Pass went Play-only) that reached their end. */
  lapsed: number;
  reminded: number;
  expired: number;
}

const day = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(d);

/**
 * The daily Pass job. The wallet never pays for the Pass: a wallet Pass from
 * before that rule ends at its period end (even with auto-renew on), with a
 * reminder 3 days before, both pointing at the Google Play subscription.
 * Then everything else that's over is expired (Play Passes only if Google
 * went quiet — the RTDN webhook normally ends them).
 */
export async function runPassRenewals(
  now: Date = new Date(),
  opts: { dryRun?: boolean } = {},
): Promise<RenewalRun> {
  const run: RenewalRun = { lapsed: 0, reminded: 0, expired: 0 };

  for (const row of await listWalletRenewalsDue(now)) {
    if (opts.dryRun) continue;
    await expirePass(row.id);
    await notifyUser(row.userId, {
      title: 'Your Aroha Pass has ended',
      body: 'Subscribe through Google Play in the Aroha app to keep your questions and Pass features.',
      type: PASS_NOTIFICATION_TYPE,
      link: '/pass',
    });
    run.lapsed += 1;
  }

  for (const row of await listWalletRemindersDue(
    now,
    new Date(now.getTime() + PASS_REMINDER_DAYS * MS_PER_DAY),
  )) {
    if (opts.dryRun) continue;
    await notifyUser(row.userId, {
      title: 'Your Aroha Pass ends soon',
      body: `It ends on ${day(row.periodEnd!)}. Subscribe through Google Play in the Aroha app to keep it.`,
      type: PASS_NOTIFICATION_TYPE,
      link: '/pass',
    });
    await markPassReminded(row.id);
    run.reminded += 1;
  }

  if (!opts.dryRun) run.expired = await expireLapsedPasses(now);
  return run;
}
