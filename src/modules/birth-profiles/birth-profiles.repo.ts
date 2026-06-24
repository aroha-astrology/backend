import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { birthProfiles, type BirthProfileRow, type NewBirthProfileRow } from '../../db/schema.js';

export async function listBirthProfilesByOwner(ownerUserId: string): Promise<BirthProfileRow[]> {
  return db
    .select()
    .from(birthProfiles)
    .where(and(eq(birthProfiles.ownerUserId, ownerUserId), isNull(birthProfiles.deletedAt)))
    .orderBy(desc(birthProfiles.createdAt));
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
  return rows[0];
}

export async function insertBirthProfile(values: NewBirthProfileRow): Promise<BirthProfileRow> {
  const [row] = await db.insert(birthProfiles).values(values).returning();
  if (!row) throw new Error('Failed to insert birth profile');
  return row;
}

export async function updateOwnedBirthProfile(
  id: string,
  ownerUserId: string,
  patch: Partial<NewBirthProfileRow>,
): Promise<BirthProfileRow | undefined> {
  const [row] = await db
    .update(birthProfiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(birthProfiles.id, id),
        eq(birthProfiles.ownerUserId, ownerUserId),
        isNull(birthProfiles.deletedAt),
      ),
    )
    .returning();
  return row;
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
  return row;
}
