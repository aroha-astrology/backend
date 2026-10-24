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
// chat questions, bought through Google Play like the Pass (never from the
// wallet, since 2026-10-23): a pending order, the Play purchase, then
// billing.service.ts's confirmGooglePlayPurchase grants the questions. Chat
// spends Pass quota, then pack credits, then the wallet (question-billing.ts).
// =============================================================================

import type { UserRow, UserSubscriptionRow } from '../../db/schema.js';
import { Errors } from '../../lib/errors.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { resolveFeaturesForUser } from '../features/features.service.js';
import { insertOrder } from '../billing/billing.repo.js';
import { assertPurchasesAllowed } from '../billing/purchase-block.js';
import {
  entitlementForRow,
  GROUP_ENTITLEMENT,
  PASS_PERIOD_DAYS,
  PASS_PLAY_PRODUCT_ID,
  PASS_REMINDER_DAYS,
  PASS_TIERS,
  APP_STORE_PASS_PRODUCTS,
  QUESTION_PACKS,
  type PassEntitlement,
  type PassFeature,
  type PassTier,
  type PassVariant,
  type QuestionPack,
} from './pass.config.js';
import {
  expireLapsedPasses,
  expirePass,
  findActivePass,
  findLatestPlayPass,
  groupQuestionsLeft,
  listWalletRemindersDue,
  listWalletRenewalsDue,
  markPassReminded,
} from './pass.repo.js';
import { listGroupIdsForUser } from '../user-groups/user-groups.repo.js';
import { passFreeReportAvailable } from './pass-free-report.js';
import { refreshLapsedPass } from './pass-refresh.js';
import { razorpayPassConfigured, webPlanFor } from './pass-razorpay.service.js';
import { resolveChargeCurrency } from '../billing/billing.service.js';
import { reconcileRazorpayPasses, type RazorpayReconcileRun } from './pass-razorpay.service.js';
import {
  PLAY_STATE,
  reconcilePlayPasses,
  type PlayReconcileRun,
} from './pass-play.service.js';

const MS_PER_DAY = 86_400_000;
export const PASS_NOTIFICATION_TYPE = 'aroha_pass';

/** What one tier gives, as the app shows it. */
interface TierBenefits {
  questionsPerPeriod: number;
  /** Free voice-call minutes per period. */
  voiceFreeMinutes: number;
  /** Coins gifted each period; 0 while money.passCoins is off or for a tier without a gift. */
  monthlyCoins?: number;
  /** Reports free each period (Platinum 1); 0 while money.platinumReport is off. */
  freeReportsPerPeriod?: number;
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
  /**
   * The website's Razorpay subscription (money.razorpayPass, and a plan set on the server).
   * Absent otherwise. `amountMinor` is in the minor unit of `currency`.
   */
  web?: { currency: string; amountMinor: number };
  /** The App Store subscription to buy on an iPhone (money.storekit). Absent otherwise. */
  appStore?: { productId: string };
}

/**
 * A Google Play renewal payment that failed: 'grace' = the Pass still works while Google
 * retries, 'hold' = it has stopped until the payment method is fixed in Google Play.
 */
export type PassPaymentIssue = 'grace' | 'hold';

export interface PassStatus {
  /** The Pass page is on for this user (nav.arohaPass). */
  enabled: boolean;
  /** Set when the user's Play Pass renewal payment failed (see PassPaymentIssue). */
  paymentIssue: PassPaymentIssue | null;
  /** The tier of the Pass on hold, to name it in the "fix payment" banner. */
  heldTier: PassTier | null;
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
  /** This period's Platinum free report is still there to take (money.platinumReport). */
  freeReportAvailable: boolean;
}

type Features = Awaited<ReturnType<typeof resolveFeaturesForUser>>;

const benefitsOf = (e: PassEntitlement): TierBenefits => ({
  questionsPerPeriod: e.questions,
  voiceFreeMinutes: e.voiceFreeMinutes,
  reportDiscountPct: e.reportDiscountPct,
  features: e.features,
});

/** Where the website charges this user for a tier, or undefined while the web Pass is off. */
function webOffer(
  features: Features,
  tier: (typeof PASS_TIERS)[number],
  currency: string | null,
): PassOffer['web'] {
  if (!currency || features['money.razorpayPass']?.enabled !== true) return undefined;
  const plan = webPlanFor(tier.tier, currency);
  if (!plan) return undefined;
  const amountMinor =
    plan.currency === 'INR'
      ? (features[tier.key]?.pricePaise ?? tier.fallbackPaise)
      : (plan.amountMinor ?? 0);
  return amountMinor > 0 ? { currency: plan.currency, amountMinor } : undefined;
}

function offersFor(features: Features, webCurrency: string | null = null): PassOffer[] {
  if (features['nav.arohaPass']?.enabled !== true) return [];
  return PASS_TIERS.filter((t) => features[t.key]?.enabled === true).map((t) => ({
    tier: t.tier,
    variant: t.variant,
    pricePaise: features[t.key]?.pricePaise ?? t.fallbackPaise,
    play: { productId: PASS_PLAY_PRODUCT_ID, basePlanId: t.playBasePlan },
    ...(webOffer(features, t, webCurrency) ? { web: webOffer(features, t, webCurrency) } : {}),
    ...(features['money.storekit']?.enabled === true
      ? { appStore: { productId: APP_STORE_PASS_PRODUCTS[t.tier] } }
      : {}),
    questionsPerPeriod: t.questions,
    voiceFreeMinutes: t.voiceFreeMinutes,
    monthlyCoins: features['money.passCoins']?.enabled === true ? t.monthlyCoins : 0,
    freeReportsPerPeriod:
      features['money.platinumReport']?.enabled === true ? t.freeReportsPerPeriod : 0,
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
  let active = await findActivePass(user.id);
  if (!active && (await refreshLapsedPass(user.id))) active = await findActivePass(user.id);
  // On hold: no live Pass, and the newest Play one is held by Google for a failed payment.
  const held =
    active || !features['nav.arohaPass']?.enabled
      ? null
      : await findLatestPlayPass(user.id).catch(() => null);
  const onHold = held?.playState === PLAY_STATE.hold ? held : null;
  const inGrace = active?.source === 'google_play' && active.playState === PLAY_STATE.grace;
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
      questionsLeft: groupQuestionsLeft(user),
      ...benefitsOf(GROUP_ENTITLEMENT),
    };
  }

  // The website's currency for this buyer, only while the web Pass is on and set up.
  const webCurrency =
    features['money.razorpayPass']?.enabled === true && razorpayPassConfigured()
      ? await resolveChargeCurrency(user.id, user.currentCountry ?? user.geoCountry).catch(() => 'INR')
      : null;

  // The Platinum free report, listed on the member's own Pass only while money.platinumReport is on.
  if (pass && features['money.platinumReport']?.enabled === true) {
    const ownTier = pass.tier;
    pass = {
      ...pass,
      freeReportsPerPeriod: PASS_TIERS.find((t) => t.tier === ownTier)?.freeReportsPerPeriod ?? 0,
    };
  }

  return {
    enabled: features['nav.arohaPass']?.enabled === true || inGroup,
    paymentIssue: inGrace ? 'grace' : onHold ? 'hold' : null,
    heldTier: onHold ? entitlementForRow(onHold).tier : null,
    offers: offersFor(features, webCurrency),
    pass,
    questionCredits: user.questionCredits,
    packs: packsFor(features),
    periodDays: PASS_PERIOD_DAYS,
    freeReportAvailable: pass ? await passFreeReportAvailable(user) : false,
  };
}

/**
 * The old wallet purchase. Packs are Google Play only since 2026-10-23 (owner: "they can't
 * recharge it using their current balance"), so this always refuses; the route stays so an
 * open tab gets a clear answer.
 */
export function buyQuestionPack(_user: UserRow, _pack: QuestionPack): Promise<never> {
  return Promise.reject(Errors.forbidden('QUESTION_PACK_PLAY_ONLY'));
}

/**
 * Starts a Google Play purchase of a Question Pack: records the pending order that
 * confirmGooglePlayPurchase (billing.service.ts) matches by (user, product) once Play has
 * charged, and returns the product to launch. Play charges its own fixed price; the order keeps
 * the price the app showed.
 */
export async function startQuestionPackCheckout(
  user: UserRow,
  pack: QuestionPack,
): Promise<{ productId: string; questions: number }> {
  const def = QUESTION_PACKS.find((p) => p.pack === pack)!;
  assertPurchasesAllowed(user);
  const features = await resolveFeaturesForUser(user.id);
  if (features[def.key]?.enabled !== true) throw Errors.forbidden('QUESTION_PACK_NOT_AVAILABLE');
  const price = features[def.key]?.pricePaise ?? def.fallbackPaise;
  await insertOrder({
    userId: user.id,
    packId: def.playProductId,
    amountPaise: price,
    discountPaise: 0,
    finalAmountPaise: price,
    currency: 'INR',
    couponId: null,
    couponCode: null,
    status: 'pending',
    gatewayProvider: 'google_play',
  });
  return { productId: def.playProductId, questions: def.questions };
}

/* -------------------------------------------------------------------------- */
/* Renewals (cron)                                                             */
/* -------------------------------------------------------------------------- */

export interface RenewalRun {
  /** Wallet Passes (from before the Pass went Play-only) that reached their end. */
  lapsed: number;
  reminded: number;
  expired: number;
  /** Play Passes checked with Google (reconcilePlayPasses). */
  play: PlayReconcileRun;
  /** Web Passes checked with Razorpay (reconcileRazorpayPasses, money.razorpayPass). */
  razorpay?: RazorpayReconcileRun;
}

const day = (d: Date) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(d);

/**
 * The hourly Pass job (scripts/cron-pass-renewals.sh). The wallet never pays
 * for the Pass: a wallet Pass from before that rule ends at its period end
 * (even with auto-renew on), with a reminder 3 days before, both pointing at
 * the Google Play subscription. Then every Play Pass at or past its end, in a
 * grace period or on hold is checked with Google (the RTDN webhook normally
 * keeps them in step, but Google sends nothing while it extends a grace
 * period and a notice can be lost), and the remaining wallet rows that are
 * over are expired. Every step is safe to repeat.
 */
export async function runPassRenewals(
  now: Date = new Date(),
  opts: { dryRun?: boolean } = {},
): Promise<RenewalRun> {
  const run: RenewalRun = {
    lapsed: 0,
    reminded: 0,
    expired: 0,
    play: { checked: 0, renewed: 0, ended: 0, failed: 0 },
  };

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

  run.play = await reconcilePlayPasses(now, { dryRun: opts.dryRun });
  run.razorpay = await reconcileRazorpayPasses(now, { dryRun: opts.dryRun }).catch(() => ({
    checked: 0,
    renewed: 0,
    ended: 0,
    failed: 1,
  }));
  if (!opts.dryRun) run.expired = await expireLapsedPasses(now);
  return run;
}
