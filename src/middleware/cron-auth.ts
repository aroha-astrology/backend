import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { env } from '../config/env.js';
import { Errors } from '../lib/errors.js';

function safeEqual(a: string, b: string): boolean {
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
