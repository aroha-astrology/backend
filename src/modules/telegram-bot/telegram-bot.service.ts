import { env } from '../../config/env.js';
import { sendMessage, escapeMarkdown } from '../../lib/notifications/telegram.js';
import { logTelegramAdminAction } from './telegram-bot.repo.js';
import {
  cmdUsers,
  cmdDeleteUser,
  cmdStats,
  cmdSearch,
  cmdUserDetails,
  cmdJobs,
  cmdBroadcast,
  cmdCoupons,
  cmdNewCoupon,
  cmdMoney,
  cmdFeedback,
} from './telegram-bot.commands.js';

type Tier = 'admin' | 'readonly';

/** Commands only the 'admin' tier may run — every mutating/destructive one. */
const ADMIN_ONLY_COMMANDS = new Set(['/delete', '/broadcast', '/newcoupon', '/money']);

function resolveTier(chatId: string): Tier | null {
  const adminIds = new Set(
    [env.TELEGRAM_ALERT_CHAT_ID, ...env.TELEGRAM_ADMIN_CHAT_IDS].filter(Boolean),
  );
  if (adminIds.has(chatId)) return 'admin';
  if (new Set(env.TELEGRAM_READONLY_CHAT_IDS).has(chatId)) return 'readonly';
  return null;
}

export async function handleUpdate(update: unknown): Promise<void> {
  if (!update || typeof update !== 'object') return;
  const u = update as Record<string, unknown>;
  const message = u.message as Record<string, unknown> | undefined;
  if (!message || typeof message.text !== 'string') return;

  const chat = message.chat as Record<string, unknown> | undefined;
  if (!chat || (typeof chat.id !== 'string' && typeof chat.id !== 'number')) return;

  const chatId = String(chat.id);
  const tier = resolveTier(chatId);
  if (!tier) return;

  const text = message.text.trim();
  if (!text.startsWith('/')) return;

  const parts = text.split(/\s+/);
  const command = parts[0] as string;
  const args = parts.slice(1);
  const fullMessage = args.join(' ');

  if (tier === 'readonly' && ADMIN_ONLY_COMMANDS.has(command)) {
    await sendMessage(
      escapeMarkdown(`${command} requires admin access — this chat has read-only access.`),
      chatId,
    );
    return;
  }

  let reply = '';
  switch (command) {
    case '/start':
    case '/help':
      reply = escapeMarkdown(
        `Available commands:\n/stats - App health\n/users [offset] - List all users\n/user [phone] - User details\n/search [email|phone] - Search user ID\n/delete [id] - Hard delete a user (admin only)\n/jobs - Check failed background jobs\n/broadcast [message] - Send push notification (admin only)\n/coupons - List active coupons\n/newcoupon [code] [percent] [value] [maxUses] [expireDays] - Create a coupon (admin only)\n/money [phone] [amount] - Add/deduct wallet balance, e.g. /money +919999999999 250 (admin only)\n/feedback [offset] - AI chat thumbs up/down counts per user`,
      );
      break;
    case '/users':
      reply = await cmdUsers(args[0]);
      break;
    case '/delete':
      reply = await cmdDeleteUser(args[0]);
      break;
    case '/stats':
      reply = await cmdStats();
      break;
    case '/search':
      reply = await cmdSearch(args[0]);
      break;
    case '/user':
      reply = await cmdUserDetails(args[0]);
      break;
    case '/jobs':
      reply = await cmdJobs();
      break;
    case '/broadcast':
      reply = await cmdBroadcast(fullMessage);
      break;
    case '/coupons':
      reply = await cmdCoupons();
      break;
    case '/newcoupon':
      reply = await cmdNewCoupon(args);
      break;
    case '/money':
      reply = await cmdMoney(args);
      break;
    case '/feedback':
      reply = await cmdFeedback(args[0]);
      break;
    default:
      reply = escapeMarkdown(`Unknown command: ${command}`);
      break;
  }

  // Audit every recognized command (not /start/help, which are read-only and
  // no-context) so a compromised or misused chat leaves a trail of who ran
  // what — this is the accountability RBAC alone doesn't provide.
  if (command !== '/start' && command !== '/help') {
    await logTelegramAdminAction({ chatId, tier, command, args: fullMessage || null });
  }

  await sendMessage(reply, chatId);
}
