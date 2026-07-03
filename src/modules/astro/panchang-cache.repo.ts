import { and, eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { panchangCache, type PanchangCacheRow } from '../../db/schema.js';
import type { PanchangData } from '@aroha-astrology/shared';

export async function findCachedPanchang(
  forDate: string,
  refKey: string,
): Promise<PanchangCacheRow | undefined> {
  const rows = await db
    .select()
    .from(panchangCache)
    .where(and(eq(panchangCache.forDate, forDate), eq(panchangCache.refKey, refKey)))
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
  await db
    .insert(panchangCache)
    .values({ forDate, refKey, lat, lon, data })
    .onConflictDoUpdate({
      target: [panchangCache.forDate, panchangCache.refKey],
      set: { lat, lon, data },
    });
}
