import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { env } from '../config/env.js';
import { Errors } from '../lib/errors.js';

/** Constant-time string comparison — shared with the Google Play RTDN webhook's query-secret check (billing.routes.ts), which needs the same fail-closed shared-secret pattern but can't use a header (Pub/Sub push endpoints don't send custom ones). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Authenticates machine-to-machine CRON calls via the `X-Cron-Secret` header.
 *
 * FAILS CLOSED: if `CRON_SECRET` is not configured, the endpoint is rejected
 * (never open by default) — so an unset secret can't expose a mass-write
 * trigger over every user.
 */
export const requireCronSecret: MiddlewareHandler = async (c, next) => {
  const expected = env.CRON_SECRET;
  const provided = c.req.header('x-cron-secret');
  if (!expected || !provided || !safeEqual(provided, expected)) {
    throw Errors.forbidden('Invalid or missing cron secret');
  }
  await next();
};

/**
 * Authenticates Google Play's Real-time Developer Notifications push webhook via a `?secret=`
 * query param — Pub/Sub push subscriptions can't send a custom header (only OIDC, which needs
 * public-key/audience verification), so the URL carries the same fail-closed shared secret
 * `requireCronSecret` uses in its header.
 *
 * FAILS CLOSED: if `GOOGLE_PLAY_RTDN_SECRET` is not configured, every push is rejected.
 */
export const requireGooglePlayRtdnSecret: MiddlewareHandler = async (c, next) => {
  const expected = env.GOOGLE_PLAY_RTDN_SECRET;
  const provided = c.req.query('secret');
  if (!expected || !provided || !safeEqual(provided, expected)) {
    throw Errors.forbidden('Invalid or missing secret');
  }
  await next();
};
