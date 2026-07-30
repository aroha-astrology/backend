import { and, gte, lt, sql, count } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { aiUsage } from '../../db/schema.js';
import type { DateRange } from './admin.repo.js';

export interface NewAiUsageEntry {
  userId: string | null;
  agent: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
}

/** Records one LLM call's token/timing telemetry. See gemini-client.ts's `generate()` for the (fire-and-forget, must-never-throw) call site. */
export async function insertAiUsage(entry: NewAiUsageEntry): Promise<void> {
  await db.insert(aiUsage).values(entry);
}

/** Token usage + call volume grouped by agent within `range` (by `createdAt`) — feeds the admin dashboard's LLM cost breakdown. Dollar-cost conversion happens client-side/in docs, not here, since per-token pricing can change independently of this code. */
export async function costByAgent(
  range: DateRange,
): Promise<{ agent: string; tokensIn: number; tokensOut: number; calls: number }[]> {
  const rows = await db
    .select({
      agent: aiUsage.agent,
      tokensIn: sql<number>`coalesce(sum(${aiUsage.tokensIn}), 0)`,
      tokensOut: sql<number>`coalesce(sum(${aiUsage.tokensOut}), 0)`,
      calls: count(),
    })
    .from(aiUsage)
    .where(and(gte(aiUsage.createdAt, range.from), lt(aiUsage.createdAt, range.to)))
    .groupBy(aiUsage.agent);
  return rows.map((row) => ({
    agent: row.agent,
    tokensIn: Number(row.tokensIn),
    tokensOut: Number(row.tokensOut),
    calls: row.calls,
  }));
}
