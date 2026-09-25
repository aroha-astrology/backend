// =============================================================================
// Aroha Pass + Question Packs (roadmap step 10, all switched off)
// =============================================================================
// The Pass: 30 days of 30 chat questions, the "free with the Pass" unlocks
// (Life Timeline, Bonds, Decisions, Find My Date, birth-time checks) and 20%
// off reports. Two ways to pay, each behind its own switch:
//   wallet       paid from the wallet on any platform (nav.arohaPass + a
//                price variant); optional auto-renew from the balance, run by
//                the pass-renewals cron, with a reminder 3 days before the end;
//   google_play  an auto-renewing Play subscription on Android
//                (paid.arohaPassPlay), kept in step by the RTDN webhook — see
//                pass-play.service.ts.
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
  insertPass,
  listWalletRemindersDue,
  listWalletRenewalsDue,
  markPassReminded,
  renewPass,
  setPassAutoRenew,
} from './pass.repo.js';

const MS_PER_DAY = 86_400_000;
export const PASS_REASON = 'aroha_pass';
export const PASS_RENEWAL_REASON = 'aroha_pass_renewal';
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
  pricePaise: number;
  /** Buy through Google Play (Android) — needs paid.arohaPassPlay. */
  play: { productId: string; basePlanId: string } | null;
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
    play:
      features['paid.arohaPassPlay']?.enabled === true
        ? { productId: PASS_PLAY_PRODUCT_ID, basePlanId: def.playBasePlan }
        : null,
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
  return {
    enabled: features['nav.arohaPass']?.enabled === true,
    offer: offerFor(user.id, features),
    pass: active ? passDto(active) : null,
    questionCredits: user.questionCredits,
    packs: packsFor(features),
    benefits: {
      questionsPerPeriod: PASS_QUESTIONS_PER_PERIOD,
      periodDays: PASS_PERIOD_DAYS,
      reportDiscountPct: PASS_REPORT_DISCOUNT_PCT,
    },
  };
}

/** Buys 30 days of the Pass from the wallet at the user's variant price. */
export async function buyWalletPass(
  user: UserRow,
  opts: { autoRenew: boolean },
): Promise<PassStatus> {
  const features = await resolveFeaturesForUser(user.id);
  const offer = offerFor(user.id, features);
  if (!offer) throw Errors.conflict('PASS_NOT_AVAILABLE');
  if (await findActivePass(user.id)) throw Errors.conflict('PASS_ALREADY_ACTIVE');

  const charged = await deductWalletBalance(user.id, offer.pricePaise, PASS_REASON);
  if (!charged) throw Errors.conflict('INSUFFICIENT_CREDITS');
  const now = new Date();
  try {
    await insertPass({
      userId: user.id,
      source: 'wallet',
      priceVariant: offer.variant,
      pricePaise: offer.pricePaise,
      autoRenew: opts.autoRenew,
      periodStart: now,
      periodEnd: new Date(now.getTime() + PASS_PERIOD_DAYS * MS_PER_DAY),
    });
  } catch (err) {
    await addWalletBalance(user.id, offer.pricePaise, `refund:${PASS_REASON}`).catch((e: unknown) =>
      logger.error({ err: e, userId: user.id }, 'pass: refund after failed insert failed'),
    );
    throw err;
  }
  return getPassStatus(user);
}

/** Turns wallet auto-renew on or off. A Play Pass is managed in the Play Store. */
export async function setAutoRenew(user: UserRow, on: boolean): Promise<PassStatus> {
  const active = await findActivePass(user.id);
  if (!active) throw Errors.notFound('PASS_NOT_FOUND');
  if (active.source !== 'wallet') throw Errors.conflict('PASS_MANAGED_BY_PLAY');
  await setPassAutoRenew(active.id, on);
  return getPassStatus(user);
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
  renewed: number;
  lapsed: number;
  reminded: number;
  expired: number;
}

const rupees = (paise: number) => `₹${Math.round(paise / 100)}`;
const day = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(d);

/**
 * The daily Pass job: renews wallet Passes due today from the balance (at the
 * price the user signed up at), ends the ones the balance can't cover, sends
 * the "ends in 3 days" reminders, and expires everything else that's over.
 */
export async function runPassRenewals(
  now: Date = new Date(),
  opts: { dryRun?: boolean } = {},
): Promise<RenewalRun> {
  const run: RenewalRun = { renewed: 0, lapsed: 0, reminded: 0, expired: 0 };

  for (const row of await listWalletRenewalsDue(now)) {
    if (opts.dryRun) continue;
    // A long-missed renewal restarts from today rather than back-dating a period nobody used.
    const start =
      row.periodEnd && now.getTime() - row.periodEnd.getTime() < MS_PER_DAY ? row.periodEnd : now;
    const charged = await deductWalletBalance(
      row.userId,
      row.pricePaise,
      PASS_RENEWAL_REASON,
    ).catch(() => false);
    if (charged) {
      await renewPass(row.id, {
        start,
        end: new Date(start.getTime() + PASS_PERIOD_DAYS * MS_PER_DAY),
      });
      run.renewed += 1;
    } else {
      await expirePass(row.id);
      await notifyUser(row.userId, {
        title: 'Your Aroha Pass has ended',
        body: `There wasn't enough in your wallet to renew it (${rupees(row.pricePaise)}). Add money and restart it any time.`,
        type: PASS_NOTIFICATION_TYPE,
        link: '/pass',
      });
      run.lapsed += 1;
    }
  }

  for (const row of await listWalletRemindersDue(
    now,
    new Date(now.getTime() + PASS_REMINDER_DAYS * MS_PER_DAY),
  )) {
    if (opts.dryRun) continue;
    const end = row.periodEnd!;
    await notifyUser(row.userId, {
      title: row.autoRenew ? 'Your Aroha Pass renews soon' : 'Your Aroha Pass ends soon',
      body: row.autoRenew
        ? `It renews on ${day(end)} for ${rupees(row.pricePaise)} from your wallet. Keep enough balance, or turn off auto-renew.`
        : `It ends on ${day(end)}. Renew to keep your questions and unlocks.`,
      type: PASS_NOTIFICATION_TYPE,
      link: '/pass',
    });
    await markPassReminded(row.id);
    run.reminded += 1;
  }

  if (!opts.dryRun) run.expired = await expireLapsedPasses(now);
  return run;
}
