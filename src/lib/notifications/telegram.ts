import { env } from '../../config/env.js';
import { logger } from '../logger.js';

const TELEGRAM_API = 'https://api.telegram.org';

export async function sendAlert(title: string, message: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ALERT_CHAT_ID) return false;

  const text = `*${escapeMarkdown(title)}*\n${escapeMarkdown(message)}`;
  return sendMessage(text);
}

export async function notifyError(context: string, error: unknown): Promise<boolean> {
  const msg = error instanceof Error ? error.message : String(error);
  return sendAlert(`Error: ${context}`, msg);
}

async function sendMessage(text: string): Promise<boolean> {
  try {
    const url = `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_ALERT_CHAT_ID,
        text,
        parse_mode: 'MarkdownV2',
      }),
    });
    if (!resp.ok) {
      logger.warn({ status: resp.status }, 'telegram:sendMessage failed');
      return false;
    }
    return true;
  } catch (err) {
    logger.warn({ err }, 'telegram:sendMessage error');
    return false;
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
