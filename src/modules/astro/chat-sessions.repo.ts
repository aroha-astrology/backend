import { eq, and, isNull, desc, lt, isNotNull } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { chatSessions, voiceSessions, type ChatSessionRow } from '../../db/schema.js';
import type { ChatHistoryTurn } from './astro.schemas.js';
import {
  encryptField,
  decryptField,
  encryptJson,
  decryptJson,
} from '../../lib/crypto/field-encryption.js';

type DecryptedChatSession = Omit<ChatSessionRow, 'history' | 'summary' | 'callRecap'> & {
  history: ChatHistoryTurn[];
  summary: string | null;
  callRecap: string | null;
};

function decryptRow(row: ChatSessionRow): DecryptedChatSession {
  return {
    ...row,
    history: decryptJson<ChatHistoryTurn[]>(row.history) ?? [],
    summary: decryptField(row.summary),
    callRecap: decryptField(row.callRecap),
  };
}

/** What the Chat History list shows for a session that is a saved voice call. */
export interface ChatSessionCall {
  /** When the call began. */
  startedAt: Date;
  /**
   * How long it ran, start to hang-up. Falls back to the minutes it was given
   * when the call never reported its end (the app was closed mid-call).
   */
  durationSeconds: number;
  /** A few sentences on what was talked about; null until written, or if that failed. */
  recap: string | null;
}

function callDurationSeconds(startedAt: Date, endedAt: Date | null, minutesCharged: number): number {
  if (!endedAt) return minutesCharged * 60;
  return Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
}

/** `birthProfileId === null` filters to the primary/self profile; a non-null id filters to that additional profile. */
function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(chatSessions.birthProfileId)
    : eq(chatSessions.birthProfileId, birthProfileId);
}

/**
 * The Chat History list. A session saved from a voice call carries `call`
 * (when, how long, what it was about); a text chat has `call: null`.
 */
export async function getChatSessions(userId: string, birthProfileId: string | null) {
  const rows = await db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      summary: chatSessions.summary,
      createdAt: chatSessions.createdAt,
      updatedAt: chatSessions.updatedAt,
      callRecap: chatSessions.callRecap,
      voiceSessionId: chatSessions.voiceSessionId,
      callStartedAt: voiceSessions.createdAt,
      callEndedAt: voiceSessions.endedAt,
      callMinutes: voiceSessions.minutesCharged,
    })
    .from(chatSessions)
    .leftJoin(voiceSessions, eq(voiceSessions.id, chatSessions.voiceSessionId))
    .where(
      and(
        eq(chatSessions.userId, userId),
        profileFilter(birthProfileId),
        isNull(chatSessions.deletedAt),
      ),
    )
    .orderBy(desc(chatSessions.updatedAt));
  return rows.map(
    ({ callRecap, voiceSessionId, callStartedAt, callEndedAt, callMinutes, ...row }) => {
      const call: ChatSessionCall | null =
        voiceSessionId && callStartedAt
          ? {
              startedAt: callStartedAt,
              durationSeconds: callDurationSeconds(callStartedAt, callEndedAt, callMinutes ?? 0),
              recap: decryptField(callRecap),
            }
          : null;
      return { ...row, summary: decryptField(row.summary), call };
    },
  );
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
  if (
    !session ||
    session.userId !== userId ||
    session.birthProfileId !== birthProfileId ||
    session.deletedAt
  ) {
    return null;
  }
  return decryptRow(session);
}

/**
 * User-facing delete: hides the session immediately, keeps the row (and any
 * facts already extracted from it into user_facts, which has no FK here) for
 * 7 days before purgeOldDeletedChatSessions hard-deletes it.
 */
export async function softDeleteChatSession(
  id: string,
  userId: string,
  birthProfileId: string | null,
) {
  const result = await db
    .update(chatSessions)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(chatSessions.id, id),
        eq(chatSessions.userId, userId),
        profileFilter(birthProfileId),
        isNull(chatSessions.deletedAt),
      ),
    )
    .returning({ id: chatSessions.id });
  return result.length > 0;
}

const DELETED_CHAT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Cron sweep: hard-deletes chat_sessions soft-deleted more than 7 days ago. */
export async function purgeOldDeletedChatSessions() {
  const cutoff = new Date(Date.now() - DELETED_CHAT_RETENTION_MS);
  const result = await db
    .delete(chatSessions)
    .where(and(isNotNull(chatSessions.deletedAt), lt(chatSessions.deletedAt, cutoff)))
    .returning({ id: chatSessions.id });
  return { purged: result.length };
}

export async function createChatSession(
  userId: string,
  birthProfileId: string | null,
  title: string,
  history: ChatHistoryTurn[],
  summary?: string,
  /** The voice call this session is the transcript of; omitted for a text chat. */
  voiceSessionId?: string,
) {
  const result = await db
    .insert(chatSessions)
    .values({
      userId,
      birthProfileId,
      title,
      history: encryptJson(history) ?? '[]',
      summary: encryptField(summary ?? null),
      voiceSessionId: voiceSessionId ?? null,
    })
    .returning();
  const row = result[0];
  return row ? decryptRow(row) : undefined;
}

/**
 * Stores what a voice call was about on its saved session. Does not touch
 * `updatedAt`: the list is ordered by it, and a note arriving a few seconds
 * after the call must not reorder anything.
 */
export async function setCallRecap(id: string, userId: string, recap: string): Promise<void> {
  await db
    .update(chatSessions)
    .set({ callRecap: encryptField(recap) })
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)));
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
