import { and, asc, desc, eq, gt, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { notifications, userFacts, users, type QuietHours } from '../../db/schema.js';
import { decryptField, encryptField } from '../../lib/crypto/field-encryption.js';

export type FactStatus = 'ACTIVE' | 'DONE' | 'DISMISSED';

export interface MemoryItem {
  id: string;
  /** NULL = the reader's own chart; otherwise the saved profile the fact is about. */
  profileId: string | null;
  fact: string;
  followUpQuestion: string | null;
  eventKind: string | null;
  eventDate: string | null;
  status: FactStatus;
  followUpAt: Date | null;
  followedUpAt: Date | null;
  rectifyFlag: boolean;
  createdAt: Date;
}

function toItem(row: typeof userFacts.$inferSelect): MemoryItem {
  return {
    id: row.id,
    profileId: row.birthProfileId,
    fact: decryptField(row.fact) ?? '',
    followUpQuestion: decryptField(row.followUpQuestion),
    eventKind: row.eventKind,
    eventDate: row.eventDate,
    status: row.status,
    followUpAt: row.followUpAt,
    followedUpAt: row.followedUpAt,
    rectifyFlag: row.rectifyFlag,
    createdAt: row.createdAt,
  };
}

/** Everything remembered about the reader, newest first, across all their saved profiles. */
export async function listMemory(userId: string): Promise<MemoryItem[]> {
  const rows = await db
    .select()
    .from(userFacts)
    .where(eq(userFacts.userId, userId))
    .orderBy(desc(userFacts.createdAt));
  return rows.map(toItem);
}

export async function getMemoryItem(userId: string, id: string): Promise<MemoryItem | undefined> {
  const [row] = await db
    .select()
    .from(userFacts)
    .where(and(eq(userFacts.id, id), eq(userFacts.userId, userId)))
    .limit(1);
  return row ? toItem(row) : undefined;
}

export async function deleteMemoryItem(userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(userFacts)
    .where(and(eq(userFacts.id, id), eq(userFacts.userId, userId)))
    .returning({ id: userFacts.id });
  return rows.length > 0;
}

/** Forget everything: every remembered item, and the free-reply token with it. Returns how many items went. */
export async function deleteAllMemory(userId: string): Promise<number> {
  const rows = await db.delete(userFacts).where(eq(userFacts.userId, userId)).returning({ id: userFacts.id });
  await db.update(users).set({ babaFreeReplyUntil: null }).where(eq(users.id, userId));
  return rows.length;
}

export async function updateMemoryStatus(
  userId: string,
  id: string,
  patch: { status: FactStatus; rectifyFlag?: boolean },
): Promise<MemoryItem | undefined> {
  const [row] = await db
    .update(userFacts)
    .set({
      status: patch.status,
      ...(patch.rectifyFlag !== undefined ? { rectifyFlag: patch.rectifyFlag } : {}),
    })
    .where(and(eq(userFacts.id, id), eq(userFacts.userId, userId)))
    .returning();
  return row ? toItem(row) : undefined;
}

/** How many past events the reader confirmed (they can anchor a birth-time check). */
export async function countRectifyAnchors(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(userFacts)
    .where(
      and(
        eq(userFacts.userId, userId),
        eq(userFacts.rectifyFlag, true),
        eq(userFacts.status, 'DONE'),
        isNotNull(userFacts.eventDate),
      ),
    );
  return row?.n ?? 0;
}

export interface DueFollowUp {
  id: string;
  userId: string;
  birthProfileId: string | null;
  fact: string;
  followUpQuestion: string | null;
  eventKind: string | null;
  followUpAt: Date;
  locale: string | null;
  currentTimezone: string | null;
  quietHours: QuietHours | null;
}

/** Items whose check-in moment has passed and which have not been checked in on yet, oldest first. */
export async function listDueFollowUps(now: Date, limit: number): Promise<DueFollowUp[]> {
  const rows = await db
    .select({
      id: userFacts.id,
      userId: userFacts.userId,
      birthProfileId: userFacts.birthProfileId,
      fact: userFacts.fact,
      followUpQuestion: userFacts.followUpQuestion,
      eventKind: userFacts.eventKind,
      followUpAt: userFacts.followUpAt,
      locale: users.locale,
      currentTimezone: users.currentTimezone,
      quietHours: users.quietHours,
    })
    .from(userFacts)
    .innerJoin(users, eq(users.id, userFacts.userId))
    .where(
      and(
        eq(userFacts.status, 'ACTIVE'),
        isNotNull(userFacts.followUpAt),
        lte(userFacts.followUpAt, now),
        isNull(userFacts.followedUpAt),
        isNull(users.deletedAt),
      ),
    )
    .orderBy(asc(userFacts.followUpAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r,
    followUpAt: r.followUpAt as Date,
    fact: decryptField(r.fact) ?? '',
    followUpQuestion: decryptField(r.followUpQuestion),
  }));
}

/** Takes the one check-in for this item. False when someone else already did (a retried or overlapping run). */
export async function claimFollowUp(id: string, now: Date, transitNote: string | null): Promise<boolean> {
  const rows = await db
    .update(userFacts)
    .set({ followedUpAt: now, transitNote: encryptField(transitNote) })
    .where(and(eq(userFacts.id, id), isNull(userFacts.followedUpAt)))
    .returning({ id: userFacts.id });
  return rows.length > 0;
}

/** When did this reader last get a memory check-in push? Used to keep it to one a day. */
export async function lastCheckInAt(userId: string, type: string): Promise<Date | undefined> {
  const [row] = await db
    .select({ createdAt: notifications.createdAt })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.type, type)))
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  return row?.createdAt;
}

export async function setFreeReplyUntil(userId: string, until: Date): Promise<void> {
  await db.update(users).set({ babaFreeReplyUntil: until }).where(eq(users.id, userId));
}

/** Spends the free reply: one atomic UPDATE, so two questions at once cannot both use it. */
export async function consumeBabaFreeReply(userId: string): Promise<boolean> {
  const rows = await db
    .update(users)
    .set({ babaFreeReplyUntil: null })
    .where(and(eq(users.id, userId), gt(users.babaFreeReplyUntil, sql`now()`)))
    .returning({ id: users.id });
  return rows.length > 0;
}

/** Gives the free reply back (the turn produced no answer). */
export async function refundBabaFreeReply(userId: string, until: Date): Promise<void> {
  await db.update(users).set({ babaFreeReplyUntil: until }).where(eq(users.id, userId));
}

/** Does the reader hold a free reply right now (for the UI hint)? */
export async function hasFreeReply(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), gt(users.babaFreeReplyUntil, sql`now()`)))
    .limit(1);
  return !!row;
}
