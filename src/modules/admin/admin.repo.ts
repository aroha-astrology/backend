import { db } from '../../config/db.js';
import { adminAuditLog, type NewAdminAuditLogRow } from '../../db/schema.js';

export async function logAdminAction(entry: NewAdminAuditLogRow): Promise<void> {
  await db.insert(adminAuditLog).values(entry);
}
