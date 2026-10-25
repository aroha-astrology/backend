import { Errors } from '../../lib/errors.js';
import { logAdminAction } from '../admin/admin.repo.js';
import { notifyUser } from '../../lib/notifications/notify-user.js';
import { logger } from '../../lib/logger.js';
import type {
  AdminSupportTicketDto,
  SupportTicketDto,
  UpdateTicketBody,
} from './support.schemas.js';
import {
  createSupportTicket,
  listSupportTicketsByUser,
  listSupportTicketsForAdmin,
  countSupportTicketsForAdmin,
  updateSupportTicket,
  type AdminTicketFilter,
  type CreateSupportTicketInput,
} from './support.repo.js';

/** Row shape shared by every support.repo.ts read/write (post-decryption). */
interface DecryptedTicketRow {
  id: string;
  userId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  category: string;
  message: string;
  locale: string | null;
  appVersion: string | null;
  status: string;
  adminNote: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

/** Caller-facing shape — no `userId` (implicit: always the caller's own). `adminNote` IS included: it's the support team's reply, shown to the user on their ticket. */
function toPublicDto(row: DecryptedTicketRow): SupportTicketDto {
  return {
    id: row.id,
    category: row.category,
    message: row.message,
    locale: row.locale,
    appVersion: row.appVersion,
    status: row.status,
    adminNote: row.adminNote,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

function toAdminDto(row: DecryptedTicketRow): AdminSupportTicketDto {
  return {
    id: row.id,
    userId: row.userId,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    category: row.category,
    message: row.message,
    locale: row.locale,
    appVersion: row.appVersion,
    status: row.status,
    adminNote: row.adminNote,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
  };
}

export async function createTicket(input: CreateSupportTicketInput): Promise<SupportTicketDto> {
  const row = await createSupportTicket(input);
  return toPublicDto(row);
}

/** The CALLER's own tickets, newest first — never another user's. */
export async function listMyTickets(userId: string): Promise<SupportTicketDto[]> {
  const rows = await listSupportTicketsByUser(userId);
  return rows.map(toPublicDto);
}

export interface AdminTicketPage {
  tickets: AdminSupportTicketDto[];
  total: number;
  offset: number;
  limit: number;
}

export async function listTicketsForAdmin(
  filter: AdminTicketFilter,
  limit: number,
  offset: number,
): Promise<AdminTicketPage> {
  const [rows, total] = await Promise.all([
    listSupportTicketsForAdmin(filter, limit, offset),
    countSupportTicketsForAdmin(filter),
  ]);
  return { tickets: rows.map(toAdminDto), total, offset, limit };
}

/**
 * Statuses that count as "closed out" — reaching one of these stamps
 * `resolvedAt`; moving AWAY from one (e.g. a mistaken resolve reopened to
 * "open") clears it back to null rather than leaving a stale timestamp.
 * Not specified further than "terminal/resolved" in the task spec, so this
 * is the admin-support-inbox convention: 'resolved' (fixed) and 'closed'
 * (won't-fix/duplicate/no-action) both terminate the ticket; 'open' and
 * 'in_progress' do not.
 */
const TERMINAL_STATUSES = new Set(['resolved', 'closed']);

export async function updateTicketForAdmin(
  id: string,
  body: UpdateTicketBody,
  adminPhone: string,
): Promise<AdminSupportTicketDto> {
  const patch: { status?: string; adminNote?: string; resolvedAt?: Date | null } = {};
  if (body.status !== undefined) {
    patch.status = body.status;
    patch.resolvedAt = TERMINAL_STATUSES.has(body.status) ? new Date() : null;
  }
  if (body.adminNote !== undefined) {
    patch.adminNote = body.adminNote;
  }

  const updated = await updateSupportTicket(id, patch);
  if (!updated) throw Errors.notFound('Support ticket not found');

  // A reply is only worth a push when there IS one — a status-only change
  // (open -> in_progress) is bookkeeping the user doesn't need woken up for.
  if (body.adminNote !== undefined && updated.userId) {
    void notifyUser(updated.userId, {
      title: SUPPORT_REPLY_TITLE,
      body: SUPPORT_REPLY_BODY,
      type: 'support_reply',
      link: '/help',
    }).catch((err: unknown) =>
      logger.warn({ err, ticketId: id }, 'support: reply notification failed'),
    );
  }

  await logAdminAction(adminPhone, `PATCH /v1/admin/support/tickets/${id}`, body);
  return toAdminDto(updated);
}

/**
 * Push copy for "support replied". Plain English constants, matching every
 * other notifyUser call site in this codebase (low-balance-alert.service.ts,
 * reports.service.ts, palm.service.ts) — there is no server-side push
 * localization helper to hook into. The reply body itself is whatever the
 * human typed and is never translated either; it is shown verbatim on /help.
 */
const SUPPORT_REPLY_TITLE = 'Support replied';
const SUPPORT_REPLY_BODY = 'We answered your request — tap to read the reply.';
