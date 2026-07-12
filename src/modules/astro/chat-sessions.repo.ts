import { eq, desc } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { chatSessions } from '../../db/schema.js';
import type { ChatHistoryTurn } from './astro.schemas.js';

export async function getChatSessions(userId: string) {
  return db
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
}

export async function getChatSession(id: string, userId: string) {
  const result = await db
    .select()
    .from(chatSessions)
    .where(eq(chatSessions.id, id))
    .limit(1);

  const session = result[0];
  if (!session || session.userId !== userId) {
    return null;
  }
  return session;
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
      history,
      summary: summary ?? null,
    })
    .returning();
  return result[0];
}

export async function updateChatSession(
  id: string,
  history: ChatHistoryTurn[],
  summary?: string,
) {
  const result = await db
    .update(chatSessions)
    .set({
      history,
      summary: summary ?? null,
      updatedAt: new Date(),
    })
    .where(eq(chatSessions.id, id))
    .returning();
  return result[0];
}
