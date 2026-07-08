import { env } from '../../config/env.js';
import { logger } from '../logger.js';

const TELEGRAM_API = 'https://api.telegram.org';

export async function sendAlert(title: string, message: string): Promise<boolean> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_ALERT_CHAT_ID) return false;

  const text = `*${escapeMarkdown(title)}*\n${escapeMarkdown(message)}`;
  return sendMessage(text);
}

export type HealthReportData = Record<
  string,
  { status: 'ok' | 'fail'; latencyMs: number; message?: string }
>;

export async function sendHealthReport(report: HealthReportData): Promise<boolean> {
  const lines = Object.entries(report).map(([name, res]) => {
    const icon = res.status === 'ok' ? '✅' : '❌';
    const msg = res.message ? ` - ${escapeMarkdown(res.message)}` : '';
    return `${icon} *${escapeMarkdown(name)}* (${res.latencyMs}ms)${msg}`;
  });
  const text = `*Health Report*\n\n${lines.join('\n')}`;
  return sendMessage(text);
}

export async function notifyNewSignup(fields: {
  id: string;
  email?: string | null;
  phone?: string | null;
}): Promise<boolean> {
  const text = `🎉 *New User Signup*\n\nID: \`${fields.id}\`\nContact: ${escapeMarkdown(fields.email || fields.phone || 'Unknown')}`;
  return sendMessage(text);
}

export async function notifyError(context: string, error: unknown): Promise<boolean> {
  const msg = error instanceof Error ? error.message : String(error);
  return sendAlert(`Error: ${context}`, msg);
}

export async function sendMessage(text: string, chatId?: string | number): Promise<boolean> {
  try {
    const targetChatId = chatId || env.TELEGRAM_ALERT_CHAT_ID;
    if (!targetChatId) return false;

    const url = `${TELEGRAM_API}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: targetChatId,
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

export function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}
