// =============================================================================
// Google Play refunds — find them, and take back what the refunded money paid for
// =============================================================================
// No app can stop a Google Play refund: within 48 hours Google decides alone,
// later the buyer asks us, and a bank chargeback can come at any time. Until
// this existed the app never heard about any of them, so a refunded ₹100 stayed
// in the wallet (seen 2026-10-16: refunded, then spent on a Marriage report).
//
// Two ways a refund reaches us:
//   - Google's voided-purchases list (last 30 days), read every hour by
//     POST /cron/play-refunds. This is the one that never misses: it also
//     lists chargebacks and refunds made from the Play Console.
//   - The RTDN `voidedPurchaseNotification`, pushed the moment Google voids a
//     purchase (only when "voided purchases" is ticked in the Play Console).
// Both call recordVoidedPurchase, which is safe to run twice for one refund.
//
// What happens to a refund depends on the switch `paid.refundClawback` (off by
// default, can be tried on an admin group first):
//   - off: the refund is only recorded ('recorded') and the admin is told what
//     would have been taken back. Turning the switch on later takes back
//     every recorded refund on the next hourly run.
//   - on: the order becomes `refunded`; the wallet loses the price plus any
//     recharge bonus, or a Question Pack's questions, even below zero (every
//     spend needs balance >= price, so a negative wallet blocks spending until
//     rewards or a recharge pay it off); reports bought with that money close
//     until then; the user gets a notice; and a second refund blocks new
//     purchases until an admin unblocks the account.
// A refunded Aroha Pass is not ours to end: Google revokes the subscription,
// and re-syncing it here makes the Pass stop at once. It still counts as a
// refund for the repeat-refunder rule.

import { getAndroidPublisher, GOOGLE_PLAY_PACKAGE_NAME } from '../../config/google-play.js';
import type { OrderRow, PlayRefundRow } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { notifyPlayRefund } from '../../lib/notifications/telegram.js';
import { resolveFeaturesForUser } from '../features/features.service.js';
import {
  PASS_PLAY_PRODUCT_ID,
  QUESTION_PACKS,
  questionPackForProduct,
} from '../pass/pass.config.js';
import { handlePlaySubscriptionNotification } from '../pass/pass-play.service.js';
import { findPassByExternalId } from '../pass/pass.repo.js';
import { findActiveUserById } from '../users/users.repo.js';
import { fetchGooglePlayPurchase } from './google-play-verifier.js';
import { formatPaise, playRefundNoticeCopy } from './play-refund-notices.js';
import {
  bonusGrantedFor,
  clawBackOrder,
  countPlayRefundsForUser,
  findOrderByPurchaseToken,
  findPlayRefundByKey,
  insertPlayRefund,
  listRecordedPlayRefunds,
  setPurchasesBlocked,
  updatePlayRefund,
} from './play-refunds.repo.js';
import { TOP_UP_AMOUNTS } from './top-up-amounts.js';

export const REFUND_CLAWBACK_KEY = 'paid.refundClawback';
/** A second refund blocks new purchases. */
export const REFUNDS_BEFORE_BLOCK = 2;
/** Google keeps voided purchases for 30 days; ask for a little less so the request is valid. */
const LOOKBACK_MS = 30 * 86_400_000 - 3_600_000;
const PAGE_SIZE = 1000;

const VOIDED_REASONS = [
  'other',
  'changed their mind',
  'not received',
  'defective',
  'bought by accident',
  'fraud',
  'friendly fraud',
  'bank chargeback',
  // Google refunds a payment nobody acknowledged within 3 days: the app never
  // confirmed it, so the buyer never got what they paid for.
  'never confirmed by the app',
];
const VOIDED_SOURCES = ['the buyer', 'us (Play Console)', 'Google'];

export interface VoidedPurchase {
  purchaseToken: string;
  googleOrderId: string | null;
  voidedAt: Date | null;
  purchasedAt: Date | null;
  voidedSource: number | null;
  voidedReason: number | null;
  detectedVia: 'voided_api' | 'rtdn';
}

export type RefundOutcome =
  | 'recorded'
  | 'clawed_back'
  | 'skipped'
  | 'pass'
  | 'not_credited'
  | 'unmatched'
  | 'seen';

/** Every one-time product the app sells: wallet top-ups and Question Packs. */
const ONE_TIME_PRODUCTS = [
  ...TOP_UP_AMOUNTS.map((a) => ({
    productId: a.id,
    pricePaise: a.amountPaise,
  })),
  ...QUESTION_PACKS.map((p) => ({
    productId: p.playProductId,
    pricePaise: p.fallbackPaise,
  })),
];

/**
 * Who bought a purchase we hold no order for, and what. Google's refund list
 * carries only the token, so this asks Google about it under each product id
 * until one answers; the purchase names the buyer (obfuscatedAccountId). Null
 * when no product matches or the purchase carries no buyer.
 */
async function identifyPurchase(
  purchaseToken: string,
): Promise<{ productId: string; pricePaise: number; userId: string } | null> {
  for (const product of ONE_TIME_PRODUCTS) {
    try {
      const purchase = await fetchGooglePlayPurchase({
        productId: product.productId,
        purchaseToken,
      });
      const userId = purchase.obfuscatedExternalAccountId;
      // A buyer whose account has since been deleted cannot be linked.
      if (!userId || !(await findActiveUserById(userId).catch(() => undefined))) return null;
      return { ...product, userId };
    } catch {
      // Not this product (Google answers 400/404); try the next one.
    }
  }
  return null;
}

function reasonText(v: { voidedReason: number | null; voidedSource: number | null }): string {
  const reason = v.voidedReason !== null ? VOIDED_REASONS[v.voidedReason] : undefined;
  const source = v.voidedSource !== null ? VOIDED_SOURCES[v.voidedSource] : undefined;
  if (reason && source) return `${reason} (refunded by ${source})`;
  return reason ?? (source ? `refunded by ${source}` : 'not given');
}

function productName(productId: string): string {
  const pack = questionPackForProduct(productId);
  if (pack) return `Question Pack (${pack.questions} questions)`;
  const amount = TOP_UP_AMOUNTS.find((a) => a.id === productId);
  return amount ? `${amount.label} recharge` : productId;
}

function productLabel(order: OrderRow): string {
  return productName(order.packId);
}

const NOT_CREDITED_OUTCOME =
  'nothing to take back: the app never confirmed this payment, so it was never credited (lost sale)';

/** A refund of a payment the app never credited: who and what, for the admin; never counted against the buyer. */
function notCreditedPatch(found: { productId: string; pricePaise: number; userId: string }) {
  return {
    kind: questionPackForProduct(found.productId) ? 'question_pack' : 'top_up',
    productId: found.productId,
    userId: found.userId,
    amountPaise: found.pricePaise,
    status: 'not_credited',
  };
}

async function clawbackOnFor(userId: string): Promise<boolean> {
  const features = await resolveFeaturesForUser(userId);
  return features[REFUND_CLAWBACK_KEY]?.enabled === true;
}

async function alert(
  row: Pick<PlayRefundRow, 'userId' | 'googleOrderId' | 'voidedReason' | 'voidedSource'>,
  product: string,
  amountPaise: number,
  outcome: string,
): Promise<void> {
  const user = row.userId ? await findActiveUserById(row.userId).catch(() => undefined) : undefined;
  await notifyPlayRefund({
    userId: row.userId,
    name: user?.displayName ?? null,
    contact: user?.phoneE164 ?? user?.email ?? null,
    product,
    amountPaise,
    googleOrderId: row.googleOrderId,
    reason: reasonText(row),
    outcome,
  }).catch((err: unknown) => logger.warn({ err }, 'play-refunds: Telegram alert failed'));
}

/** Blocks purchases on the second refund. True when this call blocked the account. */
async function blockIfRepeat(userId: string): Promise<boolean> {
  const user = await findActiveUserById(userId);
  if (!user || user.purchasesBlockedAt) return false;
  if ((await countPlayRefundsForUser(userId)) < REFUNDS_BEFORE_BLOCK) return false;
  await setPurchasesBlocked(userId, true);
  return true;
}

/**
 * Takes back a recorded top-up or Question Pack refund. Only call with the
 * switch on for the row's user.
 */
async function applyClawback(row: PlayRefundRow, order: OrderRow): Promise<RefundOutcome> {
  const result = await clawBackOrder(order, {
    walletPaise: row.amountPaise,
    questions: row.questionCredits,
  });
  const product = productLabel(order);
  if (!result) {
    // The push notice and the hourly check can reach the same refund together; the
    // one that lost the race must not overwrite the other's 'clawed_back'.
    const fresh = await findPlayRefundByKey(row.refundKey);
    if (fresh?.status === 'clawed_back') return 'seen';
    await updatePlayRefund(row.id, { status: 'skipped' });
    await alert(
      row,
      product,
      row.amountPaise,
      `nothing taken: our order was already ${order.status}`,
    );
    return 'skipped';
  }

  await updatePlayRefund(row.id, {
    status: 'clawed_back',
    clawedBackPaise: row.amountPaise,
    clawedBackQuestions: row.questionCredits,
    clawedBackAt: new Date(),
    reportsLocked: result.reportsLocked,
  });

  const user = await findActiveUserById(order.userId).catch(() => undefined);
  const notice =
    row.questionCredits > 0 ? 'questions' : result.walletBalancePaise < 0 ? 'debt' : 'wallet';
  await notifyUser(order.userId, {
    ...playRefundNoticeCopy(notice, user?.locale, {
      amountPaise: row.amountPaise,
      balancePaise: result.walletBalancePaise,
      questions: row.questionCredits,
    }),
    type: 'play_refund',
    link: '/profile/orders',
  });

  const blocked = await blockIfRepeat(order.userId);
  const taken =
    row.questionCredits > 0
      ? `${row.questionCredits} questions taken back, ${result.questionCredits} left`
      : `${formatPaise(row.amountPaise)} taken back, wallet now ${formatPaise(result.walletBalancePaise)}`;
  const extras = [
    result.reportsLocked > 0
      ? `${result.reportsLocked} report${result.reportsLocked === 1 ? '' : 's'} locked until paid`
      : null,
    blocked ? 'second refund: purchases now blocked' : null,
  ].filter(Boolean);
  await alert(row, product, row.amountPaise, [taken, ...extras].join('; '));
  return 'clawed_back';
}

/**
 * Records one refunded Google purchase and acts on it. Safe to call again for
 * the same refund (the hourly list and the push notice both see it): a refund
 * already acted on is left alone, and one recorded with the switch off is taken
 * back once the switch is on for that user.
 */
export async function recordVoidedPurchase(v: VoidedPurchase): Promise<RefundOutcome> {
  const refundKey = v.googleOrderId ?? `token:${v.purchaseToken}`;
  const existing = await findPlayRefundByKey(refundKey);
  if (existing) {
    // Recorded before purchases we hold no order for were looked up with Google.
    if (existing.status === 'unmatched') {
      const found = await identifyPurchase(existing.purchaseToken);
      if (!found) return 'seen';
      await updatePlayRefund(existing.id, notCreditedPatch(found));
      await alert(
        { ...existing, userId: found.userId },
        productName(found.productId),
        found.pricePaise,
        NOT_CREDITED_OUTCOME,
      );
      return 'not_credited';
    }
    if (existing.status !== 'recorded' || !existing.userId || !existing.orderId) return 'seen';
    const order = await findOrderByPurchaseToken(existing.purchaseToken);
    if (!order || !(await clawbackOnFor(existing.userId))) return 'seen';
    return applyClawback(existing, order);
  }

  const base = {
    refundKey,
    purchaseToken: v.purchaseToken,
    googleOrderId: v.googleOrderId,
    voidedAt: v.voidedAt,
    purchasedAt: v.purchasedAt,
    voidedSource: v.voidedSource,
    voidedReason: v.voidedReason,
    detectedVia: v.detectedVia,
  };

  const order = await findOrderByPurchaseToken(v.purchaseToken);
  if (!order) {
    const pass = await findPassByExternalId(v.purchaseToken);
    if (pass) {
      const row = await insertPlayRefund({
        ...base,
        kind: 'pass',
        productId: PASS_PLAY_PRODUCT_ID,
        userId: pass.userId,
        amountPaise: pass.pricePaise,
        status: 'pass',
      });
      if (!row) return 'seen';
      // Google revokes a refunded subscription; asking it now ends the Pass at once.
      await handlePlaySubscriptionNotification({
        notificationType: 0,
        purchaseToken: v.purchaseToken,
        subscriptionId: PASS_PLAY_PRODUCT_ID,
      }).catch((err: unknown) =>
        logger.warn({ err }, 'play-refunds: could not re-sync a refunded Pass'),
      );
      const blocked = (await clawbackOnFor(pass.userId)) && (await blockIfRepeat(pass.userId));
      await alert(
        row,
        'Aroha Pass',
        pass.pricePaise,
        `Pass checked with Google (a refunded Pass ends)${blocked ? '; second refund: purchases now blocked' : ''}`,
      );
      return 'pass';
    }
    // No order holds this token: the app never confirmed the payment, so nothing
    // was credited (Google refunds such a payment by itself after 3 days).
    const found = await identifyPurchase(v.purchaseToken);
    if (found) {
      const row = await insertPlayRefund({ ...base, ...notCreditedPatch(found) });
      if (!row) return 'seen';
      await alert(row, productName(found.productId), found.pricePaise, NOT_CREDITED_OUTCOME);
      return 'not_credited';
    }
    const row = await insertPlayRefund({ ...base, kind: 'unknown', status: 'unmatched' });
    if (!row) return 'seen';
    await alert(row, 'unknown purchase', 0, 'no order or Pass in our database has this purchase');
    return 'unmatched';
  }

  const pack = questionPackForProduct(order.packId);
  const amountPaise = pack ? 0 : order.amountPaise + (await bonusGrantedFor(order));
  const row = await insertPlayRefund({
    ...base,
    kind: pack ? 'question_pack' : 'top_up',
    productId: order.packId,
    userId: order.userId,
    orderId: order.id,
    amountPaise,
    questionCredits: pack?.questions ?? 0,
    status: 'recorded',
  });
  if (!row) return 'seen';

  if (await clawbackOnFor(order.userId)) return applyClawback(row, order);

  const wouldTake = pack ? `${pack.questions} questions` : formatPaise(amountPaise);
  await alert(
    row,
    productLabel(order),
    order.amountPaise,
    `recorded only (switch ${REFUND_CLAWBACK_KEY} is off): would take back ${wouldTake}`,
  );
  return 'recorded';
}

function millis(value: string | null | undefined): Date | null {
  const n = Number(value);
  return value && Number.isFinite(n) ? new Date(n) : null;
}

export interface PlayRefundCheckResult {
  checked: number;
  recorded: number;
  clawedBack: number;
  pass: number;
  unmatched: number;
  skipped: number;
  /** Payments the app never confirmed, which Google refunded by itself. */
  notCredited: number;
}

/**
 * The hourly check: reads Google's voided purchases from the last 30 days
 * (top-ups, packs and Pass payments alike), records each new one, and takes
 * back refunds recorded earlier whose user now has the switch on.
 */
export async function runPlayRefundCheck(now: Date = new Date()): Promise<PlayRefundCheckResult> {
  const result: PlayRefundCheckResult = {
    checked: 0,
    recorded: 0,
    clawedBack: 0,
    pass: 0,
    unmatched: 0,
    skipped: 0,
    notCredited: 0,
  };
  const count = (outcome: RefundOutcome) => {
    if (outcome === 'recorded') result.recorded++;
    else if (outcome === 'clawed_back') result.clawedBack++;
    else if (outcome === 'pass') result.pass++;
    else if (outcome === 'unmatched') result.unmatched++;
    else if (outcome === 'skipped') result.skipped++;
    else if (outcome === 'not_credited') result.notCredited++;
  };

  const client = getAndroidPublisher();
  let pageToken: string | undefined;
  do {
    const { data } = await client.purchases.voidedpurchases.list({
      packageName: GOOGLE_PLAY_PACKAGE_NAME,
      startTime: String(now.getTime() - LOOKBACK_MS),
      // 1 = subscriptions too, so a refunded Pass payment counts toward the repeat rule.
      type: 1,
      maxResults: PAGE_SIZE,
      token: pageToken,
    });
    for (const v of data.voidedPurchases ?? []) {
      if (!v.purchaseToken) continue;
      result.checked++;
      try {
        count(
          await recordVoidedPurchase({
            purchaseToken: v.purchaseToken,
            googleOrderId: v.orderId ?? null,
            voidedAt: millis(v.voidedTimeMillis),
            purchasedAt: millis(v.purchaseTimeMillis),
            voidedSource: v.voidedSource ?? null,
            voidedReason: v.voidedReason ?? null,
            detectedVia: 'voided_api',
          }),
        );
      } catch (err) {
        logger.error(
          { err, tokenSuffix: v.purchaseToken.slice(-8) },
          'play-refunds: could not handle a voided purchase',
        );
      }
    }
    pageToken = data.tokenPagination?.nextPageToken ?? undefined;
  } while (pageToken);

  // Refunds recorded with the switch off that have since dropped out of Google's 30 days.
  for (const row of await listRecordedPlayRefunds()) {
    try {
      const outcome = await recordVoidedPurchase({
        purchaseToken: row.purchaseToken,
        googleOrderId: row.googleOrderId,
        voidedAt: row.voidedAt,
        purchasedAt: row.purchasedAt,
        voidedSource: row.voidedSource,
        voidedReason: row.voidedReason,
        detectedVia: 'voided_api',
      });
      count(outcome);
    } catch (err) {
      logger.error({ err, id: row.id }, 'play-refunds: could not take back a recorded refund');
    }
  }

  return result;
}

/**
 * The RTDN push for a voided purchase. Google sends no reason here; the hourly
 * list fills nothing in later either, since the row already exists, which is
 * fine: the reason is for the admin's information only.
 */
export async function handleVoidedPurchaseNotification(n: {
  purchaseToken: string;
  orderId?: string;
}): Promise<void> {
  try {
    await recordVoidedPurchase({
      purchaseToken: n.purchaseToken,
      googleOrderId: n.orderId ?? null,
      voidedAt: new Date(),
      purchasedAt: null,
      voidedSource: null,
      voidedReason: null,
      detectedVia: 'rtdn',
    });
  } catch (err) {
    logger.error(
      { err, tokenSuffix: n.purchaseToken.slice(-8) },
      'play-refunds: RTDN voided purchase handling failed',
    );
  }
}
