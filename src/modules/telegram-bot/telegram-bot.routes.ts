import { Hono } from 'hono';
import { requireTelegramWebhookSecret } from '../../middleware/telegram-auth.js';
import { handleUpdate } from './telegram-bot.service.js';
import { logger } from '../../lib/logger.js';

export const telegramBotRouter = new Hono();

telegramBotRouter.post('/telegram/webhook', requireTelegramWebhookSecret, async (c) => {
  try {
    const update = (await c.req.json()) as unknown;
    await handleUpdate(update);
  } catch (err) {
    logger.error({ err }, 'Failed to handle telegram webhook');
  }
  return c.json({});
});
