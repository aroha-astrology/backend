import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  feedbackCounters,
  chatFeedbackReports,
  chatFeedbackVotes,
  users,
} from '../../db/schema.js';
import { decryptField } from '../../lib/crypto/field-encryption.js';

/** Atomic upsert-increment — never read-then-write, so concurrent votes never race. */
export async function incrementFeedbackCounter(metric: string): Promise<void> {
  await db
    .insert(feedbackCounters)
    .values({ metric, count: 1 })
    .onConflictDoUpdate({
      target: feedbackCounters.metric,
      set: { count: sql`${feedbackCounters.count} + 1`, updatedAt: new Date() },
    });
}

export async function saveChatFeedbackReport(fields: {
  userId: string;
  sessionId?: string | undefined;
  question: string;
  answer: string;
  locale?: string | undefined;
}): Promise<void> {
  await db.insert(chatFeedbackReports).values({
    userId: fields.userId,
    sessionId: fields.sessionId ?? null,
    question: fields.question,
    answer: fields.answer,
    locale: fields.locale ?? null,
  });
}

/** Per-user vote log — unlike `feedbackCounters` (global) this attributes every up/down to a user. */
export async function recordChatFeedbackVote(fields: {
  userId: string;
  vote: 'up' | 'down';
  sessionId?: string | undefined;
}): Promise<void> {
  await db.insert(chatFeedbackVotes).values({
    userId: fields.userId,
    vote: fields.vote,
    sessionId: fields.sessionId ?? null,
  });
}

export type FeedbackVoteUserSummary = {
  userId: string;
  displayName: string | null;
  phoneE164: string | null;
  email: string | null;
  upVotes: number;
  downVotes: number;
};

/** Users ranked by total vote count (desc), for the Telegram /feedback command. */
export async function getFeedbackVoteCountsByUser(
  limit: number,
  offset: number,
): Promise<{ rows: FeedbackVoteUserSummary[]; totalUserCount: number }> {
  const upCount = sql<number>`count(*) filter (where ${chatFeedbackVotes.vote} = 'up')`;
  const downCount = sql<number>`count(*) filter (where ${chatFeedbackVotes.vote} = 'down')`;

  const rows = await db
    .select({
      userId: chatFeedbackVotes.userId,
      displayName: users.displayName,
      phoneE164: users.phoneE164,
      email: users.email,
      upVotes: upCount,
      downVotes: downCount,
    })
    .from(chatFeedbackVotes)
    .innerJoin(users, eq(users.id, chatFeedbackVotes.userId))
    .groupBy(chatFeedbackVotes.userId, users.displayName, users.phoneE164, users.email)
    .orderBy(desc(sql`count(*)`))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: sql<number>`count(distinct ${chatFeedbackVotes.userId})` })
    .from(chatFeedbackVotes);

  return {
    rows: rows.map((row) => ({
      ...row,
      phoneE164: decryptField(row.phoneE164),
      upVotes: Number(row.upVotes),
      downVotes: Number(row.downVotes),
    })),
    totalUserCount: Number(totalRow?.count ?? 0),
  };
}
