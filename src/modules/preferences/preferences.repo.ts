import { inArray } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { users, type NotificationPrefs, type QuietHours } from '../../db/schema.js';

export interface NotificationSettingsRow {
  id: string;
  notificationPrefs: NotificationPrefs | null;
  quietHours: QuietHours | null;
  currentTimezone: string | null;
}

/** The three columns the push gate needs (lib/notifications/notification-prefs.ts), for many users in one query. */
export async function findNotificationSettings(
  userIds: string[],
): Promise<NotificationSettingsRow[]> {
  if (userIds.length === 0) return [];
  return db
    .select({
      id: users.id,
      notificationPrefs: users.notificationPrefs,
      quietHours: users.quietHours,
      currentTimezone: users.currentTimezone,
    })
    .from(users)
    .where(inArray(users.id, userIds));
}
