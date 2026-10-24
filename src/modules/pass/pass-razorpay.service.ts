// =============================================================================
// The Aroha Pass on the website: Razorpay Subscriptions (switch money.razorpayPass, OFF)
// =============================================================================
// Only the plain website sells it this way; inside the Android app the Pass stays Google Play
// (Play's billing rule) and on an iPhone it is the App Store. The flow:
//   1. POST /v1/pass/razorpay/subscribe: a subscription on the owner's monthly plan for the
//      tier (RAZORPAY_PASS_PLANS), our user id and tier in its notes.
//   2. Razorpay Checkout takes the first payment (and the card or UPI mandate for renewals).
//   3. POST /v1/pass/razorpay/verify: the checkout's signature over payment|subscription is
//      checked, the subscription is read back from Razorpay and recorded (pass-store-sync.ts).
//   4. Razorpay's webhook (subscription.* events) and the hourly reconcile keep the row in step:
//      a charge moves the period on, cancelled runs to the end, halted ends it.
// Cancelling from the Pass page stops renewal at the end of the paid month.
// =============================================================================

import { env } from '../../config/env.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import type { UserRow } from '../../db/schema.js';
import { isFeatureOn, resolveFeaturesForUser } from '../features/features.service.js';
import { resolveChargeCurrency } from '../billing/billing.service.js';
import {
  cancelRazorpaySubscription,
  createRazorpaySubscription,
  fetchRazorpaySubscription,
  getRazorpayKeyId,
  isRazorpayConfigured,
  verifyRazorpaySubscriptionSignature,
  verifyRazorpayWebhookSignature,
  type RazorpaySubscription,
} from '../billing/razorpay.js';
import { PASS_PERIOD_DAYS, PASS_TIERS, type PassTier, type PassTierDef } from './pass.config.js';
import {
  findActivePass,
  findLapsedStorePass,
  listStorePassesToReconcile,
  updateStorePass,
} from './pass.repo.js';
import { syncStorePass, type StoreSnapshot, type StoreSyncResult } from './pass-store-sync.js';

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;
/** Monthly charges a subscription may make (Razorpay needs a count): ten years = until cancelled. */
const TOTAL_CHARGES = 120;
/** How long after its end a lapsed Razorpay Pass is still checked (Razorpay retries for days). */
const WATCH_DAYS = 5;
const REFRESH_EVERY_MS = 10 * MS_PER_MINUTE;

/** Razorpay statuses with a mandate that will charge again. */
const RENEWING = new Set(['authenticated', 'active', 'pending']);

/** One tier's plan in one currency: the plan id, and for a non-rupee plan the amount it charges. */
interface WebPlan {
  id: string;
  currency: string;
  /** Minor units (cents, pence); for INR the admin price is shown instead. */
  amountMinor: number | null;
}

/**
 * RAZORPAY_PASS_PLANS, read once: {"gold":{"INR":"plan_x","USD":{"id":"plan_y","amount":499}}}.
 * A bad value means no web plans (logged), never a crash.
 */
let plansCache: Record<string, Record<string, WebPlan>> | null = null;
export function razorpayPassPlans(): Record<string, Record<string, WebPlan>> {
  if (plansCache) return plansCache;
  const out: Record<string, Record<string, WebPlan>> = {};
  try {
    const raw = env.RAZORPAY_PASS_PLANS ? (JSON.parse(env.RAZORPAY_PASS_PLANS) as unknown) : {};
    for (const [tier, byCurrency] of Object.entries(raw as Record<string, unknown>)) {
      if (!byCurrency || typeof byCurrency !== 'object') continue;
      for (const [currency, value] of Object.entries(byCurrency as Record<string, unknown>)) {
        const id = typeof value === 'string' ? value : (value as { id?: unknown })?.id;
        const amount = typeof value === 'object' ? (value as { amount?: unknown })?.amount : null;
        if (typeof id !== 'string' || !id.startsWith('plan_')) continue;
        (out[tier] ??= {})[currency.toUpperCase()] = {
          id,
          currency: currency.toUpperCase(),
          amountMinor: typeof amount === 'number' && amount > 0 ? Math.round(amount) : null,
        };
      }
    }
  } catch (err) {
    logger.error({ err }, 'pass: RAZORPAY_PASS_PLANS is not valid JSON, the web Pass is unavailable');
  }
  plansCache = out;
  return out;
}

/** For tests: forget the parsed plans. */
export function resetRazorpayPassPlans(): void {
  plansCache = null;
}

/**
 * The plan a buyer subscribes to: the tier's plan in their currency when it exists with its
 * amount, else the tier's rupee plan (Razorpay takes international cards in rupees too).
 */
export function webPlanFor(tier: PassTier, currency: string): WebPlan | null {
  const plans = razorpayPassPlans()[tier];
  if (!plans) return null;
  const own = plans[currency];
  if (own && (currency === 'INR' || own.amountMinor)) return own;
  return plans.INR ?? null;
}

function tierOfPlan(planId: string): PassTierDef | null {
  for (const [tier, byCurrency] of Object.entries(razorpayPassPlans())) {
    if (Object.values(byCurrency).some((p) => p.id === planId))
      return PASS_TIERS.find((t) => t.tier === tier) ?? null;
  }
  return null;
}

/** The web Pass can be sold: Razorpay keys and at least one plan are set on the server. */
export function razorpayPassConfigured(): boolean {
  return isRazorpayConfigured() && Object.keys(razorpayPassPlans()).length > 0;
}

async function requireWebPass(userId: string): Promise<void> {
  const on = await isFeatureOn(userId, 'money.razorpayPass').catch(() => false);
  if (!on) throw Errors.forbidden('FEATURE_DISABLED');
  if (!razorpayPassConfigured()) throw Errors.conflict('PASS_WEB_NOT_CONFIGURED');
}

/** What Razorpay says about a subscription, as a store snapshot. */
export function razorpaySnapshot(
  sub: RazorpaySubscription,
  now: Date = new Date(),
  opts: { paidJustNow?: boolean } = {},
): StoreSnapshot {
  const tier =
    PASS_TIERS.find((t) => t.tier === sub.notes?.tier) ?? tierOfPlan(sub.plan_id) ?? null;
  let start = sub.current_start ? new Date(sub.current_start * 1000) : null;
  let end = sub.current_end ? new Date(sub.current_end * 1000) : null;
  // Straight after checkout Razorpay can still say "authenticated" with no period yet. The
  // checkout's signature proved the first payment, so the Pass starts now for one period; the
  // first charge notice then sets Razorpay's own dates.
  if (!end && opts.paidJustNow && RENEWING.has(sub.status)) {
    start = now;
    end = new Date(now.getTime() + PASS_PERIOD_DAYS * MS_PER_DAY);
  }
  const stopped = sub.status === 'halted' || sub.status === 'expired';
  const cancelled = sub.status === 'cancelled' || sub.status === 'completed';
  const paidUntilLater = end !== null && end > now;
  return {
    source: 'razorpay',
    externalId: sub.id,
    userId: sub.notes?.user_id ?? null,
    tier,
    live: !stopped && paidUntilLater && (RENEWING.has(sub.status) || cancelled),
    autoRenew: RENEWING.has(sub.status),
    periodStart: start,
    periodEnd: end,
    state: sub.status,
    cancelled,
    ended: stopped || (cancelled && !paidUntilLater),
    orderId: sub.paid_count != null ? `${sub.id}:${sub.paid_count}` : null,
  };
}

export interface WebPassCheckout {
  subscriptionId: string;
  keyId: string;
  tier: PassTier;
  currency: string;
  /** What the first month charges, in the minor unit of `currency`. */
  amountMinor: number;
}

/** Step 1: a subscription for this user on the tier's plan. */
export async function startRazorpayPass(
  user: UserRow,
  tier: PassTier,
  opts: { country?: string | null; currency?: string } = {},
): Promise<WebPassCheckout> {
  await requireWebPass(user.id);
  const def = PASS_TIERS.find((t) => t.tier === tier);
  const features = await resolveFeaturesForUser(user.id);
  if (!def || features['nav.arohaPass']?.enabled !== true || features[def.key]?.enabled !== true)
    throw Errors.badRequest('PASS_TIER_NOT_AVAILABLE');
  if (await findActivePass(user.id)) throw Errors.conflict('PASS_ALREADY_ACTIVE');

  const currency = await resolveChargeCurrency(user.id, opts.country, opts.currency);
  const plan = webPlanFor(tier, currency);
  if (!plan) throw Errors.conflict('PASS_WEB_NOT_CONFIGURED');
  const sub = await createRazorpaySubscription({
    planId: plan.id,
    totalCount: TOTAL_CHARGES,
    notes: { user_id: user.id, tier },
  });
  return {
    subscriptionId: sub.id,
    keyId: getRazorpayKeyId(),
    tier,
    currency: plan.currency,
    amountMinor:
      plan.currency === 'INR'
        ? (features[def.key]?.pricePaise ?? def.fallbackPaise)
        : (plan.amountMinor ?? 0),
  };
}

/** Step 3: the checkout says it was paid. Trusts nothing but the signature and Razorpay itself. */
export async function confirmRazorpayPass(
  userId: string,
  body: { razorpayPaymentId: string; razorpaySubscriptionId: string; razorpaySignature: string },
  now: Date = new Date(),
): Promise<StoreSyncResult> {
  await requireWebPass(userId);
  const signed = verifyRazorpaySubscriptionSignature({
    razorpayPaymentId: body.razorpayPaymentId,
    razorpaySubscriptionId: body.razorpaySubscriptionId,
    signature: body.razorpaySignature,
  });
  if (!signed) throw Errors.badRequest('Payment could not be verified');
  const sub = await fetchRazorpaySubscription(body.razorpaySubscriptionId);
  if (sub.notes?.user_id !== userId) throw Errors.forbidden('PASS_SUBSCRIPTION_OTHER_ACCOUNT');
  const result = await syncStorePass(razorpaySnapshot(sub, now, { paidJustNow: true }), now);
  if (!result.recorded) throw Errors.conflict('PASS_PAYMENT_PENDING');
  return result;
}

/** Stops the member's web Pass from renewing; it runs to the end of the paid month. */
export async function cancelRazorpayPass(userId: string, now: Date = new Date()): Promise<void> {
  const row = await findActivePass(userId);
  if (!row || row.source !== 'razorpay' || !row.externalId) throw Errors.notFound('NO_WEB_PASS');
  if (!row.autoRenew) return;
  const sub = await cancelRazorpaySubscription(row.externalId, true);
  await updateStorePass(row.id, { autoRenew: false, cancelledAt: now, playState: sub.status });
}

/**
 * Razorpay's webhook. True when the event was taken care of (or is not ours); throws only when
 * Razorpay or the database could not be reached, so the route answers 500 and Razorpay retries.
 */
export async function handleRazorpayWebhook(
  rawBody: string,
  signature: string | undefined,
  now: Date = new Date(),
): Promise<'ok' | 'bad_signature'> {
  if (!verifyRazorpayWebhookSignature(rawBody, signature)) return 'bad_signature';
  let event: { event?: string; payload?: { subscription?: { entity?: { id?: string } } } };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return 'ok';
  }
  const id = event.payload?.subscription?.entity?.id;
  if (!event.event?.startsWith('subscription.') || !id) return 'ok';
  // Read back rather than trust the body: notices can arrive out of order.
  const sub = await fetchRazorpaySubscription(id);
  const result = await syncStorePass(razorpaySnapshot(sub, now), now);
  if (!result.recorded) {
    logger.info({ event: event.event, subscriptionId: id, status: sub.status }, 'pass: Razorpay notice with nothing to record');
  }
  return 'ok';
}

/**
 * Asks Razorpay about the user's web Pass when it has just reached its end without a charge
 * notice. At most once every 10 minutes per Pass. True when the user has a live Pass after.
 * Never throws, and does nothing (no database read) while the web Pass is not set up.
 */
export async function refreshLapsedRazorpayPass(
  userId: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!razorpayPassConfigured()) return false;
  try {
    const row = await findLapsedStorePass(
      userId,
      'razorpay',
      now,
      new Date(now.getTime() - REFRESH_EVERY_MS),
      WATCH_DAYS,
    );
    if (!row?.externalId) return false;
    const snap = razorpaySnapshot(await fetchRazorpaySubscription(row.externalId), now);
    await syncStorePass(snap, now);
    return snap.live;
  } catch (err) {
    logger.warn({ err, userId }, 'pass: on-demand Razorpay check failed');
    return false;
  }
}

export interface RazorpayReconcileRun {
  checked: number;
  renewed: number;
  ended: number;
  failed: number;
}

/** The hourly safety net for web Passes about to renew or just past their end. */
export async function reconcileRazorpayPasses(
  now: Date = new Date(),
  opts: { dryRun?: boolean } = {},
): Promise<RazorpayReconcileRun> {
  const run: RazorpayReconcileRun = { checked: 0, renewed: 0, ended: 0, failed: 0 };
  if (!razorpayPassConfigured()) return run;
  const rows = await listStorePassesToReconcile(
    'razorpay',
    new Date(now.getTime() + 60 * MS_PER_MINUTE),
    new Date(now.getTime() - WATCH_DAYS * MS_PER_DAY),
  );
  for (const row of rows) {
    if (!row.externalId) continue;
    run.checked += 1;
    if (opts.dryRun) continue;
    try {
      const snap = razorpaySnapshot(await fetchRazorpaySubscription(row.externalId), now);
      const result = await syncStorePass(snap, now);
      if (result.renewed) run.renewed += 1;
      if (snap.ended) run.ended += 1;
    } catch (err) {
      run.failed += 1;
      logger.warn({ err, passId: row.id }, 'pass: Razorpay reconcile failed for one Pass');
    }
  }
  return run;
}
