import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import { Errors } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

/**
 * Razorpay's Orders + signature APIs, over plain `fetch` — the `razorpay` npm
 * SDK is a thin wrapper over these two calls and would be the only reason to
 * add a dependency here.
 */

function credentials(): { keyId: string; keySecret: string } {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw Errors.forbidden('Online payments are not enabled.');
  return { keyId, keySecret };
}

/** The publishable key id, safe to hand to the browser. Throws if the gateway isn't configured. */
export function getRazorpayKeyId(): string {
  return credentials().keyId;
}

export function isRazorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

/** Creates an order on Razorpay and returns its id (`order_...`). Amount is in paise. */
export async function createRazorpayOrder(params: {
  amountPaise: number;
  currency: string;
  receipt: string;
}): Promise<string> {
  const { keyId, keySecret } = credentials();
  // Razorpay's own floor; below this the gateway rejects the order outright.
  if (params.amountPaise < 100) throw Errors.badRequest('Amount must be at least ₹1');

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      amount: params.amountPaise,
      currency: params.currency,
      receipt: params.receipt,
    }),
  });

  if (!res.ok) {
    // Deliberately a 500 either way: a 401 here means OUR gateway credentials
    // are wrong, which is a server misconfiguration, not the caller's fault.
    logger.error(
      { status: res.status, body: await res.text().catch(() => '') },
      'Razorpay order creation failed',
    );
    throw Errors.internal('Could not start the payment. Please try again.');
  }

  const order = (await res.json()) as { id?: string };
  if (!order.id) throw Errors.internal('Payment gateway returned no order id');
  return order.id;
}

export interface RazorpayPayment {
  id: string;
  status: string;
}

/**
 * Lists the payments Razorpay has recorded against one of OUR orders — used by the
 * reconciliation sweep (billing.service.ts's reconcileStaleRazorpayOrders) to find a payment
 * that was actually captured on Razorpay's side but never reached
 * POST /billing/razorpay/verify (browser killed/lost connectivity between capture and that
 * call). Returns [] on a 404 (order id Razorpay doesn't recognize) rather than throwing — a
 * reconciliation sweep must never let one bad order abort the rest of the batch.
 */
export async function fetchRazorpayOrderPayments(
  razorpayOrderId: string,
): Promise<RazorpayPayment[]> {
  const { keyId, keySecret } = credentials();
  const res = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}/payments`, {
    headers: { authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` },
  });

  if (!res.ok) {
    logger.warn({ razorpayOrderId, status: res.status }, 'Razorpay order-payments lookup failed');
    return [];
  }

  const body = (await res.json()) as { items?: RazorpayPayment[] };
  return body.items ?? [];
}

/**
 * True when `signature` is Razorpay's HMAC-SHA256 of `<order_id>|<payment_id>`
 * keyed with our secret — i.e. the payment really was completed on Razorpay's
 * side and the client didn't just POST us a made-up payment id.
 */
export function verifyRazorpaySignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  const { keySecret } = credentials();
  const expected = createHmac('sha256', keySecret)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest('hex');
  const given = Buffer.from(params.signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

// -----------------------------------------------------------------------------
// Razorpay Subscriptions (the Aroha Pass on the website, switch money.razorpayPass)
// -----------------------------------------------------------------------------

function basicAuth(): string {
  const { keyId, keySecret } = credentials();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

/** The fields of a Razorpay subscription this code reads. Times are Unix seconds. */
export interface RazorpaySubscription {
  id: string;
  /** created | authenticated | active | pending | halted | cancelled | completed | expired | paused */
  status: string;
  plan_id: string;
  current_start: number | null;
  current_end: number | null;
  ended_at?: number | null;
  paid_count?: number;
  notes?: Record<string, string> | null;
}

async function razorpayJson<T>(path: string, init: RequestInit, what: string): Promise<T> {
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...init,
    headers: { authorization: basicAuth(), 'content-type': 'application/json', ...init.headers },
  });
  if (!res.ok) {
    logger.error({ status: res.status, body: await res.text().catch(() => '') }, `Razorpay ${what} failed`);
    throw Errors.internal('The payment service could not be reached. Please try again.');
  }
  return (await res.json()) as T;
}

/**
 * Starts a monthly subscription on one of the owner's plans. `totalCount` is how many monthly
 * charges Razorpay may make before it stops (Razorpay needs a number; 120 = ten years, in effect
 * "until cancelled"). The notes carry our user id and tier, so a webhook can be matched back.
 */
export async function createRazorpaySubscription(params: {
  planId: string;
  totalCount: number;
  notes: Record<string, string>;
}): Promise<RazorpaySubscription> {
  return razorpayJson<RazorpaySubscription>(
    '/subscriptions',
    {
      method: 'POST',
      body: JSON.stringify({
        plan_id: params.planId,
        total_count: params.totalCount,
        customer_notify: 1,
        notes: params.notes,
      }),
    },
    'subscription creation',
  );
}

export async function fetchRazorpaySubscription(id: string): Promise<RazorpaySubscription> {
  return razorpayJson<RazorpaySubscription>(
    `/subscriptions/${encodeURIComponent(id)}`,
    { method: 'GET' },
    'subscription lookup',
  );
}

/** Stops renewal. At the cycle end by default: the member keeps what was paid for. */
export async function cancelRazorpaySubscription(
  id: string,
  atCycleEnd = true,
): Promise<RazorpaySubscription> {
  return razorpayJson<RazorpaySubscription>(
    `/subscriptions/${encodeURIComponent(id)}/cancel`,
    { method: 'POST', body: JSON.stringify({ cancel_at_cycle_end: atCycleEnd ? 1 : 0 }) },
    'subscription cancel',
  );
}

function hmacEquals(secret: string, payload: string, signature: string): boolean {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const given = Buffer.from(signature, 'utf8');
  const wanted = Buffer.from(expected, 'utf8');
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * The checkout's proof of a subscription payment: Razorpay's HMAC-SHA256 of
 * `<payment_id>|<subscription_id>` keyed with our secret.
 */
export function verifyRazorpaySubscriptionSignature(params: {
  razorpayPaymentId: string;
  razorpaySubscriptionId: string;
  signature: string;
}): boolean {
  const { keySecret } = credentials();
  return hmacEquals(
    keySecret,
    `${params.razorpayPaymentId}|${params.razorpaySubscriptionId}`,
    params.signature,
  );
}

/**
 * A webhook is Razorpay's when `X-Razorpay-Signature` is the HMAC-SHA256 of the raw body keyed
 * with the webhook secret. False (never throws) without a secret configured.
 */
export function verifyRazorpayWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  return hmacEquals(secret, rawBody, signature);
}
