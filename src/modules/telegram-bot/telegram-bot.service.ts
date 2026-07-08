import { env } from '../../config/env.js';
import { sendMessage, escapeMarkdown } from '../../lib/notifications/telegram.js';
import { cmdUsers, cmdDeleteUser } from './telegram-bot.commands.js';

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

  let reply = '';
  switch (command) {
    case '/start':
    case '/help':
      reply = escapeMarkdown(
        `Available commands:\n/users [offset] - List all users\n/delete [id] - Hard delete a user`,
      );
      break;
    case '/users':
      reply = await cmdUsers(args[0]);
      break;
    case '/delete':
      reply = await cmdDeleteUser(args[0]);
      break;
    default:
      reply = escapeMarkdown(`Unknown command: ${command}`);
      break;
  }

  await sendMessage(reply, chatId);
}
