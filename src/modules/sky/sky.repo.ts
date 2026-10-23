import { and, count, desc, eq, gt, inArray, lt, notExists, or, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { skyBlocks, skyPosts, skyReports, type SkyPostRow } from '../../db/schema.js';
import type { PostStatus } from './sky-rules.js';

export type { SkyPostRow };

/** The reader's natal Moon sign (primary chart), the same source the check-in nudges use. */
export async function moonSignOf(userId: string): Promise<string | null> {
  const rows = await db.execute<{ moon_sign: string | null }>(sql`
    SELECT k.dosha_data->'sadeSati'->>'moonSign' AS moon_sign
    FROM kundlis k
    WHERE k.user_id = ${userId} AND k.birth_profile_id IS NULL
    LIMIT 1
  `);
  return Array.from(rows)[0]?.moon_sign ?? null;
}

export async function countRecentPosts(userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(skyPosts)
    .where(and(eq(skyPosts.authorUserId, userId), gt(skyPosts.createdAt, since)));
  return row?.n ?? 0;
}

export async function insertPost(values: {
  room: string;
  authorUserId: string;
  body: string;
}): Promise<SkyPostRow> {
  const [row] = await db.insert(skyPosts).values(values).returning();
  return row!;
}

/** Sets the outcome of the automatic check or of an admin decision. */
export async function decidePost(
  id: string,
  status: PostStatus,
  checkReason: string | null,
  reviewedBy: string | null,
): Promise<SkyPostRow | undefined> {
  const [row] = await db
    .update(skyPosts)
    .set({ status, checkReason, reviewedBy, decidedAt: status === 'PENDING' ? null : new Date() })
    .where(eq(skyPosts.id, id))
    .returning();
  return row;
}

export async function getPost(id: string): Promise<SkyPostRow | undefined> {
  const [row] = await db.select().from(skyPosts).where(eq(skyPosts.id, id)).limit(1);
  return row;
}

/**
 * What a reader sees in their room: approved posts from authors they have not blocked and that they have not
 * reported, plus their own posts in any state (so a reader can see "waiting" or "not published").
 */
export async function listRoomPosts(
  room: string,
  viewerId: string,
  limit: number,
  before?: Date,
): Promise<SkyPostRow[]> {
  const blocked = db
    .select({ one: sql`1` })
    .from(skyBlocks)
    .where(and(eq(skyBlocks.blockerUserId, viewerId), eq(skyBlocks.blockedUserId, skyPosts.authorUserId)));
  const reportedByMe = db
    .select({ one: sql`1` })
    .from(skyReports)
    .where(and(eq(skyReports.postId, skyPosts.id), eq(skyReports.reporterUserId, viewerId)));

  const visible = or(
    and(eq(skyPosts.status, 'APPROVED'), notExists(blocked), notExists(reportedByMe)),
    and(eq(skyPosts.authorUserId, viewerId), inArray(skyPosts.status, ['PENDING', 'APPROVED', 'REJECTED'])),
  );
  return db
    .select()
    .from(skyPosts)
    .where(and(eq(skyPosts.room, room), visible, before ? lt(skyPosts.createdAt, before) : undefined))
    .orderBy(desc(skyPosts.createdAt))
    .limit(limit);
}

/** Records a report. False when this reader already reported the post. */
export async function insertReport(postId: string, reporterId: string, reason: string): Promise<boolean> {
  const rows = await db
    .insert(skyReports)
    .values({ postId, reporterUserId: reporterId, reason })
    .onConflictDoNothing()
    .returning({ postId: skyReports.postId });
  return rows.length > 0;
}

/** Recounts the distinct reporters on a post and stores the number. */
export async function recountReports(postId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(skyReports)
    .where(eq(skyReports.postId, postId));
  const n = row?.n ?? 0;
  await db.update(skyPosts).set({ reportCount: n }).where(eq(skyPosts.id, postId));
  return n;
}

export async function insertBlock(blockerId: string, blockedId: string): Promise<void> {
  await db
    .insert(skyBlocks)
    .values({ blockerUserId: blockerId, blockedUserId: blockedId })
    .onConflictDoNothing();
}

export async function deleteBlock(blockerId: string, blockedId: string): Promise<void> {
  await db
    .delete(skyBlocks)
    .where(and(eq(skyBlocks.blockerUserId, blockerId), eq(skyBlocks.blockedUserId, blockedId)));
}

export async function deleteOwnPost(id: string, authorId: string): Promise<boolean> {
  const rows = await db
    .delete(skyPosts)
    .where(and(eq(skyPosts.id, id), eq(skyPosts.authorUserId, authorId)))
    .returning({ id: skyPosts.id });
  return rows.length > 0;
}

export interface QueueRow {
  post: SkyPostRow;
  reasons: string[];
}

/** The admin queue: posts waiting for a decision, and approved posts that were reported. Oldest first. */
export async function listQueue(limit: number): Promise<QueueRow[]> {
  const posts = await db
    .select()
    .from(skyPosts)
    .where(or(eq(skyPosts.status, 'PENDING'), and(eq(skyPosts.status, 'APPROVED'), gt(skyPosts.reportCount, 0))))
    .orderBy(skyPosts.createdAt)
    .limit(limit);
  if (posts.length === 0) return [];
  const reports = await db
    .select({ postId: skyReports.postId, reason: skyReports.reason })
    .from(skyReports)
    .where(inArray(skyReports.postId, posts.map((p) => p.id)));
  return posts.map((post) => ({
    post,
    reasons: reports.filter((r) => r.postId === post.id).map((r) => r.reason),
  }));
}

export async function queueSize(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(skyPosts)
    .where(or(eq(skyPosts.status, 'PENDING'), and(eq(skyPosts.status, 'APPROVED'), gt(skyPosts.reportCount, 0))));
  return row?.n ?? 0;
}
