import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { supportTickets, type SupportTicketRow } from '../../db/schema.js';
import { encryptField, decryptField } from '../../lib/crypto/field-encryption.js';

/**
 * Repo-layer-only encryption boundary — same convention as
 * chat-sessions.repo.ts/user-facts.repo.ts. `message`/`adminNote` are
 * encrypted at rest; every function below returns plain strings, and every
 * caller above this file (service/routes) never sees ciphertext.
 */
function decryptRow(row: SupportTicketRow) {
  return {
    ...row,
    message: decryptField(row.message) ?? '',
    adminNote: decryptField(row.adminNote),
  };
}

export interface CreateSupportTicketInput {
  userId: string;
  category: string;
  message: string;
  locale?: string | null;
  appVersion?: string | null;
}

export async function createSupportTicket(input: CreateSupportTicketInput) {
  const [row] = await db
    .insert(supportTickets)
    .values({
      userId: input.userId,
      category: input.category,
      message: encryptField(input.message) as string,
      locale: input.locale ?? null,
      appVersion: input.appVersion ?? null,
    })
    .returning();
  if (!row) throw new Error('createSupportTicket: insert returned no row');
  return decryptRow(row);
}

/** Caller's own tickets, newest first — powers `GET /v1/support/tickets`. */
export async function listSupportTicketsByUser(userId: string) {
  const rows = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .orderBy(desc(supportTickets.createdAt));
  return rows.map(decryptRow);
}

export interface AdminTicketFilter {
  userId?: string | undefined;
  status?: string | undefined;
}

function adminFilterWhere(filter: AdminTicketFilter) {
  return and(
    filter.userId ? eq(supportTickets.userId, filter.userId) : undefined,
    filter.status ? eq(supportTickets.status, filter.status) : undefined,
  );
}

/** Filtered + paginated ticket list — powers `GET /v1/admin/support/tickets`. */
export async function listSupportTicketsForAdmin(
  filter: AdminTicketFilter,
  limit: number,
  offset: number,
) {
  const rows = await db
    .select()
    .from(supportTickets)
    .where(adminFilterWhere(filter))
    .orderBy(desc(supportTickets.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map(decryptRow);
}

/** Total matching `listSupportTicketsForAdmin`'s own filter — powers the admin list's pagination total. */
export async function countSupportTicketsForAdmin(filter: AdminTicketFilter): Promise<number> {
  const [res] = await db
    .select({ count: count() })
    .from(supportTickets)
    .where(adminFilterWhere(filter));
  return res?.count ?? 0;
}

export async function getSupportTicketById(id: string) {
  const [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  return row ? decryptRow(row) : undefined;
}

export interface UpdateSupportTicketInput {
  status?: string;
  adminNote?: string;
  resolvedAt?: Date | null;
}

/** `resolvedAt` is only touched when the caller explicitly includes it (undefined = leave as-is, null = clear it) — see support.service.ts's terminal-status logic for when that happens. */
export async function updateSupportTicket(id: string, input: UpdateSupportTicketInput) {
  const set: Record<string, unknown> = {};
  if (input.status !== undefined) set.status = input.status;
  if (input.adminNote !== undefined) set.adminNote = encryptField(input.adminNote);
  if ('resolvedAt' in input) set.resolvedAt = input.resolvedAt;

  const [row] = await db
    .update(supportTickets)
    .set(set)
    .where(eq(supportTickets.id, id))
    .returning();
  return row ? decryptRow(row) : undefined;
}
