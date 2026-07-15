import { and, eq, isNull, count, desc, gte, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  users,
  birthProfiles,
  devicePushTokens,
  userConsentLog,
  type NewUserRow,
  type NewUserConsentLogRow,
  type UserRow,
} from '../../db/schema.js';

export async function findUserByFirebaseUid(firebaseUid: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid)).limit(1);
  return rows[0];
}

/** Any row (including soft-deleted) holding this phone number. */
export async function findUserByPhoneE164(phoneE164: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.phoneE164, phoneE164)).limit(1);
  return rows[0];
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0];
}

export async function findActiveUserByFirebaseUid(
  firebaseUid: string,
): Promise<UserRow | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.firebaseUid, firebaseUid), isNull(users.deletedAt)))
    .limit(1);
  return rows[0];
}

export async function findActiveUserById(id: string): Promise<UserRow | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return rows[0];
}

export async function insertUser(values: NewUserRow): Promise<UserRow> {
  const [row] = await db.insert(users).values(values).returning();
  if (!row) throw new Error('Failed to insert user');
  return row;
}

export async function updateUserById(
  id: string,
  patch: Partial<NewUserRow>,
): Promise<UserRow | undefined> {
  const [row] = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return row;
}

/**
 * Atomically deduct `amount` credits if (and only if) the user has enough.
 * Same claim-style primitive as `unlockHouseForUser` — the balance check and
 * the debit happen in one conditional UPDATE so two concurrent spends can
 * never both succeed against a balance that only covers one of them.
 */
export async function deductCredits(userId: string, amount: number): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE users
    SET credits = credits - ${amount}
    WHERE id = ${userId}
      AND credits >= ${amount}
    RETURNING *;
  `);
  return result.length > 0;
}

/** Add `amount` credits back (e.g. refunding a charge whose async job failed). */
export async function addCredits(userId: string, amount: number): Promise<void> {
  await db.execute(sql`
    UPDATE users
    SET credits = credits + ${amount}
    WHERE id = ${userId};
  `);
}

/**
 * Atomically claim the user's one lifetime birth-detail edit. Returns the
 * updated row if THIS call won the claim, or `undefined` if it was already
 * used — same claim primitive as `claimKundliGeneration`, so two concurrent
 * edit requests can't both slip through.
 */
export async function claimBirthDetailsEdit(id: string): Promise<UserRow | undefined> {
  const [row] = await db
    .update(users)
    .set({ birthDetailsEditedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(users.id, id), isNull(users.birthDetailsEditedAt)))
    .returning();
  return row;
}

export async function softDeleteUserById(id: string): Promise<void> {
  await db
    .update(users)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, id));
}

export async function hardDeleteUserById(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    // Delete consent logs first to bypass ON DELETE RESTRICT
    await tx.delete(userConsentLog).where(eq(userConsentLog.userId, id));
    // Hard delete user - all other tables have ON DELETE CASCADE
    await tx.delete(users).where(eq(users.id, id));
  });
}

/**
 * Apply a profile patch and append its consent-audit rows ATOMICALLY, so the
 * user's effective consent state and the append-only log can never diverge.
 */
export async function updateUserWithConsentLog(
  id: string,
  patch: Partial<NewUserRow>,
  entries: NewUserConsentLogRow[],
): Promise<UserRow | undefined> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (entries.length > 0) {
      await tx.insert(userConsentLog).values(entries);
    }
    return row;
  });
}

/**
 * Cascade soft-delete to the account holder's saved charts so a third party's
 * birth data stops being processed when the owner deactivates.
 */
export async function softDeleteBirthProfilesByOwner(ownerUserId: string): Promise<void> {
  await db
    .update(birthProfiles)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(birthProfiles.ownerUserId, ownerUserId), isNull(birthProfiles.deletedAt)));
}

/** Revoke every active push token for a user (logout / account soft-delete). */
export async function revokeDeviceTokensByUser(userId: string): Promise<void> {
  await db
    .update(devicePushTokens)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(devicePushTokens.userId, userId), isNull(devicePushTokens.revokedAt)));
}

export async function countUsers(): Promise<number> {
  const [res] = await db.select({ count: count() }).from(users).where(isNull(users.deletedAt));
  return res?.count ?? 0;
}

export async function countNewUsersToday(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [res] = await db
    .select({ count: count() })
    .from(users)
    .where(and(isNull(users.deletedAt), gte(users.createdAt, startOfDay)));
  return res?.count ?? 0;
}

export async function listUsersPage(limit: number, offset: number) {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      phoneE164: users.phoneE164,
      email: users.email,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function unlockHouseForUser(userId: string, houseNumber: number) {
  // Use raw sql to deduct credits and array_append to unlockedHouses
  // ensure credits >= 5 and houseNumber is not already in unlockedHouses
  const result = await db.execute(sql`
    UPDATE users
    SET credits = credits - 5,
        unlocked_houses = array_append(unlocked_houses, ${houseNumber})
    WHERE id = ${userId} 
      AND credits >= 5 
      AND NOT (${houseNumber} = ANY(unlocked_houses))
    RETURNING *;
  `);
  return result.length > 0;
}
