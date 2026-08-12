import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { remedyInsights, type RemedyInsightRow } from '../../db/schema.js';

/** Consider a 'generating' row abandoned (crashed mid-run) after this long. */
export const REMEDY_INSIGHT_STALE_GENERATING_MS = 5 * 60_000;

/** `birthProfileId === null` filters to the primary/self profile; a non-null id filters to that additional profile. */
function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(remedyInsights.birthProfileId)
    : eq(remedyInsights.birthProfileId, birthProfileId);
}

export async function findRemedyInsight(
  userId: string,
  birthProfileId: string | null,
): Promise<RemedyInsightRow | undefined> {
  const rows = await db
    .select()
    .from(remedyInsights)
    .where(and(eq(remedyInsights.userId, userId), profileFilter(birthProfileId)))
    .limit(1);
  return rows[0];
}

/**
 * Atomically claim generation for one (userId, birthProfileId) remedy insight.
 * Returns the claimed row (with `startedAt` as the claim token) if THIS caller
 * won, or undefined if another live run owns it or a ready row already exists.
 * Same primitive as claimGemstoneGeneration — see its comments for why the
 * partial-index predicates must be repeated in `targetWhere`.
 */
export async function claimRemedyInsightGeneration(
  userId: string,
  birthProfileId: string | null,
  opts: { force?: boolean } = {},
): Promise<RemedyInsightRow | undefined> {
  const now = new Date();
  const staleSeconds = REMEDY_INSIGHT_STALE_GENERATING_MS / 1000;
  const claimable = sql`(${remedyInsights.status} <> 'generating' OR ${remedyInsights.updatedAt} < now() - ${staleSeconds} * interval '1 second')`;
  const setWhere = opts.force
    ? claimable
    : sql`${claimable} AND ${remedyInsights.status} <> 'ready'`;

  const [row] =
    birthProfileId === null
      ? await db
          .insert(remedyInsights)
          .values({
            userId,
            birthProfileId: null,
            status: 'generating',
            startedAt: now,
            error: null,
          })
          .onConflictDoUpdate({
            target: remedyInsights.userId,
            // Must exactly match the partial `remedy_insights_user_primary_unique`
            // index's predicate — Postgres only infers a bare `ON CONFLICT (col)`
            // target against a NON-partial unique index, so a partial one needs
            // its WHERE repeated here or the conflict target fails to resolve.
            targetWhere: sql`${remedyInsights.birthProfileId} is null`,
            set: { status: 'generating', startedAt: now, error: null, updatedAt: now },
            setWhere,
          })
          .returning()
      : await db
          .insert(remedyInsights)
          .values({ userId, birthProfileId, status: 'generating', startedAt: now, error: null })
          .onConflictDoUpdate({
            target: [remedyInsights.userId, remedyInsights.birthProfileId],
            targetWhere: sql`${remedyInsights.birthProfileId} is not null`,
            set: { status: 'generating', startedAt: now, error: null, updatedAt: now },
            setWhere,
          })
          .returning();

  return row;
}

export async function markRemedyInsightReady(
  userId: string,
  birthProfileId: string | null,
  claimedAt: Date,
  patch: { analysis: Record<string, unknown>; model: string },
): Promise<void> {
  await db
    .update(remedyInsights)
    // Drop cached translations whenever the English analysis changes, or
    // non-English readers would keep serving translations of the PREVIOUS
    // text forever (same trap gemstone_recommendations documents).
    .set({ ...patch, translations: null, status: 'ready', error: null, updatedAt: new Date() })
    .where(
      and(
        eq(remedyInsights.userId, userId),
        profileFilter(birthProfileId),
        eq(remedyInsights.status, 'generating'),
        eq(remedyInsights.startedAt, claimedAt),
      ),
    );
}

export async function markRemedyInsightFailed(
  userId: string,
  birthProfileId: string | null,
  claimedAt: Date,
  error: string,
): Promise<void> {
  await db
    .update(remedyInsights)
    .set({ status: 'failed', error: error.slice(0, 1000), updatedAt: new Date() })
    .where(
      and(
        eq(remedyInsights.userId, userId),
        profileFilter(birthProfileId),
        eq(remedyInsights.status, 'generating'),
        eq(remedyInsights.startedAt, claimedAt),
      ),
    );
}

export async function saveRemedyInsightTranslation(
  userId: string,
  birthProfileId: string | null,
  language: string,
  translation: Record<string, unknown>,
): Promise<void> {
  const existing = await db
    .select({ translations: remedyInsights.translations })
    .from(remedyInsights)
    .where(and(eq(remedyInsights.userId, userId), profileFilter(birthProfileId)))
    .limit(1)
    .then((r) => r[0]);
  if (!existing) return;

  const translations = existing.translations || {};
  translations[language] = translation;

  await db
    .update(remedyInsights)
    .set({ translations })
    .where(and(eq(remedyInsights.userId, userId), profileFilter(birthProfileId)));
}

/**
 * Wipe the cached explanations for ONE profile — called when that profile's
 * birth details change, so the prose regenerates against the new chart.
 * Scoped to a single profile so editing one never wipes a sibling's still-valid
 * cache (same policy as house insights and gemstone reports).
 */
export async function deleteRemedyInsightForUser(
  userId: string,
  birthProfileId: string | null,
): Promise<void> {
  await db
    .delete(remedyInsights)
    .where(and(eq(remedyInsights.userId, userId), profileFilter(birthProfileId)));
}
