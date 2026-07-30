import { eq, isNull, and } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { kundlis, saturnPhases, type SaturnPhaseRow } from '../../db/schema.js';
import type { SaturnPhase } from '../../lib/astro-engine/doshas/saturnPhaseTimeline.js';

export interface KundliMoonSign {
  userId: string;
  birthProfileId: string | null;
  moonSignIndex: number;
}

/**
 * Every ready kundli's natal Moon sign index, extracted from the stored
 * chartData in application code (no jsonb path digging in SQL) — one row
 * per (user, profile). Rows whose chart lacks a Moon placement are skipped.
 */
export async function listReadyKundliMoonSigns(): Promise<KundliMoonSign[]> {
  const rows = await db
    .select({
      userId: kundlis.userId,
      birthProfileId: kundlis.birthProfileId,
      chartData: kundlis.chartData,
    })
    .from(kundlis)
    .where(eq(kundlis.status, 'ready'));

  const result: KundliMoonSign[] = [];
  for (const row of rows) {
    const planets = (row.chartData?.planets as Array<Record<string, unknown>> | undefined) ?? [];
    const moon = planets.find((p) => p.planet === 'Moon');
    const moonSignIndex = moon?.signIndex as number | undefined;
    if (moonSignIndex === undefined) continue;
    result.push({ userId: row.userId, birthProfileId: row.birthProfileId, moonSignIndex });
  }
  return result;
}

/** All currently-stored Saturn phase rows, keyed by `${userId}:${birthProfileId ?? ''}`. */
export async function listSaturnPhasesByKey(): Promise<Map<string, SaturnPhaseRow>> {
  const rows = await db.select().from(saturnPhases);
  const map = new Map<string, SaturnPhaseRow>();
  for (const row of rows) {
    map.set(`${row.userId}:${row.birthProfileId ?? ''}`, row);
  }
  return map;
}

/**
 * Insert or update a single user/profile's current phase. Deliberately a
 * plain read-then-write (via the caller's already-fetched map, see
 * saturn-phase-alert.service.ts) rather than a single ON CONFLICT statement —
 * this repo has no live database available to verify ON CONFLICT semantics
 * against the two PARTIAL unique indexes (userPrimaryUnique/userProfileUnique),
 * so an explicit, easily-verified update-or-insert is the safer choice.
 */
export async function upsertSaturnPhase(
  userId: string,
  birthProfileId: string | null,
  phase: SaturnPhase,
  windowStart: Date | null,
  windowEnd: Date | null,
  existingId: string | undefined,
): Promise<void> {
  const now = new Date();
  if (existingId) {
    await db
      .update(saturnPhases)
      .set({ phase, windowStart, windowEnd, lastCheckedAt: now, updatedAt: now })
      .where(eq(saturnPhases.id, existingId));
    return;
  }
  await db.insert(saturnPhases).values({
    userId,
    birthProfileId,
    phase,
    windowStart,
    windowEnd,
    lastCheckedAt: now,
  });
}

/** Look up a single user/profile's stored phase row, if any (used by tests/ad-hoc reads). */
export async function findSaturnPhase(
  userId: string,
  birthProfileId: string | null,
): Promise<SaturnPhaseRow | undefined> {
  const [row] = await db
    .select()
    .from(saturnPhases)
    .where(
      and(
        eq(saturnPhases.userId, userId),
        birthProfileId === null
          ? isNull(saturnPhases.birthProfileId)
          : eq(saturnPhases.birthProfileId, birthProfileId),
      ),
    )
    .limit(1);
  return row;
}
