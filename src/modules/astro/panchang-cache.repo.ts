import { and, eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { panchangCache, type PanchangCacheRow } from '../../db/schema.js';
import type { PanchangData } from '@aroha-astrology/shared';

/**
 * Bump whenever a change adds/removes/reshapes fields on the cached
 * `PanchangData` payload — folded into the DB key below so rows written
 * under a previous shape are never served as "correct" under the new one.
 * v2: added moonriseTime/moonsetTime and tithi/nakshatra endsAt/nextName
 * (see rise-set.ts and boundaries.ts) — pre-v2 rows have neither field, and
 * without this bump would otherwise keep being served, looking like a
 * permanent "no moonrise today" for every cached (date, refKey) already
 * warmed before this change shipped.
 */
const CACHE_VERSION = 'v2';

/** Folds `CACHE_VERSION` into the DB key so a version bump can't collide with, or accidentally match, a row from a previous shape. */
function versionedKey(refKey: string): string {
  return `${CACHE_VERSION}:${refKey}`;
}

export async function findCachedPanchang(
  forDate: string,
  refKey: string,
): Promise<PanchangCacheRow | undefined> {
  const rows = await db
    .select()
    .from(panchangCache)
    .where(and(eq(panchangCache.forDate, forDate), eq(panchangCache.refKey, versionedKey(refKey))))
    .limit(1);
  return rows[0];
}

/** Idempotent per (forDate, refKey): re-running (e.g. a retried cron) overwrites cleanly. */
export async function upsertCachedPanchang(params: {
  forDate: string;
  refKey: string;
  lat: number;
  lon: number;
  data: PanchangData;
}): Promise<void> {
  const { forDate, refKey, lat, lon, data } = params;
  const key = versionedKey(refKey);
  await db
    .insert(panchangCache)
    .values({ forDate, refKey: key, lat, lon, data })
    .onConflictDoUpdate({
      target: [panchangCache.forDate, panchangCache.refKey],
      set: { lat, lon, data },
    });
}
