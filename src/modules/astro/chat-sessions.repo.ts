import { eq, desc } from 'drizzle-orm';
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

export async function getChatSessions(userId: string) {
  const rows = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      summary: chatSessions.summary,
      createdAt: chatSessions.createdAt,
      updatedAt: chatSessions.updatedAt,
    })
    .from(chatSessions)
    .where(eq(chatSessions.userId, userId))
    .orderBy(desc(chatSessions.updatedAt));
  return rows.map((row) => ({ ...row, summary: decryptField(row.summary) }));
}

export async function getChatSession(id: string, userId: string) {
  const result = await db.select().from(chatSessions).where(eq(chatSessions.id, id)).limit(1);

  const session = result[0];
  if (!session || session.userId !== userId) {
    return null;
  }
  return decryptRow(session);
}

export async function createChatSession(
  userId: string,
  title: string,
  history: ChatHistoryTurn[],
  summary?: string,
) {
  const result = await db
    .insert(chatSessions)
    .values({
      userId,
      title,
      history: encryptJson(history) ?? '[]',
      summary: encryptField(summary ?? null),
    })
    .returning();
  const row = result[0];
  return row ? decryptRow(row) : undefined;
}

export async function updateChatSession(id: string, history: ChatHistoryTurn[], summary?: string) {
  const result = await db
    .update(chatSessions)
    .set({
      history: encryptJson(history) ?? '[]',
      summary: encryptField(summary ?? null),
      updatedAt: new Date(),
    })
    .where(eq(chatSessions.id, id))
    .returning();
  const row = result[0];
  return row ? decryptRow(row) : undefined;
}
