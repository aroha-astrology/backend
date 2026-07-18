import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { houseInsights, type HouseInsightRow } from '../../db/schema.js';

/** Consider a 'generating' row abandoned (crashed mid-run, no heartbeat) after this long. */
export const STALE_GENERATING_MS = 5 * 60_000;

export async function findHouseInsight(
  userId: string,
  house: number,
): Promise<HouseInsightRow | undefined> {
  const rows = await db
    .select()
    .from(houseInsights)
    .where(and(eq(houseInsights.userId, userId), eq(houseInsights.house, house)))
    .limit(1);
  return rows[0];
}

/**
 * Atomically claim generation for a (userId, house). Returns the claimed row
 * (with the fresh `startedAt` as the claim token) if THIS caller won, or
 * `undefined` if there's nothing to do — another run already owns it (and
 * isn't stale), or it's already `ready` (unless `force`). Same primitive as
 * `claimHoroscopeGeneration`/`claimKundliGeneration`.
 */
export async function claimHouseInsightGeneration(
  userId: string,
  house: number,
  opts: { force?: boolean } = {},
): Promise<HouseInsightRow | undefined> {
  const now = new Date();
  const staleSeconds = STALE_GENERATING_MS / 1000;
  const claimable = sql`(${houseInsights.status} <> 'generating' OR ${houseInsights.updatedAt} < now() - ${staleSeconds} * interval '1 second')`;
  const setWhere = opts.force
    ? claimable
    : sql`${claimable} AND ${houseInsights.status} <> 'ready'`;

  const [row] = await db
    .insert(houseInsights)
    .values({ userId, house, status: 'generating', startedAt: now, error: null })
    .onConflictDoUpdate({
      target: [houseInsights.userId, houseInsights.house],
      // Must exactly match the partial `house_insights_user_house_primary_unique`
      // index's predicate — Postgres only infers a bare `ON CONFLICT (cols)`
      // target against a NON-partial unique index/constraint; a partial index
      // needs its WHERE repeated here or the conflict target fails to resolve.
      targetWhere: sql`${houseInsights.birthProfileId} is null`,
      set: { status: 'generating', startedAt: now, error: null, updatedAt: now },
      setWhere,
    })
    .returning();

  return row;
}

/**
 * Wipe every cached house insight for a user — used when their birth
 * details change (natal chart is regenerated) so previously-unlocked
 * houses regenerate fresh against the new chart on next view instead of
 * silently serving stale text forever.
 */
export async function deleteHouseInsightsForUser(userId: string): Promise<void> {
  await db.delete(houseInsights).where(eq(houseInsights.userId, userId));
}

export async function markHouseInsightReady(
  userId: string,
  house: number,
  claimedAt: Date,
  patch: { text: string; strengths: string[]; weaknesses: string[]; model: string },
): Promise<void> {
  await db
    .update(houseInsights)
    .set({ ...patch, status: 'ready', error: null, updatedAt: new Date() })
    .where(
      and(
        eq(houseInsights.userId, userId),
        eq(houseInsights.house, house),
        eq(houseInsights.status, 'generating'),
        eq(houseInsights.startedAt, claimedAt),
      ),
    );
}

export async function saveHouseInsightTranslation(
  userId: string,
  house: number,
  language: string,
  translation: { text?: string; strengths?: string[]; weaknesses?: string[] },
): Promise<void> {
  const existing = await db
    .select({ translations: houseInsights.translations })
    .from(houseInsights)
    .where(and(eq(houseInsights.userId, userId), eq(houseInsights.house, house)))
    .limit(1)
    .then((r) => r[0]);

  if (!existing) return; // if it was deleted, do nothing

  const translations = existing.translations || {};
  translations[language] = translation;

  await db
    .update(houseInsights)
    .set({ translations })
    .where(and(eq(houseInsights.userId, userId), eq(houseInsights.house, house)));
}

export async function markHouseInsightFailed(
  userId: string,
  house: number,
  claimedAt: Date,
  error: string,
): Promise<void> {
  await db
    .update(houseInsights)
    .set({ status: 'failed', error: error.slice(0, 1000), updatedAt: new Date() })
    .where(
      and(
        eq(houseInsights.userId, userId),
        eq(houseInsights.house, house),
        eq(houseInsights.status, 'generating'),
        eq(houseInsights.startedAt, claimedAt),
      ),
    );
}
