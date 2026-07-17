import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { gemstoneRecommendations, type GemstoneRecommendationRow } from '../../db/schema.js';

/** Consider a 'generating' row abandoned (crashed mid-run) after this long. */
export const GEMSTONE_STALE_GENERATING_MS = 5 * 60_000;

export async function findGemstoneRecommendation(
  userId: string,
): Promise<GemstoneRecommendationRow | undefined> {
  const rows = await db
    .select()
    .from(gemstoneRecommendations)
    .where(eq(gemstoneRecommendations.userId, userId))
    .limit(1);
  return rows[0];
}

/**
 * Atomically claim generation for a user's gemstone report. Returns the claimed
 * row (with `startedAt` as the claim token) if THIS caller won, or `undefined`
 * if another live run owns it or a ready row already exists. Same primitive as
 * `claimHouseInsightGeneration`, keyed by userId (one report per user).
 */
export async function claimGemstoneGeneration(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<GemstoneRecommendationRow | undefined> {
  const now = new Date();
  const staleSeconds = GEMSTONE_STALE_GENERATING_MS / 1000;
  const claimable = sql`(${gemstoneRecommendations.status} <> 'generating' OR ${gemstoneRecommendations.updatedAt} < now() - ${staleSeconds} * interval '1 second')`;
  const setWhere = opts.force
    ? claimable
    : sql`${claimable} AND ${gemstoneRecommendations.status} <> 'ready'`;

  const [row] = await db
    .insert(gemstoneRecommendations)
    .values({ userId, status: 'generating', startedAt: now, error: null })
    .onConflictDoUpdate({
      target: gemstoneRecommendations.userId,
      set: { status: 'generating', startedAt: now, error: null, updatedAt: now },
      setWhere,
    })
    .returning();

  return row;
}

export async function markGemstoneReady(
  userId: string,
  claimedAt: Date,
  patch: { analysis: Record<string, unknown>; model: string },
): Promise<void> {
  await db
    .update(gemstoneRecommendations)
    .set({ ...patch, status: 'ready', error: null, updatedAt: new Date() })
    .where(
      and(
        eq(gemstoneRecommendations.userId, userId),
        eq(gemstoneRecommendations.status, 'generating'),
        eq(gemstoneRecommendations.startedAt, claimedAt),
      ),
    );
}

export async function saveGemstoneTranslation(
  userId: string,
  language: string,
  translation: Record<string, unknown>,
): Promise<void> {
  const existing = await db
    .select({ translations: gemstoneRecommendations.translations })
    .from(gemstoneRecommendations)
    .where(eq(gemstoneRecommendations.userId, userId))
    .limit(1)
    .then((r) => r[0]);
  if (!existing) return;

  const translations = existing.translations || {};
  translations[language] = translation;

  await db
    .update(gemstoneRecommendations)
    .set({ translations })
    .where(eq(gemstoneRecommendations.userId, userId));
}

export async function markGemstoneFailed(
  userId: string,
  claimedAt: Date,
  error: string,
): Promise<void> {
  await db
    .update(gemstoneRecommendations)
    .set({ status: 'failed', error: error.slice(0, 1000), updatedAt: new Date() })
    .where(
      and(
        eq(gemstoneRecommendations.userId, userId),
        eq(gemstoneRecommendations.status, 'generating'),
        eq(gemstoneRecommendations.startedAt, claimedAt),
      ),
    );
}

/**
 * Wipe the cached gemstone report for a user — used when their birth details
 * change (natal chart regenerates) so the report regenerates fresh on next
 * view. The unlock flag on the user row is untouched: they stay unlocked, no
 * re-charge (same policy as house insights).
 */
export async function deleteGemstoneForUser(userId: string): Promise<void> {
  await db.delete(gemstoneRecommendations).where(eq(gemstoneRecommendations.userId, userId));
}
