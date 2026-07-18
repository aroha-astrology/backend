import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  birthProfiles,
  users,
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
import { GEMSTONE_UNLOCK_COST } from '../users/users.repo.js';

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

/**
 * Soft-deletes the profile and, in the same transaction, clears
 * `users.activeProfileId` back to null if (and only if) that user was
 * actively pointing at this profile. This is a soft delete (sets
 * `deletedAt`, doesn't drop the row), so the `active_profile_id` FK's
 * `onDelete: 'set null'` never fires on its own — self-healing that pointer
 * here, at the repo layer, means it can't be bypassed by calling this
 * function through a different route (e.g. the legacy `/v1/birth-profiles`
 * surface vs. the newer `/v1/profiles` surface both end up here).
 */
export async function softDeleteOwnedBirthProfile(
  id: string,
  ownerUserId: string,
): Promise<BirthProfileRow | undefined> {
  return db.transaction(async (tx) => {
    const [row] = await tx
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

    if (!row) return undefined;

    // No-op UPDATE (0 rows affected) when activeProfileId wasn't pointing at
    // this profile — cheap, and avoids a separate read-then-write.
    await tx
      .update(users)
      .set({ activeProfileId: null })
      .where(and(eq(users.id, ownerUserId), eq(users.activeProfileId, id)));

    return decryptRow(row);
  });
}

/**
 * Hard-deletes the profile row outright — a real `DELETE`, not the soft
 * delete above. Used by the newer `/v1/profiles` surface (switchable account
 * profiles), whose whole point is to genuinely free up a deleted profile's
 * kundli/horoscope/house-insight/gemstone/chat data via the `ON DELETE
 * CASCADE` foreign keys already defined on those tables — Postgres handles
 * that cascade, this function doesn't need to touch those tables itself.
 *
 * Because this is a real row delete (unlike the soft delete), `users
 * .activeProfileId`'s `ON DELETE SET NULL` FK fires automatically at the DB
 * level if the deleted profile was active — no manual transaction needed
 * here (contrast `softDeleteOwnedBirthProfile`, which needs one specifically
 * because a soft delete never triggers FK actions).
 *
 * `softDeleteOwnedBirthProfile` is intentionally left untouched — it keeps
 * serving the existing `/v1/birth-profiles` matchmaking surface as-is.
 */
export async function hardDeleteOwnedBirthProfile(
  id: string,
  ownerUserId: string,
): Promise<BirthProfileRow | undefined> {
  const [row] = await db
    .delete(birthProfiles)
    .where(and(eq(birthProfiles.id, id), eq(birthProfiles.ownerUserId, ownerUserId)))
    .returning();
  return row ? decryptRow(row) : undefined;
}

/** Internal sentinel used to roll back `unlockGemstoneForOwnedProfile`'s transaction on a guard failure without treating it as a real error. */
class UnlockGuardFailed extends Error {}

/**
 * Atomically spend the owner's credits to unlock an ADDITIONAL profile's
 * gemstone report — the two-table sibling of `unlockGemstoneForUser`
 * (users.repo.ts), which does the primary-profile case as a single raw
 * UPDATE. Here credits live on `users` but the unlock flag lives on this
 * `birth_profiles` row, so one UPDATE can't guard both invariants
 * (sufficient credits, not already unlocked, still owned/not deleted) at
 * once — this wraps two guarded updates in a transaction instead: charge the
 * owner first (guarded on credits >= cost), then flip the flag (guarded on
 * owned/not-deleted/not-already-unlocked). If either guard fails we throw to
 * roll back the whole transaction, so a failed second step can never leave a
 * charge behind — same "no charge on failure" semantics as
 * `unlockGemstoneForUser`, just split across two statements instead of one.
 */
export async function unlockGemstoneForOwnedProfile(
  id: string,
  ownerUserId: string,
): Promise<boolean> {
  try {
    return await db.transaction(async (tx) => {
      const [charged] = await tx
        .update(users)
        .set({ credits: sql`${users.credits} - ${GEMSTONE_UNLOCK_COST}` })
        .where(and(eq(users.id, ownerUserId), gte(users.credits, GEMSTONE_UNLOCK_COST)))
        .returning({ id: users.id });
      if (!charged) throw new UnlockGuardFailed();

      const [unlocked] = await tx
        .update(birthProfiles)
        .set({ gemstoneUnlockedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(birthProfiles.id, id),
            eq(birthProfiles.ownerUserId, ownerUserId),
            isNull(birthProfiles.deletedAt),
            isNull(birthProfiles.gemstoneUnlockedAt),
          ),
        )
        .returning({ id: birthProfiles.id });
      if (!unlocked) throw new UnlockGuardFailed();

      return true;
    });
  } catch (err) {
    if (err instanceof UnlockGuardFailed) return false;
    throw err;
  }
}
