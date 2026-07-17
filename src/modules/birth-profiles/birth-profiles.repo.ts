import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  birthProfiles,
  type BirthProfileRow,
  type NewBirthProfileRow,
  type PlaceOfBirth,
} from '../../db/schema.js';
import {
  encryptField,
  decryptField,
  encryptJson,
  decryptJson,
} from '../../lib/crypto/field-encryption.js';

/**
 * dateOfBirth/timeOfBirth/placeOfBirth/gotra are encrypted at rest (third-
 * party data, same treatment as the equivalent `users` columns) — this repo
 * module is the only place that should touch the raw columns.
 */
function decryptRow(row: BirthProfileRow): BirthProfileRow {
  return {
    ...row,
    dateOfBirth: decryptField(row.dateOfBirth),
    timeOfBirth: decryptField(row.timeOfBirth),
    // Cast bridges the app-facing PlaceOfBirth type vs. the raw encrypted
    // string actually on the wire — same as users.repo.ts's decryptUserRow.
    placeOfBirth: decryptJson<PlaceOfBirth>(row.placeOfBirth as unknown as string | null),
    gotra: decryptField(row.gotra),
  };
}

function encryptPatch<T extends Partial<NewBirthProfileRow>>(patch: T): T {
  const next: Partial<NewBirthProfileRow> = { ...patch };
  if ('dateOfBirth' in next) next.dateOfBirth = encryptField(next.dateOfBirth ?? null);
  if ('timeOfBirth' in next) next.timeOfBirth = encryptField(next.timeOfBirth ?? null);
  if ('placeOfBirth' in next) {
    next.placeOfBirth = encryptJson(next.placeOfBirth ?? null) as unknown as PlaceOfBirth | null;
  }
  if ('gotra' in next) next.gotra = encryptField(next.gotra ?? null);
  return next as T;
}

export async function listBirthProfilesByOwner(ownerUserId: string): Promise<BirthProfileRow[]> {
  const rows = await db
    .select()
    .from(birthProfiles)
    .where(and(eq(birthProfiles.ownerUserId, ownerUserId), isNull(birthProfiles.deletedAt)))
    .orderBy(desc(birthProfiles.createdAt));
  return rows.map(decryptRow);
}

export async function findOwnedBirthProfile(
  id: string,
  ownerUserId: string,
): Promise<BirthProfileRow | undefined> {
  const rows = await db
    .select()
    .from(birthProfiles)
    .where(
      and(
        eq(birthProfiles.id, id),
        eq(birthProfiles.ownerUserId, ownerUserId),
        isNull(birthProfiles.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ? decryptRow(rows[0]) : undefined;
}

export async function insertBirthProfile(values: NewBirthProfileRow): Promise<BirthProfileRow> {
  const [row] = await db.insert(birthProfiles).values(encryptPatch(values)).returning();
  if (!row) throw new Error('Failed to insert birth profile');
  return decryptRow(row);
}

export async function updateOwnedBirthProfile(
  id: string,
  ownerUserId: string,
  patch: Partial<NewBirthProfileRow>,
): Promise<BirthProfileRow | undefined> {
  const [row] = await db
    .update(birthProfiles)
    .set({ ...encryptPatch(patch), updatedAt: new Date() })
    .where(
      and(
        eq(birthProfiles.id, id),
        eq(birthProfiles.ownerUserId, ownerUserId),
        isNull(birthProfiles.deletedAt),
      ),
    )
    .returning();
  return row ? decryptRow(row) : undefined;
}

export async function softDeleteOwnedBirthProfile(
  id: string,
  ownerUserId: string,
): Promise<BirthProfileRow | undefined> {
  const [row] = await db
    .update(birthProfiles)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(birthProfiles.id, id),
        eq(birthProfiles.ownerUserId, ownerUserId),
        isNull(birthProfiles.deletedAt),
      ),
    )
    .returning();
  return row ? decryptRow(row) : undefined;
}
