import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { kundlis, type KundliRow, type NewKundliRow } from '../../db/schema.js';

/** Consider a 'generating' row abandoned (crashed mid-run) after this long. */
export const STALE_GENERATING_MS = 5 * 60_000;

export async function findKundliByUserId(userId: string): Promise<KundliRow | undefined> {
  const rows = await db.select().from(kundlis).where(eq(kundlis.userId, userId)).limit(1);
  return rows[0];
}

/**
 * Atomically claim generation for a user. Returns the claimed row if THIS
 * caller won the claim (and should run generation), or `undefined` if there is
 * nothing to do — i.e. another run is already in progress (and not stale), or a
 * `ready` kundli already exists for this exact `birthHash`.
 *
 * The conditional ON CONFLICT update is the dedupe mechanism, so it is correct
 * across multiple processes without relying on an external lock.
 */
export async function claimKundliGeneration(
  userId: string,
  birthHash: string,
  opts: { force?: boolean } = {},
): Promise<KundliRow | undefined> {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_GENERATING_MS);

  // Claimable when no fresh run is in flight, OR when an in-flight run is
  // computing a DIFFERENT birthHash (a corrected birth date supersedes it).
  const claimable = sql`(${kundlis.status} <> 'generating' OR ${kundlis.startedAt} < ${staleCutoff} OR ${kundlis.birthHash} <> ${birthHash})`;
  // Normal path additionally skips a kundli already ready for this exact hash;
  // `force` (regenerate endpoint) recomputes even then.
  const setWhere = opts.force
    ? claimable
    : sql`${claimable} AND NOT (${kundlis.status} = 'ready' AND ${kundlis.birthHash} = ${birthHash})`;

  const [row] = await db
    .insert(kundlis)
    .values({ userId, status: 'generating', birthHash, startedAt: now, error: null })
    .onConflictDoUpdate({
      target: kundlis.userId,
      set: { status: 'generating', birthHash, startedAt: now, error: null, updatedAt: now },
      setWhere,
    })
    .returning();

  return row;
}

export async function markKundliReady(
  userId: string,
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
        eq(kundlis.status, 'generating'),
        eq(kundlis.startedAt, claimedAt),
      ),
    );
}

export async function markKundliFailed(
  userId: string,
  claimedAt: Date,
  error: string,
): Promise<void> {
  await db
    .update(kundlis)
    .set({ status: 'failed', error: error.slice(0, 1000), updatedAt: new Date() })
    .where(
      and(
        eq(kundlis.userId, userId),
        eq(kundlis.status, 'generating'),
        eq(kundlis.startedAt, claimedAt),
      ),
    );
}
