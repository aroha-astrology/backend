import { sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { feedbackCounters, chatFeedbackReports } from '../../db/schema.js';

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
