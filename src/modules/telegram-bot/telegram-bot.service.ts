import { env } from '../../config/env.js';
import { sendMessage, escapeMarkdown } from '../../lib/notifications/telegram.js';
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
} from './telegram-bot.commands.js';

export async function handleUpdate(update: unknown): Promise<void> {
  if (!update || typeof update !== 'object') return;
  const u = update as Record<string, unknown>;
  const message = u.message as Record<string, unknown> | undefined;
  if (!message || typeof message.text !== 'string') return;

  const chat = message.chat as Record<string, unknown> | undefined;
  if (!chat || (typeof chat.id !== 'string' && typeof chat.id !== 'number')) return;

  const chatId = String(chat.id);
  if (chatId !== env.TELEGRAM_ALERT_CHAT_ID) return;

  const text = message.text.trim();
  if (!text.startsWith('/')) return;

  const parts = text.split(/\s+/);
  const command = parts[0] as string;
  const args = parts.slice(1);
  const fullMessage = args.join(' ');

  let reply = '';
  switch (command) {
    case '/start':
    case '/help':
      reply = escapeMarkdown(
        `Available commands:\n/stats - App health\n/users [offset] - List all users\n/user [phone] - User details\n/search [email|phone] - Search user ID\n/delete [id] - Hard delete a user\n/jobs - Check failed background jobs\n/broadcast [message] - Send push notification\n/coupons - List active coupons\n/newcoupon [code] [percent] [value] [maxUses] [expireDays] - Create a coupon`,
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
    default:
      reply = escapeMarkdown(`Unknown command: ${command}`);
      break;
  }

  await sendMessage(reply, chatId);
}
