import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { env } from '../config/env.js';
import { Errors } from '../lib/errors.js';

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const requireTelegramWebhookSecret: MiddlewareHandler = async (c, next) => {
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  const provided = c.req.header('x-telegram-bot-api-secret-token');
  if (!expected || !provided || !safeEqual(provided, expected)) {
    throw Errors.forbidden('Invalid or missing telegram webhook secret');
  }
  await next();
};
