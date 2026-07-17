import { db } from '../../config/db.js';
import { telegramAdminAuditLog, type NewTelegramAdminAuditLogRow } from '../../db/schema.js';

export async function logTelegramAdminAction(entry: NewTelegramAdminAuditLogRow): Promise<void> {
  await db.insert(telegramAdminAuditLog).values(entry);
}
