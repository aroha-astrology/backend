import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { chatSessions, type ChatSessionRow } from '../../db/schema.js';
import type { ChatHistoryTurn } from './astro.schemas.js';
import {
  encryptField,
  decryptField,
  encryptJson,
  decryptJson,
} from '../../lib/crypto/field-encryption.js';

type DecryptedChatSession = Omit<ChatSessionRow, 'history' | 'summary'> & {
  history: ChatHistoryTurn[];
  summary: string | null;
};

function decryptRow(row: ChatSessionRow): DecryptedChatSession {
  return {
    ...row,
    history: decryptJson<ChatHistoryTurn[]>(row.history) ?? [],
    summary: decryptField(row.summary),
  };
}

/** `birthProfileId === null` filters to the primary/self profile; a non-null id filters to that additional profile. */
function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(chatSessions.birthProfileId)
    : eq(chatSessions.birthProfileId, birthProfileId);
}

export async function getChatSessions(userId: string, birthProfileId: string | null) {
  const rows = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      summary: chatSessions.summary,
      createdAt: chatSessions.createdAt,
      updatedAt: chatSessions.updatedAt,
    })
    .from(chatSessions)
    .where(and(eq(chatSessions.userId, userId), profileFilter(birthProfileId)))
    .orderBy(desc(chatSessions.updatedAt));
  return rows.map((row) => ({ ...row, summary: decryptField(row.summary) }));
}

export async function getChatSession(id: string, userId: string, birthProfileId: string | null) {
  const result = await db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);

  const session = result[0];
  // Ownership check now ALSO verifies the session belongs to the caller's
  // currently-active profile, not just their account — `null === null`
  // correctly matches the primary profile (plain JS equality, no special
  // casing needed here since this compares already-fetched values, unlike
  // the SQL-side profileFilter() above). A session created while chatting
  // "as" one saved profile must never surface while a sibling profile (or
  // the primary profile) is active for the same account.
  if (!session || session.userId !== userId || session.birthProfileId !== birthProfileId) {
    return null;
  }
  return decryptRow(session);
}

export async function createChatSession(
  userId: string,
  birthProfileId: string | null,
  title: string,
  history: ChatHistoryTurn[],
  summary?: string,
) {
  const result = await db
    .insert(chatSessions)
    .values({
      userId,
      birthProfileId,
      title,
      history: encryptJson(history) ?? '[]',
      summary: encryptField(summary ?? null),
    })
    .returning();
  const row = result[0];
  return row ? decryptRow(row) : undefined;
}

/**
 * Pre-existing gap fixed here: this function used to have NO ownership
 * filter at all — any caller who knew (or guessed) a session id could update
 * ANY user's chat session, on ANY profile. Now scoped to (id, userId,
 * birthProfileId) like every sibling function in this file.
 */
export async function updateChatSession(
  id: string,
  userId: string,
  birthProfileId: string | null,
  history: ChatHistoryTurn[],
  summary?: string,
) {
  const result = await db
    .update(chatSessions)
    .set({
      history: encryptJson(history) ?? '[]',
      summary: encryptField(summary ?? null),
      updatedAt: new Date(),
    })
    .where(
      and(eq(chatSessions.id, id), eq(chatSessions.userId, userId), profileFilter(birthProfileId)),
    )
    .returning();
  const row = result[0];
  return row ? decryptRow(row) : undefined;
}
