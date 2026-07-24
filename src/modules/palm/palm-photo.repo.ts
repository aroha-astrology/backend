// =============================================================================
// Palm photo repo — a short-lived (48h) staging area for palm-reading photo
// uploads, keyed like prime_reports (nullable birthProfileId = primary
// profile, partial unique indexes so only ONE pending photo can exist per
// (user, profile) at a time — a new upload replaces any previous one). The
// photo is deleted immediately on a successful report generation (see the
// `palm` entry in prime-reports.registry.ts), or by the periodic cleanup
// script (scripts/cleanup-expired-palm-photos.ts) once expiresAt passes.
// =============================================================================

import { and, eq, gt, isNull, lte } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { palmPhotos, type PalmPhotoRow } from '../../db/schema.js';

/** How long an uploaded photo stays available for report generation/retry before the cleanup script reclaims it. */
export const PALM_PHOTO_TTL_MS = 48 * 60 * 60 * 1000;

function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(palmPhotos.birthProfileId)
    : eq(palmPhotos.birthProfileId, birthProfileId);
}

/**
 * Replaces any existing pending photo for this (user, profile) with the new
 * one — only the LATEST upload ever matters, so this deletes-then-inserts
 * rather than erroring on the unique index.
 */
export async function upsertPendingPalmPhoto(
  userId: string,
  birthProfileId: string | null,
  imageBase64: string,
  mimeType: string,
): Promise<PalmPhotoRow> {
  const expiresAt = new Date(Date.now() + PALM_PHOTO_TTL_MS);
  await db
    .delete(palmPhotos)
    .where(and(eq(palmPhotos.userId, userId), profileFilter(birthProfileId)));
  const [row] = await db
    .insert(palmPhotos)
    .values({ userId, birthProfileId, imageBase64, mimeType, expiresAt })
    .returning();
  return row!;
}

/** Finds the pending (not-yet-expired) photo for this (user, profile), if any. */
export async function findPendingPalmPhoto(
  userId: string,
  birthProfileId: string | null,
): Promise<PalmPhotoRow | undefined> {
  const rows = await db
    .select()
    .from(palmPhotos)
    .where(
      and(
        eq(palmPhotos.userId, userId),
        profileFilter(birthProfileId),
        gt(palmPhotos.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return rows[0];
}

/** Deletes one photo by id — called right after it's successfully used to generate a report. */
export async function deletePalmPhoto(id: string): Promise<void> {
  await db.delete(palmPhotos).where(eq(palmPhotos.id, id));
}

/** Deletes ALL expired rows regardless of owner — used by the periodic cleanup script. Returns the count deleted. */
export async function deleteExpiredPalmPhotos(): Promise<number> {
  const deleted = await db
    .delete(palmPhotos)
    .where(lte(palmPhotos.expiresAt, new Date()))
    .returning({ id: palmPhotos.id });
  return deleted.length;
}
