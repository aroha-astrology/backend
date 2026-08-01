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
 * v3: regionalMonths gained 6 new RegionId keys (gujarat/odisha/assam/tamil/
 * malayalam/punjab/kannada) — pre-v3 rows are missing them, which would
 * silently make the new regions "unavailable" forever for already-cached days.
 * v4: each RegionalMonth gained an optional dayOfMonth field (solar regions:
 * approximate; Nanakshahi: exact) — pre-v4 rows lack it, which would
 * silently make the monthly-calendar grid fall back to showing the same
 * tithi number for every region forever, for already-cached days.
 */
const CACHE_VERSION = 'v4';

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
