import { and, gte, lt, max } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { onlineUserSamples } from '../../db/schema.js';

/** Records one concurrent-online-count snapshot, taken by checkConcurrentActivity(). */
export async function insertOnlineSample(onlineCount: number): Promise<void> {
  await db.insert(onlineUserSamples).values({ onlineCount });
}

/** Peak concurrent-online-count observed in [from, to) — 0 if no samples fall in range. */
export async function maxOnlineCountBetween(from: Date, to: Date): Promise<number> {
  const [res] = await db
    .select({ max: max(onlineUserSamples.onlineCount) })
    .from(onlineUserSamples)
    .where(and(gte(onlineUserSamples.sampledAt, from), lt(onlineUserSamples.sampledAt, to)));
  return res?.max ?? 0;
}
