import { countUsers, listUsersPage } from '../users/users.repo.js';
import { escapeMarkdown } from '../../lib/notifications/telegram.js';

export async function cmdUsers(offsetArg: string | undefined): Promise<string> {
  const PAGE_SIZE = 20;
  const offset = parseInt(offsetArg || '0', 10) || 0;

  const [totalCount, users] = await Promise.all([countUsers(), listUsersPage(PAGE_SIZE, offset)]);

  if (users.length === 0) {
    return offset === 0 ? escapeMarkdown('No users found.') : escapeMarkdown('No more users.');
  }

  const lines = users.map((u) => {
    const contact = escapeMarkdown(u.email || u.phoneE164 || 'No contact');
    const date = escapeMarkdown(u.createdAt.toISOString().split('T')[0]);
    return `• \`${u.id}\` \\| ${contact} \\| ${date}`;
  });

  const nextOffset = offset + PAGE_SIZE;
  const hasMore = nextOffset < totalCount;

  let reply = `*Users \\(${offset + 1}\\-${offset + users.length} of ${totalCount}\\)*\n\n${lines.join('\n')}`;
  if (hasMore) {
    reply += `\n\nNext page: \`/users ${nextOffset}\``;
  }

  return reply;
}
