import { and, eq, isNull, count, desc, gte, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  users,
  birthProfiles,
  devicePushTokens,
  userConsentLog,
  chatSessions,
  userFacts,
  chatFeedbackReports,
  type NewUserRow,
  type NewUserConsentLogRow,
  type UserRow,
  type PlaceOfBirth,
} from '../../db/schema.js';
import {
  encryptField,
  decryptField,
  encryptJson,
  decryptJson,
  hashForLookup,
} from '../../lib/crypto/field-encryption.js';

/**
 * The `users` table encrypts phoneE164/dateOfBirth/timeOfBirth/placeOfBirth/
 * gotra/sankalpaName at rest (see src/lib/crypto/field-encryption.ts and the
 * comments on the `users` table in db/schema.ts). This repo module is the
 * ONLY place that should touch those raw columns — every function here
 * decrypts on the way out and encrypts on the way in, so every caller
 * elsewhere in the app keeps reading/writing plain values exactly as before.
 * `horoscope.repo.ts` and `scripts/regen-all.ts` also read the `users` table
 * directly (for the horoscope-generation cron/backfill) and reuse
 * `decryptUserRow` below for the same reason.
 */
export function decryptUserRow(row: UserRow): UserRow {
  return {
    ...row,
    phoneE164: decryptField(row.phoneE164),
    dateOfBirth: decryptField(row.dateOfBirth),
    timeOfBirth: decryptField(row.timeOfBirth),
    // placeOfBirth is `.$type<PlaceOfBirth>()`'d for the app-facing (decrypted)
    // shape, but the raw row straight off the wire is really an encrypted
    // string — the cast bridges that intentional type/runtime mismatch.
    placeOfBirth: decryptJson<PlaceOfBirth>(row.placeOfBirth as unknown as string | null),
    gotra: decryptField(row.gotra),
    sankalpaName: decryptField(row.sankalpaName),
  };
}

/**
 * Encrypts whichever of the encrypted columns are present in a patch, and —
 * if `phoneE164` is being set — (re)computes `phoneE164Hash` from the
 * plaintext BEFORE encrypting it, since the hash is the only thing lookups
 * can match against once the column itself holds non-deterministic
 * ciphertext.
 */
function encryptUserPatch<T extends Partial<NewUserRow>>(patch: T): T {
  const next: Partial<NewUserRow> = { ...patch };
  if ('phoneE164' in next) {
    const plain = next.phoneE164 ?? null;
    next.phoneE164Hash = plain ? hashForLookup(plain) : null;
    next.phoneE164 = encryptField(plain);
  }
  if ('dateOfBirth' in next) next.dateOfBirth = encryptField(next.dateOfBirth ?? null);
  if ('timeOfBirth' in next) next.timeOfBirth = encryptField(next.timeOfBirth ?? null);
  if ('placeOfBirth' in next) {
    next.placeOfBirth = encryptJson(next.placeOfBirth ?? null) as unknown as PlaceOfBirth | null;
  }
  if ('gotra' in next) next.gotra = encryptField(next.gotra ?? null);
  if ('sankalpaName' in next) next.sankalpaName = encryptField(next.sankalpaName ?? null);
  return next as T;
}

export async function findUserByFirebaseUid(firebaseUid: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid)).limit(1);
  return rows[0] ? decryptUserRow(rows[0]) : undefined;
}

/** Any row (including soft-deleted) holding this phone number. */
export async function findUserByPhoneE164(phoneE164: string): Promise<UserRow | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.phoneE164Hash, hashForLookup(phoneE164)))
    .limit(1);
  return rows[0] ? decryptUserRow(rows[0]) : undefined;
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ? decryptUserRow(rows[0]) : undefined;
}

export async function findActiveUserByFirebaseUid(
  firebaseUid: string,
): Promise<UserRow | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.firebaseUid, firebaseUid), isNull(users.deletedAt)))
    .limit(1);
  return rows[0] ? decryptUserRow(rows[0]) : undefined;
}

export async function findActiveUserById(id: string): Promise<UserRow | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return rows[0] ? decryptUserRow(rows[0]) : undefined;
}

export async function insertUser(values: NewUserRow): Promise<UserRow> {
  const [row] = await db.insert(users).values(encryptUserPatch(values)).returning();
  if (!row) throw new Error('Failed to insert user');
  return decryptUserRow(row);
}

export async function updateUserById(
  id: string,
  patch: Partial<NewUserRow>,
): Promise<UserRow | undefined> {
  const [row] = await db
    .update(users)
    .set({ ...encryptUserPatch(patch), updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return row ? decryptUserRow(row) : undefined;
}

/**
 * Atomically deduct `amountPaise` from the wallet if (and only if) the user
 * has enough. Same claim-style primitive as `unlockHouseForUser` — the
 * balance check and the debit happen in one conditional UPDATE so two
 * concurrent spends can never both succeed against a balance that only
 * covers one of them.
 */
export async function deductWalletBalance(userId: string, amountPaise: number): Promise<boolean> {
  const result = await db.execute(sql`
    UPDATE users
    SET wallet_balance_paise = wallet_balance_paise - ${amountPaise}
    WHERE id = ${userId}
      AND wallet_balance_paise >= ${amountPaise}
    RETURNING *;
  `);
  return result.length > 0;
}

/** Add `amountPaise` back to the wallet (e.g. refunding a charge whose async job failed). */
export async function addWalletBalance(userId: string, amountPaise: number): Promise<void> {
  await db.execute(sql`
    UPDATE users
    SET wallet_balance_paise = wallet_balance_paise + ${amountPaise}
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
  return row ? decryptUserRow(row) : undefined;
}

/**
 * Real erasure for `DELETE /v1/me`: scrubs every CRITICAL/identifying field
 * instead of just soft-deleting. `firebaseUid`/`phoneE164` are deliberately
 * kept (so the row stays a valid, findable shell) rather than nulled — this
 * is what makes the login-time "resurrect a soft-deleted row by phone/UID"
 * path in `auth.service.ts` safe even after a number is recycled or
 * SIM-swapped: whoever signs in next just gets an empty, freshly-onboardable
 * account, because there is nothing sensitive left on the row to hand back.
 * `anonymizedAt` is the permanent, never-cleared record that this happened.
 */
export async function anonymizeUserById(id: string): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        displayName: null,
        gender: null,
        email: null,
        avatarUrl: null,
        dateOfBirth: null,
        timeOfBirth: null,
        placeOfBirth: null,
        birthTimeAccuracy: null,
        birthTimeSource: null,
        birthTimeRectified: null,
        birthTimeRectificationConfidence: null,
        birthLocationAccuracy: null,
        gotra: null,
        sankalpaName: null,
        currentLocation: null,
        currentLocationUpdatedAt: null,
        currentTimezone: null,
        currentCountry: null,
        interestAreas: null,
        relationshipStatus: null,
        partnerSeekingIntent: null,
        referralSource: null,
        referredByCode: null,
        anonymizedAt: now,
        deletedAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, id));

    // Third-party data the owner entered about someone else — same erasure,
    // not just the soft-delete `softDeleteBirthProfilesByOwner` already does.
    await tx
      .update(birthProfiles)
      .set({
        displayName: null,
        dateOfBirth: null,
        timeOfBirth: null,
        placeOfBirth: null,
        gotra: null,
        notes: null,
        updatedAt: now,
      })
      .where(eq(birthProfiles.ownerUserId, id));

    // Free-text is the highest-risk content class (chat transcripts, LLM
    // memory, saved Q&A) — hard-delete rather than merely scrub, since these
    // tables aren't otherwise touched until the user row itself is dropped.
    await tx.delete(chatSessions).where(eq(chatSessions.userId, id));
    await tx.delete(userFacts).where(eq(userFacts.userId, id));
    await tx.delete(chatFeedbackReports).where(eq(chatFeedbackReports.userId, id));

    // Revoked tokens are useless for push, but the token string is still a
    // device credential — scrub it too rather than leaving it at rest.
    await tx
      .update(devicePushTokens)
      .set({ token: 'revoked', updatedAt: now })
      .where(eq(devicePushTokens.userId, id));

    // Keep the consent-log rows (ON DELETE RESTRICT exists precisely so this
    // audit trail survives) but scrub the PII columns on them — this is the
    // resolution to the RESTRICT-vs-erasure tension: the event/timestamp/
    // version skeleton stays, the IP/user-agent doesn't.
    await tx
      .update(userConsentLog)
      .set({ sourceIp: null, userAgent: null })
      .where(eq(userConsentLog.userId, id));
  });
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
      .set({ ...encryptUserPatch(patch), updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    if (entries.length > 0) {
      await tx.insert(userConsentLog).values(entries);
    }
    return row ? decryptUserRow(row) : undefined;
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
  const rows = await db
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
  return rows.map((row) => ({ ...row, phoneE164: decryptField(row.phoneE164) }));
}

/** Cost in paise to unlock one kundli house's detail view (Rs 50 = 5 credits at the old rate). */
export const HOUSE_UNLOCK_COST_PAISE = 5000;

export async function unlockHouseForUser(userId: string, houseNumber: number) {
  const result = await db.execute(sql`
    UPDATE users
    SET wallet_balance_paise = wallet_balance_paise - ${HOUSE_UNLOCK_COST_PAISE},
        unlocked_houses = array_append(unlocked_houses, ${houseNumber})
    WHERE id = ${userId}
      AND wallet_balance_paise >= ${HOUSE_UNLOCK_COST_PAISE}
      AND NOT (${houseNumber} = ANY(unlocked_houses))
    RETURNING *;
  `);
  return result.length > 0;
}

/** Cost in paise to unlock the full gemstone report (whole report, one-time). Rs 100 = 10 credits at the old rate. */
export const GEMSTONE_UNLOCK_COST_PAISE = 10000;

/**
 * Atomically spend wallet balance to unlock the gemstone report — same
 * combined deduct-and-guard primitive as `unlockHouseForUser`. Returns false
 * if the user has too little balance OR the report is already unlocked, so a
 * second click can never double-charge.
 */
export async function unlockGemstoneForUser(userId: string) {
  const result = await db.execute(sql`
    UPDATE users
    SET wallet_balance_paise = wallet_balance_paise - ${GEMSTONE_UNLOCK_COST_PAISE},
        gemstone_unlocked_at = now()
    WHERE id = ${userId}
      AND wallet_balance_paise >= ${GEMSTONE_UNLOCK_COST_PAISE}
      AND gemstone_unlocked_at IS NULL
    RETURNING *;
  `);
  return result.length > 0;
}
