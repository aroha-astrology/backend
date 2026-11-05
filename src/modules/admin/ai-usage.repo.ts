import { and, eq, gte, lt, sql, count } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { aiUsage } from '../../db/schema.js';
import type { DateRange } from './admin.repo.js';

export interface NewAiUsageEntry {
  userId: string | null;
  agent: string;
  model: string;
  /** Which key tier served the call — free-tier calls are billed at ₹0. */
  tier?: 'free' | 'paid';
  tokensIn: number;
  tokensOut: number;
  durationMs: number;
  /** Input tokens the provider served from its prompt cache (audit L10). 0 = reported, none. */
  cachedTokens?: number;
  /** Voice only (audit L9): seconds of audio the minted token could cover. */
  audioSeconds?: number;
}

/** Records one LLM call's token/timing telemetry. See gemini-client.ts's `generate()` for the (fire-and-forget, must-never-throw) call site. */
export async function insertAiUsage(entry: NewAiUsageEntry): Promise<void> {
  await db.insert(aiUsage).values(entry);
}

export interface AgentCostRow {
  agent: string;
  tokensIn: number;
  tokensOut: number;
  calls: number;
  /**
   * The billed subset. Only calls served by the paid reserve cost anything —
   * free-tier calls are ₹0 however many tokens they burn — so these are broken
   * out rather than folded into the totals above. Rows written before the paid
   * reserve existed have a null tier and are correctly counted as free.
   */
  paidTokensIn: number;
  paidTokensOut: number;
  paidCalls: number;
  /** Input tokens served from the provider's prompt cache (audit L10), all tiers. */
  cachedTokensIn: number;
  /** The cached subset of paidTokensIn: the part billed at the cached rate. */
  paidCachedTokensIn: number;
  /**
   * Calls whose row carries a cached-token figure at all (0 counts). Rows from before the column
   * existed are NULL and must not drag a hit rate down, so the rate is cachedTokensIn over the
   * input of THESE calls only; see tokensInOfCacheReportedCalls.
   */
  cacheReportedCalls: number;
  /** Input tokens of the calls counted in cacheReportedCalls: the denominator of the hit rate. */
  tokensInOfCacheReportedCalls: number;
  /** Voice: seconds of audio minted (60 per minute); 0 for every other agent. */
  audioSeconds: number;
}

/**
 * Token usage + call volume grouped by agent within `range` (by `createdAt`),
 * optionally narrowed to one user — feeds the admin dashboard's LLM cost
 * breakdown.
 *
 * Rupee conversion stays client-side (see frontend `lib/admin-format.ts`) since
 * per-token pricing changes independently of this code.
 */
export async function costByAgent(
  range: DateRange,
  opts: { userId?: string } = {},
): Promise<AgentCostRow[]> {
  const paid = sql`${aiUsage.tier} = 'paid'`;
  const rows = await db
    .select({
      agent: aiUsage.agent,
      tokensIn: sql<number>`coalesce(sum(${aiUsage.tokensIn}), 0)`,
      tokensOut: sql<number>`coalesce(sum(${aiUsage.tokensOut}), 0)`,
      calls: count(),
      paidTokensIn: sql<number>`coalesce(sum(${aiUsage.tokensIn}) filter (where ${paid}), 0)`,
      paidTokensOut: sql<number>`coalesce(sum(${aiUsage.tokensOut}) filter (where ${paid}), 0)`,
      paidCalls: sql<number>`count(*) filter (where ${paid})`,
      cachedTokensIn: sql<number>`coalesce(sum(${aiUsage.cachedTokens}), 0)`,
      paidCachedTokensIn: sql<number>`coalesce(sum(${aiUsage.cachedTokens}) filter (where ${paid}), 0)`,
      cacheReportedCalls: sql<number>`count(${aiUsage.cachedTokens})`,
      tokensInOfCacheReportedCalls: sql<number>`coalesce(sum(${aiUsage.tokensIn}) filter (where ${aiUsage.cachedTokens} is not null), 0)`,
      audioSeconds: sql<number>`coalesce(sum(${aiUsage.audioSeconds}), 0)`,
    })
    .from(aiUsage)
    .where(
      and(
        gte(aiUsage.createdAt, range.from),
        lt(aiUsage.createdAt, range.to),
        ...(opts.userId ? [eq(aiUsage.userId, opts.userId)] : []),
      ),
    )
    .groupBy(aiUsage.agent);
  return rows.map((row) => ({
    agent: row.agent,
    tokensIn: Number(row.tokensIn),
    tokensOut: Number(row.tokensOut),
    calls: row.calls,
    // `?? 0` rather than a bare Number(): the SQL coalesces, but a driver that
    // omits the column entirely would otherwise yield NaN and poison every
    // downstream rupee total silently.
    paidTokensIn: Number(row.paidTokensIn ?? 0),
    paidTokensOut: Number(row.paidTokensOut ?? 0),
    paidCalls: Number(row.paidCalls ?? 0),
    cachedTokensIn: Number(row.cachedTokensIn ?? 0),
    paidCachedTokensIn: Number(row.paidCachedTokensIn ?? 0),
    cacheReportedCalls: Number(row.cacheReportedCalls ?? 0),
    tokensInOfCacheReportedCalls: Number(row.tokensInOfCacheReportedCalls ?? 0),
    audioSeconds: Number(row.audioSeconds ?? 0),
  }));
}
