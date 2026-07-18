import { and, eq, isNull, sql, count } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { kundlis, type KundliRow, type NewKundliRow } from '../../db/schema.js';

/** Consider a 'generating' row abandoned (crashed mid-run) after this long. */
export const STALE_GENERATING_MS = 5 * 60_000;

/** `birthProfileId === null` filters to the primary/self profile; a non-null id filters to that additional profile. */
function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(kundlis.birthProfileId)
    : eq(kundlis.birthProfileId, birthProfileId);
}

export async function findKundliByUserId(
  userId: string,
  birthProfileId: string | null,
): Promise<KundliRow | undefined> {
  const rows = await db
    .select()
    .from(kundlis)
    .where(and(eq(kundlis.userId, userId), profileFilter(birthProfileId)))
    .limit(1);
  return rows[0];
}

export async function countFailedKundlis(): Promise<number> {
  const [res] = await db
    .select({ count: count() })
    .from(kundlis)
    .where(eq(kundlis.status, 'failed'));
  return res?.count ?? 0;
}

/**
 * Atomically claim generation for a user's profile (primary when
 * `birthProfileId` is null, otherwise that additional profile). Returns the
 * claimed row if THIS caller won the claim (and should run generation), or
 * `undefined` if there is nothing to do — i.e. another run is already in
 * progress (and not stale), or a `ready` kundli already exists for this exact
 * `birthHash`.
 *
 * The conditional ON CONFLICT update is the dedupe mechanism, so it is correct
 * across multiple processes without relying on an external lock.
 */
export async function claimKundliGeneration(
  userId: string,
  birthProfileId: string | null,
  birthHash: string,
  opts: { force?: boolean } = {},
): Promise<KundliRow | undefined> {
  const now = new Date();

  // Claimable when no fresh run is in flight, OR when an in-flight run is
  // computing a DIFFERENT birthHash (a corrected birth date supersedes it).
  // The stale cutoff is expressed as a SQL interval (NOT a JS Date) — a Date
  // embedded in a raw sql fragment isn't type-coerced and breaks the driver.
  const staleSeconds = STALE_GENERATING_MS / 1000;
  const claimable = sql`(${kundlis.status} <> 'generating' OR ${kundlis.startedAt} < now() - ${staleSeconds} * interval '1 second' OR ${kundlis.birthHash} <> ${birthHash})`;
  // Normal path additionally skips a kundli already ready for this exact hash;
  // `force` (regenerate endpoint) recomputes even then.
  const setWhere = opts.force
    ? claimable
    : sql`${claimable} AND NOT (${kundlis.status} = 'ready' AND ${kundlis.birthHash} = ${birthHash})`;

  const [row] =
    birthProfileId === null
      ? await db
          .insert(kundlis)
          .values({
            userId,
            birthProfileId: null,
            status: 'generating',
            birthHash,
            startedAt: now,
            error: null,
          })
          .onConflictDoUpdate({
            target: kundlis.userId,
            // Must exactly match the partial `kundlis_user_primary_unique` index's
            // predicate — Postgres only infers a bare `ON CONFLICT (col)` target
            // against a NON-partial unique index/constraint; a partial index needs
            // its WHERE repeated here or the conflict target fails to resolve.
            targetWhere: sql`${kundlis.birthProfileId} is null`,
            set: { status: 'generating', birthHash, startedAt: now, error: null, updatedAt: now },
            setWhere,
          })
          .returning()
      : await db
          .insert(kundlis)
          .values({
            userId,
            birthProfileId,
            status: 'generating',
            birthHash,
            startedAt: now,
            error: null,
          })
          .onConflictDoUpdate({
            // Matches the `kundlis_user_profile_unique` index's column set —
            // (userId, birthProfileId) — for the non-null (additional-profile) side.
            target: [kundlis.userId, kundlis.birthProfileId],
            // Must exactly match that index's partial predicate, same reasoning
            // as the primary-profile branch above.
            targetWhere: sql`${kundlis.birthProfileId} is not null`,
            set: { status: 'generating', birthHash, startedAt: now, error: null, updatedAt: now },
            setWhere,
          })
          .returning();

  return row;
}

export async function markKundliReady(
  userId: string,
  birthProfileId: string | null,
  claimedAt: Date,
  patch: Pick<
    NewKundliRow,
    | 'ayanamsa'
    | 'houseSystem'
    | 'timeKnown'
    | 'birthHash'
    | 'chartData'
    | 'dashaData'
    | 'yogaData'
    | 'doshaData'
    | 'ashtakavargaData'
  >,
): Promise<void> {
  // Fence on the claim token (startedAt): if a newer run superseded this one
  // (reclaim bumped startedAt), this write matches 0 rows and is correctly lost.
  await db
    .update(kundlis)
    .set({ ...patch, status: 'ready', error: null, generatedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(kundlis.userId, userId),
        profileFilter(birthProfileId),
        eq(kundlis.status, 'generating'),
        eq(kundlis.startedAt, claimedAt),
      ),
    );
}

export async function markKundliFailed(
  userId: string,
  birthProfileId: string | null,
  claimedAt: Date,
  error: string,
): Promise<void> {
  await db
    .update(kundlis)
    .set({ status: 'failed', error: error.slice(0, 1000), updatedAt: new Date() })
    .where(
      and(
        eq(kundlis.userId, userId),
        profileFilter(birthProfileId),
        eq(kundlis.status, 'generating'),
        eq(kundlis.startedAt, claimedAt),
      ),
    );
}
