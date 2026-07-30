import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { palmReadings, type PalmReadingRow } from '../../db/schema.js';

/** Consider a 'generating' row abandoned (crashed mid-run) after this long — same value as
 * every other report-style generation lock in this codebase (gemstone, reports). */
export const PALM_STALE_GENERATING_MS = 5 * 60_000;

function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(palmReadings.birthProfileId)
    : eq(palmReadings.birthProfileId, birthProfileId);
}

export async function createPendingPalmReading(
  userId: string,
  birthProfileId: string | null,
  primaryHand: 'left' | 'right',
): Promise<PalmReadingRow> {
  const [row] = await db
    .insert(palmReadings)
    .values({ userId, birthProfileId, primaryHand, status: 'pending' })
    .returning();
  return row!;
}

export async function findPalmReadingById(id: string): Promise<PalmReadingRow | undefined> {
  const rows = await db.select().from(palmReadings).where(eq(palmReadings.id, id)).limit(1);
  return rows[0];
}

/** A previous READY reading for this user with an identical frame set — dedupe target so a
 * repeat upload skips the vision call entirely. */
/** Matches 'observed' or 'ready' — both statuses carry valid Stage-A `observations`, so
 * either is a legitimate dedupe target for skipping a repeat vision call. */
export async function findReadyPalmReadingByFramesHash(
  userId: string,
  framesHash: string,
): Promise<PalmReadingRow | undefined> {
  const rows = await db
    .select()
    .from(palmReadings)
    .where(
      and(
        eq(palmReadings.userId, userId),
        eq(palmReadings.framesHash, framesHash),
        inArray(palmReadings.status, ['observed', 'ready']),
      ),
    )
    .orderBy(desc(palmReadings.createdAt))
    .limit(1);
  return rows[0];
}

export async function listPalmReadingsForUser(
  userId: string,
  birthProfileId: string | null,
): Promise<PalmReadingRow[]> {
  return db
    .select()
    .from(palmReadings)
    .where(and(eq(palmReadings.userId, userId), profileFilter(birthProfileId)))
    .orderBy(desc(palmReadings.createdAt));
}

/** Merge one uploaded frame's path/hash into the row's `frames` jsonb. Read-merge-write is
 * safe here — only the owning user uploads to their own reading, no concurrent writers. */
export async function saveUploadedFrame(
  readingId: string,
  slot: string,
  frame: { path: string; hash: string; capturedAt: string },
): Promise<void> {
  const row = await findPalmReadingById(readingId);
  if (!row) return;
  const frames = { ...row.frames, [slot]: frame };
  await db
    .update(palmReadings)
    .set({ frames, updatedAt: new Date() })
    .where(eq(palmReadings.id, readingId));
}

export async function setFramesHash(readingId: string, framesHash: string): Promise<void> {
  await db
    .update(palmReadings)
    .set({ framesHash, updatedAt: new Date() })
    .where(eq(palmReadings.id, readingId));
}

/** Merges one hand's client-computed CV mount-relief scores into the row's `mountRelief`
 * jsonb — read-merge-write, same posture as saveUploadedFrame (only the owning user writes
 * to their own reading, no concurrent writers). Best-effort by design: called independently
 * of frame upload, so a failure here never blocks the capture flow. */
export async function saveMountRelief(
  readingId: string,
  hand: 'primary' | 'secondary',
  scores: Record<string, number>,
): Promise<void> {
  const row = await findPalmReadingById(readingId);
  if (!row) return;
  const mountRelief: Record<string, Record<string, number>> = {
    ...row.mountRelief,
    [hand]: scores,
  };
  await db
    .update(palmReadings)
    .set({ mountRelief, updatedAt: new Date() })
    .where(eq(palmReadings.id, readingId));
}

/**
 * Atomically claim generation for one reading. Returns the claimed row (with `startedAt` as
 * the claim token) iff THIS caller won; `undefined` if another live run owns it or it's
 * already ready. Row-scoped by primary key, so — unlike gemstone/vastu's per-profile
 * ON CONFLICT dance — a plain guarded UPDATE is sufficient (no uniqueness constraint to
 * race against; each reading is its own row).
 */
/** 'pending'/'failed' before an observation exists yet — the free Stage-A phase.
 * 'observed'/'failed' once Stage A succeeded — the paid Stage B/C (unlock) phase.
 * A stale 'generating' row (either phase) is always reclaimable, matching the fencing
 * discipline every other claim-and-fence table in this codebase uses. */
export async function claimPalmGeneration(
  readingId: string,
  fromStatuses: readonly string[] = ['pending', 'failed'],
): Promise<PalmReadingRow | undefined> {
  const now = new Date();
  const staleSeconds = PALM_STALE_GENERATING_MS / 1000;
  const fromList = sql.join(
    fromStatuses.map((s) => sql`${s}`),
    sql`, `,
  );
  const claimable = sql`(${palmReadings.status} in (${fromList}) OR (${palmReadings.status} = 'generating' AND ${palmReadings.updatedAt} < now() - ${staleSeconds} * interval '1 second'))`;

  const [row] = await db
    .update(palmReadings)
    .set({ status: 'generating', startedAt: now, error: null, updatedAt: now })
    .where(and(eq(palmReadings.id, readingId), claimable))
    .returning();
  return row;
}

/** Free Stage-A phase completion — populates `observations`, leaves `content` untouched
 * (null on first run). Status becomes 'observed': the free teaser is now viewable. */
export async function markPalmReadingObserved(
  readingId: string,
  claimedAt: Date,
  patch: { observations: Record<string, unknown>; confidenceScore: number; model: string },
): Promise<void> {
  await db
    .update(palmReadings)
    .set({ ...patch, status: 'observed', error: null, updatedAt: new Date() })
    .where(
      and(
        eq(palmReadings.id, readingId),
        eq(palmReadings.status, 'generating'),
        eq(palmReadings.startedAt, claimedAt),
      ),
    );
}

/** Paid Stage B/C phase completion — populates `content`/`scores`/`synthesis` on top of the
 * already-stored Stage-A `observations`. */
export async function markPalmReadingReady(
  readingId: string,
  claimedAt: Date,
  patch: {
    content: Record<string, unknown>;
    model: string;
  },
): Promise<void> {
  await db
    .update(palmReadings)
    .set({ ...patch, translations: {}, status: 'ready', error: null, updatedAt: new Date() })
    .where(
      and(
        eq(palmReadings.id, readingId),
        eq(palmReadings.status, 'generating'),
        eq(palmReadings.startedAt, claimedAt),
      ),
    );
}

export async function markPalmReadingFailed(
  readingId: string,
  claimedAt: Date,
  error: string,
): Promise<void> {
  await db
    .update(palmReadings)
    .set({ status: 'failed', error: error.slice(0, 1000), updatedAt: new Date() })
    .where(
      and(
        eq(palmReadings.id, readingId),
        eq(palmReadings.status, 'generating'),
        eq(palmReadings.startedAt, claimedAt),
      ),
    );
}

export async function markPalmReadingUnlocked(
  readingId: string,
  pricePaidPaise: number,
): Promise<void> {
  await db
    .update(palmReadings)
    .set({ unlocked: true, pricePaidPaise, updatedAt: new Date() })
    .where(eq(palmReadings.id, readingId));
}

export async function savePalmTranslation(
  readingId: string,
  language: string,
  translation: Record<string, unknown>,
): Promise<void> {
  const row = await findPalmReadingById(readingId);
  if (!row) return;
  const translations = { ...row.translations, [language]: translation };
  await db.update(palmReadings).set({ translations }).where(eq(palmReadings.id, readingId));
}

export async function findStaleGeneratingPalmReadings(): Promise<PalmReadingRow[]> {
  const staleSeconds = PALM_STALE_GENERATING_MS / 1000;
  return db
    .select()
    .from(palmReadings)
    .where(
      and(
        eq(palmReadings.status, 'generating'),
        sql`${palmReadings.updatedAt} < now() - ${staleSeconds} * interval '1 second'`,
      ),
    );
}
