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
    // `-`, `(` and `)` are MarkdownV2-reserved: unescaped, Telegram rejects the
    // whole message with 400 and the health report silently never arrives.
    const msg = res.message ? ` \\- ${escapeMarkdown(res.message)}` : '';
    return `${icon} *${escapeMarkdown(name)}* \\(${res.latencyMs}ms\\)${msg}`;
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

function formatRupees(paise: number): string {
  const rupees = paise / 100;
  return `₹${Number.isInteger(rupees) ? rupees : rupees.toFixed(2)}`;
}

export async function notifyWalletTopUp(fields: {
  userId: string;
  contact?: string | null;
  amountPaise: number;
  newBalancePaise: number;
}): Promise<boolean> {
  const text =
    `💰 *Wallet Top-Up*\n\n` +
    `User: \`${escapeMarkdown(fields.userId)}\`\n` +
    (fields.contact ? `Contact: ${escapeMarkdown(fields.contact)}\n` : '') +
    `Added: ${escapeMarkdown(formatRupees(fields.amountPaise))}\n` +
    `New balance: ${escapeMarkdown(formatRupees(fields.newBalancePaise))}`;
  return sendMessage(text);
}

export async function notifyError(context: string, error: unknown): Promise<boolean> {
  const msg = error instanceof Error ? error.message : String(error);
  return sendAlert(`Error: ${context}`, msg);
}

/** Truncate for Telegram readability — full text is stored in chat_feedback_reports. */
function clipForTelegram(text: string, max = 400): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/** Every recipient for the chat-downvote alert — the default ops chat plus any extra recipients configured just for this alert. */
function downvoteRecipients(): (string | number)[] {
  const ids = [env.TELEGRAM_ALERT_CHAT_ID, ...env.TELEGRAM_DOWNVOTE_EXTRA_CHAT_IDS].filter(
    (id): id is string => Boolean(id),
  );
  return [...new Set(ids)];
}

export async function notifyChatDownvote(fields: {
  userId: string;
  locale?: string | undefined;
  question: string;
  answer: string;
}): Promise<boolean> {
  const text =
    `👎 *AI Chat Downvote*\n\n` +
    `User: \`${escapeMarkdown(fields.userId)}\`\n` +
    (fields.locale ? `Locale: ${escapeMarkdown(fields.locale)}\n` : '') +
    `\n*Q:* ${escapeMarkdown(clipForTelegram(fields.question))}\n` +
    `*A:* ${escapeMarkdown(clipForTelegram(fields.answer))}`;

  const recipients = downvoteRecipients();
  if (recipients.length === 0) return sendMessage(text);
  const results = await Promise.all(recipients.map((chatId) => sendMessage(text, chatId)));
  return results.some(Boolean);
}

/** Every recipient for the new-support-ticket alert — the default ops chat plus any extra recipients configured just for this alert. Mirrors downvoteRecipients() above. */
function supportTicketRecipients(): (string | number)[] {
  const ids = [env.TELEGRAM_ALERT_CHAT_ID, ...env.TELEGRAM_SUPPORT_EXTRA_CHAT_IDS].filter(
    (id): id is string => Boolean(id),
  );
  return [...new Set(ids)];
}

export async function notifySupportTicket(fields: {
  userId: string;
  contact?: string | null;
  category: string;
  message: string;
}): Promise<boolean> {
  const text =
    `🆘 *New Support Ticket*\n\n` +
    `User: \`${escapeMarkdown(fields.userId)}\`\n` +
    (fields.contact ? `Contact: ${escapeMarkdown(fields.contact)}\n` : '') +
    `Category: ${escapeMarkdown(fields.category)}\n` +
    `\n*Message:* ${escapeMarkdown(clipForTelegram(fields.message))}`;

  const recipients = supportTicketRecipients();
  if (recipients.length === 0) return sendMessage(text);
  const results = await Promise.all(recipients.map((chatId) => sendMessage(text, chatId)));
  return results.some(Boolean);
}

/**
 * A user asked us to delete their account. Nothing has been erased at this
 * point — this message IS the review queue, and the account survives until
 * someone runs `/approvedelete`. Sent once on request, then re-sent daily by
 * the reminder cron (`pendingDays` set) for as long as it goes unanswered.
 *
 * Reuses the support-ticket recipient list rather than adding another env var:
 * same audience, same "a human must act on this" character.
 */
export async function notifyAccountDeletionRequest(fields: {
  userId: string;
  contact?: string | null;
  requestedAt: Date;
  pendingDays?: number;
}): Promise<boolean> {
  const heading =
    fields.pendingDays === undefined
      ? '🗑️ *Account Deletion Requested*'
      : `⏰ *Deletion Still Pending \\(${fields.pendingDays}d\\)*`;
  const text =
    `${heading}\n\n` +
    `User: \`${escapeMarkdown(fields.userId)}\`\n` +
    (fields.contact ? `Contact: ${escapeMarkdown(fields.contact)}\n` : '') +
    `Requested: ${escapeMarkdown(fields.requestedAt.toISOString())}\n` +
    `\nNothing has been erased yet\\. Approve or reject:\n` +
    `\`/approvedelete ${escapeMarkdown(fields.userId)}\`\n` +
    `\`/rejectdelete ${escapeMarkdown(fields.userId)}\``;

  const recipients = supportTicketRecipients();
  if (recipients.length === 0) return sendMessage(text);
  const results = await Promise.all(recipients.map((chatId) => sendMessage(text, chatId)));
  return results.some(Boolean);
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
