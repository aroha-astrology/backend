import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { google } from 'googleapis';
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

let pubSubTokenClient: InstanceType<typeof google.auth.OAuth2> | undefined;

/**
 * True when the push carries a valid Google-signed OIDC token for our endpoint: Pub/Sub push
 * authentication, turned on by setting `GOOGLE_PLAY_RTDN_AUDIENCE` (the audience entered on the
 * push subscription) and, to pin the sender, `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT`.
 */
async function hasValidPubSubToken(authorization: string | undefined): Promise<boolean> {
  const audience = env.GOOGLE_PLAY_RTDN_AUDIENCE;
  if (!audience || !authorization?.startsWith('Bearer ')) return false;
  try {
    pubSubTokenClient ??= new google.auth.OAuth2();
    const ticket = await pubSubTokenClient.verifyIdToken({
      idToken: authorization.slice('Bearer '.length),
      audience,
    });
    const payload = ticket.getPayload();
    if (!payload?.email_verified) return false;
    const sender = env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT;
    return !sender || payload.email === sender;
  } catch {
    return false;
  }
}

/**
 * Authenticates Google Play's Real-time Developer Notifications push webhook. Either:
 *  - a Google-signed OIDC token in `Authorization` (Pub/Sub push authentication), when
 *    `GOOGLE_PLAY_RTDN_AUDIENCE` is set — the safer way, since nothing secret sits in the URL
 *    (and so in proxy or access logs); or
 *  - a `?secret=` query param, the same fail-closed shared secret `requireCronSecret` uses in
 *    its header (Pub/Sub push can't send a custom header).
 * To require OIDC only, set the audience and remove `GOOGLE_PLAY_RTDN_SECRET`.
 *
 * FAILS CLOSED: with neither configured, every push is rejected.
 */
export const requireGooglePlayRtdnSecret: MiddlewareHandler = async (c, next) => {
  if (await hasValidPubSubToken(c.req.header('authorization'))) {
    await next();
    return;
  }
  const expected = env.GOOGLE_PLAY_RTDN_SECRET;
  const provided = c.req.query('secret');
  if (!expected || !provided || !safeEqual(provided, expected)) {
    throw Errors.forbidden('Invalid or missing secret');
  }
  await next();
};
