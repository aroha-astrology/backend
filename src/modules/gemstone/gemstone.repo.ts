import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { gemstoneRecommendations, type GemstoneRecommendationRow } from '../../db/schema.js';

/** Consider a 'generating' row abandoned (crashed mid-run) after this long. */
export const GEMSTONE_STALE_GENERATING_MS = 5 * 60_000;

/** `birthProfileId === null` filters to the primary/self profile; a non-null id filters to that additional profile. */
function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(gemstoneRecommendations.birthProfileId)
    : eq(gemstoneRecommendations.birthProfileId, birthProfileId);
}

export async function findGemstoneRecommendation(
  userId: string,
  birthProfileId: string | null,
): Promise<GemstoneRecommendationRow | undefined> {
  const rows = await db
    .select()
    .from(gemstoneRecommendations)
    .where(and(eq(gemstoneRecommendations.userId, userId), profileFilter(birthProfileId)))
    .limit(1);
  return rows[0];
}

/**
 * Atomically claim generation for a (userId, birthProfileId) gemstone report.
 * Returns the claimed row (with `startedAt` as the claim token) if THIS
 * caller won, or `undefined` if another live run owns it or a ready row
 * already exists. Same primitive as `claimHouseInsightGeneration`, keyed by
 * (userId, birthProfileId) — one report per profile.
 */
export async function claimGemstoneGeneration(
  userId: string,
  birthProfileId: string | null,
  opts: { force?: boolean } = {},
): Promise<GemstoneRecommendationRow | undefined> {
  const now = new Date();
  const staleSeconds = GEMSTONE_STALE_GENERATING_MS / 1000;
  const claimable = sql`(${gemstoneRecommendations.status} <> 'generating' OR ${gemstoneRecommendations.updatedAt} < now() - ${staleSeconds} * interval '1 second')`;
  const setWhere = opts.force
    ? claimable
    : sql`${claimable} AND ${gemstoneRecommendations.status} <> 'ready'`;

  const [row] =
    birthProfileId === null
      ? await db
          .insert(gemstoneRecommendations)
          .values({
            userId,
            birthProfileId: null,
            status: 'generating',
            startedAt: now,
            error: null,
          })
          .onConflictDoUpdate({
            target: gemstoneRecommendations.userId,
            // Must exactly match the partial `gemstone_recommendations_user_primary_unique`
            // index's predicate — Postgres only infers a bare `ON CONFLICT (col)`
            // target against a NON-partial unique index/constraint; a partial index
            // needs its WHERE repeated here or the conflict target fails to resolve.
            targetWhere: sql`${gemstoneRecommendations.birthProfileId} is null`,
            set: { status: 'generating', startedAt: now, error: null, updatedAt: now },
            setWhere,
          })
          .returning()
      : await db
          .insert(gemstoneRecommendations)
          .values({ userId, birthProfileId, status: 'generating', startedAt: now, error: null })
          .onConflictDoUpdate({
            // Matches the `gemstone_recommendations_user_profile_unique` index's
            // column set — (userId, birthProfileId) — for the non-null
            // (additional-profile) side.
            target: [gemstoneRecommendations.userId, gemstoneRecommendations.birthProfileId],
            // Must exactly match that index's partial predicate, same reasoning
            // as the primary-profile branch above.
            targetWhere: sql`${gemstoneRecommendations.birthProfileId} is not null`,
            set: { status: 'generating', startedAt: now, error: null, updatedAt: now },
            setWhere,
          })
          .returning();

  return row;
}

export async function markGemstoneReady(
  userId: string,
  birthProfileId: string | null,
  claimedAt: Date,
  patch: { analysis: Record<string, unknown>; model: string },
): Promise<void> {
  await db
    .update(gemstoneRecommendations)
    // Reset cached translations whenever the underlying English analysis changes (e.g. a forced
    // regeneration) — otherwise non-English users would keep serving stale translations of the
    // PREVIOUS intro/notes forever, the same staleness bug this whole fix is about, one layer down.
    .set({ ...patch, translations: null, status: 'ready', error: null, updatedAt: new Date() })
    .where(
      and(
        eq(gemstoneRecommendations.userId, userId),
        profileFilter(birthProfileId),
        eq(gemstoneRecommendations.status, 'generating'),
        eq(gemstoneRecommendations.startedAt, claimedAt),
      ),
    );
}

export async function saveGemstoneTranslation(
  userId: string,
  birthProfileId: string | null,
  language: string,
  translation: Record<string, unknown>,
): Promise<void> {
  const existing = await db
    .select({ translations: gemstoneRecommendations.translations })
    .from(gemstoneRecommendations)
    .where(and(eq(gemstoneRecommendations.userId, userId), profileFilter(birthProfileId)))
    .limit(1)
    .then((r) => r[0]);
  if (!existing) return;

  const translations = existing.translations || {};
  translations[language] = translation;

  await db
    .update(gemstoneRecommendations)
    .set({ translations })
    .where(and(eq(gemstoneRecommendations.userId, userId), profileFilter(birthProfileId)));
}

export async function markGemstoneFailed(
  userId: string,
  birthProfileId: string | null,
  claimedAt: Date,
  error: string,
): Promise<void> {
  await db
    .update(gemstoneRecommendations)
    .set({ status: 'failed', error: error.slice(0, 1000), updatedAt: new Date() })
    .where(
      and(
        eq(gemstoneRecommendations.userId, userId),
        profileFilter(birthProfileId),
        eq(gemstoneRecommendations.status, 'generating'),
        eq(gemstoneRecommendations.startedAt, claimedAt),
      ),
    );
}

/**
 * Wipe the cached gemstone report for a user's ONE profile — used when that
 * profile's birth details change (natal chart regenerates) so the report
 * regenerates fresh on next view. The unlock flag is untouched: that profile
 * stays unlocked, no re-charge (same policy as house insights). Scoped to a
 * single profile so editing one profile's birth details never wipes a
 * sibling profile's still-valid cached report.
 */
export async function deleteGemstoneForUser(
  userId: string,
  birthProfileId: string | null,
): Promise<void> {
  await db
    .delete(gemstoneRecommendations)
    .where(and(eq(gemstoneRecommendations.userId, userId), profileFilter(birthProfileId)));
}
