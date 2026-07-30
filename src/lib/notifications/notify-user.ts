// =============================================================================
// Shared "notify a user" helper — Bell inbox persistence + FCM push, together
// =============================================================================
// Before this existed, most push-send call sites (notifyReportReady,
// notifyPurchasePlanReady, notifyPalmReadingReady, the period-reading
// broadcast, the admin telegram broadcast) only ever called sendPush/
// sendPushBatch directly — nothing was written to the `notifications` table,
// so if a user missed/dismissed the OS push, it was gone forever and the Bell
// sheet (components/NotificationsSheet.tsx) never showed it. Only the
// referral-bonus push (users.service.ts) and the transit pre-alert
// (transit-alert.service.ts/.repo.ts) happened to hand-roll a `notifications`
// insert alongside their push send. This module gives every call site (new
// and existing) one place that does both, so the Bell and the OS push can
// never drift apart again.
// =============================================================================

import { sendPushBatch } from './fcm.js';
import { findActiveTokensForUser } from '../../modules/device-tokens/device-tokens.repo.js';
import { insertNotification, insertNotifications } from '../../modules/users/users.repo.js';
import { logger } from '../logger.js';

export interface NotifyPayload {
  title: string;
  body: string;
  /** Free-form category string, e.g. 'report_ready' — matches whatever the FCM `data.type` field
   * already carried at each call site, kept as-is for continuity with existing client handling. */
  type: string;
  /** Deep-link path the Bell sheet (and the OS push, via FCM data.navigate) should open on tap,
   * e.g. '/reports/abc123'. Omit for notifications with nothing to navigate to. */
  link?: string;
}

/**
 * Single-recipient notify: persists one row to the Bell inbox AND sends an FCM push to every
 * active device of this user. Best-effort/never-throws on both halves independently — a DB
 * insert failure must not skip the push, and a push failure must not skip the DB insert.
 */
export async function notifyUser(userId: string, payload: NotifyPayload): Promise<void> {
  try {
    await insertNotification({
      userId,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      link: payload.link ?? null,
    });
  } catch (err) {
    logger.warn({ err, userId, type: payload.type }, 'notifyUser: failed to persist to inbox');
  }

  try {
    const tokens = await findActiveTokensForUser(userId);
    if (tokens.length === 0) return;
    await sendPushBatch(
      tokens.map((t) => t.token),
      payload.title,
      payload.body,
      { type: payload.type, ...(payload.link ? { navigate: payload.link } : {}) },
    );
  } catch (err) {
    logger.warn({ err, userId, type: payload.type }, 'notifyUser: push send failed');
  }
}

/**
 * Bulk variant for broadcasts sharing the SAME title/body/type/link across many recipients (e.g.
 * one language group of a period-reading broadcast, or an admin telegram broadcast) — persists
 * one inbox row per recipient (chunked, see insertNotifications) and sends one sendPushBatch
 * (itself internally chunked at 500 tokens/call).
 */
export async function notifyUsersBatch(
  recipients: { userId: string; token: string }[],
  payload: NotifyPayload,
): Promise<{ success: number; failure: number }> {
  if (recipients.length === 0) return { success: 0, failure: 0 };

  try {
    await insertNotifications(
      recipients.map((r) => ({
        userId: r.userId,
        title: payload.title,
        body: payload.body,
        type: payload.type,
        link: payload.link ?? null,
      })),
    );
  } catch (err) {
    logger.warn(
      { err, count: recipients.length, type: payload.type },
      'notifyUsersBatch: failed to persist to inbox',
    );
  }

  return sendPushBatch(
    recipients.map((r) => r.token),
    payload.title,
    payload.body,
    { type: payload.type, ...(payload.link ? { navigate: payload.link } : {}) },
  );
}
