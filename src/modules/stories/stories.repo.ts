import { and, gte, lt, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { storyEvents } from '../../db/schema.js';

export interface StoryEventInput {
  userId: string;
  /** The IST day, "YYYY-MM-DD". */
  eventDate: string;
  kind: 'view' | 'share';
  storyId: string;
  /** '' for a view. */
  channel: string;
}

/**
 * Records one event. A view is counted once per user, story and day, however
 * many times (or from however many phones) it is reported. A share adds to
 * that day's count for its channel, because each tap is a share attempt.
 */
export async function recordStoryEvent(event: StoryEventInput): Promise<void> {
  const insert = db.insert(storyEvents).values(event);
  if (event.kind === 'view') {
    await insert.onConflictDoNothing();
    return;
  }
  await insert.onConflictDoUpdate({
    target: [
      storyEvents.userId,
      storyEvents.eventDate,
      storyEvents.kind,
      storyEvents.storyId,
      storyEvents.channel,
    ],
    set: { count: sql`${storyEvents.count} + 1`, updatedAt: sql`now()` },
  });
}

/** Events in a date range, grouped the way the admin card breaks them down. */
export interface StoryEventGroup {
  kind: string;
  storyId: string;
  channel: string;
  /** Different users in this group. */
  users: number;
  /** Sum of the rows' counts. */
  total: number;
}

function inRange(range: { from: Date; to: Date }) {
  return and(gte(storyEvents.createdAt, range.from), lt(storyEvents.createdAt, range.to));
}

/** `to` is exclusive, like every admin date range (admin.repo.ts resolveDateRangePreset). */
export async function listStoryEventGroups(range: {
  from: Date;
  to: Date;
}): Promise<StoryEventGroup[]> {
  return db
    .select({
      kind: storyEvents.kind,
      storyId: storyEvents.storyId,
      channel: storyEvents.channel,
      users: sql<number>`count(distinct ${storyEvents.userId})::int`,
      total: sql<number>`coalesce(sum(${storyEvents.count}), 0)::int`,
    })
    .from(storyEvents)
    .where(inRange(range))
    .groupBy(storyEvents.kind, storyEvents.storyId, storyEvents.channel);
}

/**
 * Different users per kind across the whole range. Asked separately because
 * it cannot be added up from the groups above: someone who opened three
 * stories is in three groups but is one visitor.
 */
export async function countStoryUsersByKind(range: {
  from: Date;
  to: Date;
}): Promise<Array<{ kind: string; users: number }>> {
  return db
    .select({
      kind: storyEvents.kind,
      users: sql<number>`count(distinct ${storyEvents.userId})::int`,
    })
    .from(storyEvents)
    .where(inRange(range))
    .groupBy(storyEvents.kind);
}
