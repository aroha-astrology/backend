// =============================================================================
// Aroha Pass + Question Packs (roadmap step 10, all switched off)
// =============================================================================
// The Pass: 30 days of 30 chat questions, the Pass-only features (Life
// Timeline, Bonds, Decisions, Find My Date, the birth-time check, Relocation —
// see lib/entitlements.ts) and 20% off reports. It is a Google Play
// subscription only (nav.arohaPass + a price variant): an auto-renewing Play
// subscription on Android, kept in step by the RTDN webhook — see
// pass-play.service.ts. It is never paid from the wallet. Rows with source
// 'wallet' are from before that rule: they run to their end and never renew.
// The price test: a user sees one of the variant keys that are on, picked by
// a stable hash of their id. Question Packs: prepaid chat questions bought
// from the wallet; chat spends Pass quota, then pack credits, then the wallet
// (question-billing.ts).
// =============================================================================

import crypto from 'node:crypto';
import type { UserRow, UserSubscriptionRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { resolveFeaturesForUser } from '../features/features.service.js';
import { addWalletBalance, deductWalletBalance } from '../users/users.repo.js';
import {
  PASS_PERIOD_DAYS,
  PASS_PLAY_PRODUCT_ID,
  PASS_QUESTIONS_PER_PERIOD,
  PASS_REMINDER_DAYS,
  PASS_REPORT_DISCOUNT_PCT,
  PASS_VARIANTS,
  QUESTION_PACKS,
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

/** Stable A/B/C assignment: the same user always lands on the same variant among those switched on. */
export function assignVariant(userId: string, enabled: readonly PassVariant[]): PassVariant | null {
  if (enabled.length === 0) return null;
  const sorted = [...enabled].sort();
  const n = crypto.createHash('sha256').update(userId).digest().readUInt32BE(0);
  return sorted[n % sorted.length]!;
}

export interface PassOffer {
  variant: PassVariant;
  /** Shown price. Google Play charges the base plan's own price, set in Play Console to match. */
  pricePaise: number;
  /** The Play subscription to buy (Android only). */
  play: { productId: string; basePlanId: string };
}

export interface PassStatus {
  /** The Pass page is on for this user (nav.arohaPass). */
  enabled: boolean;
  offer: PassOffer | null;
  pass: {
    source: string;
    variant: string | null;
    pricePaise: number;
    periodEnd: string;
    autoRenew: boolean;
    questionsLeft: number;
  } | null;
  questionCredits: number;
  packs: Array<{ pack: QuestionPack; questions: number; pricePaise: number }>;
  benefits: { questionsPerPeriod: number; periodDays: number; reportDiscountPct: number };
}

type Features = Awaited<ReturnType<typeof resolveFeaturesForUser>>;

function offerFor(userId: string, features: Features): PassOffer | null {
  if (features['nav.arohaPass']?.enabled !== true) return null;
  const on = PASS_VARIANTS.filter((v) => features[v.key]?.enabled === true);
  const variant = assignVariant(
    userId,
    on.map((v) => v.variant),
  );
  if (!variant) return null;
  const def = PASS_VARIANTS.find((v) => v.variant === variant)!;
  return {
    variant,
    pricePaise: features[def.key]?.pricePaise ?? def.fallbackPaise,
    play: { productId: PASS_PLAY_PRODUCT_ID, basePlanId: def.playBasePlan },
  };
}

function packsFor(features: Features): PassStatus['packs'] {
  return QUESTION_PACKS.filter((p) => features[p.key]?.enabled === true).map((p) => ({
    pack: p.pack,
    questions: p.questions,
    pricePaise: features[p.key]?.pricePaise ?? p.fallbackPaise,
  }));
}

function passDto(row: UserSubscriptionRow): NonNullable<PassStatus['pass']> {
  return {
    source: row.source,
    variant: row.priceVariant,
    pricePaise: row.pricePaise,
    periodEnd: row.periodEnd!.toISOString(),
    autoRenew: row.autoRenew,
    questionsLeft: Math.max(0, PASS_QUESTIONS_PER_PERIOD - row.questionsUsed),
  };
}

export async function getPassStatus(user: UserRow): Promise<PassStatus> {
  const features = await resolveFeaturesForUser(user.id);
  const active = await findActivePass(user.id);
  const inGroup = (await listGroupIdsForUser(user.id).catch(() => [])).length > 0;

  let pass = active ? passDto(active) : null;
  if (!pass && inGroup) {
    pass = {
      variant: null,
      pricePaise: 0,
      periodEnd: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      autoRenew: true,
      questionsLeft: PASS_QUESTIONS_PER_PERIOD,
    };
  }

  return {
    enabled: features['nav.arohaPass']?.enabled === true || inGroup,
    offer: inGroup ? null : offerFor(user.id, features),
    pass,
    questionCredits: user.questionCredits,
    packs: packsFor(features),
    benefits: {
      questionsPerPeriod: PASS_QUESTIONS_PER_PERIOD,
      periodDays: PASS_PERIOD_DAYS,
      reportDiscountPct: PASS_REPORT_DISCOUNT_PCT,
    },
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
