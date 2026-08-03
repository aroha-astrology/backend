import { and, eq, ilike, isNull, isNotNull, count, desc, gte, lt, or, sql } from 'drizzle-orm';
import type { DateRange } from '../admin/admin.repo.js';
import crypto from 'crypto';
import { db } from '../../config/db.js';
import {
  users,
  birthProfiles,
  devicePushTokens,
  userConsentLog,
  chatSessions,
  userFacts,
  chatFeedbackReports,
  notifications,
  walletTransactions,
  palmReadings,
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
import { deleteAllUserFrames } from '../../lib/palm/storage.js';
import { logger } from '../../lib/logger.js';

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

export async function findUserByReferralCode(code: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.referralCode, code)).limit(1);
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
  if (!values.referralCode) {
    values.referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  }
  const [row] = await db.insert(users).values(encryptUserPatch(values)).returning();
  if (!row) throw new Error('Failed to insert user');
  return decryptUserRow(row);
}

/**
 * Backfill a referralCode for a user row created before the referral feature
 * shipped. Called from both session-establishment and GET /me so every path
 * that can hand a user object to the frontend guarantees one is present.
 */
export async function ensureReferralCode(user: UserRow): Promise<UserRow> {
  if (user.referralCode) return user;
  const referralCode = crypto.randomBytes(4).toString('hex').toUpperCase();
  const updated = await updateUserById(user.id, { referralCode });
  return updated ?? { ...user, referralCode };
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
export async function deductWalletBalance(
  userId: string,
  amountPaise: number,
  reason: string,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [charged] = await tx
      .update(users)
      .set({ walletBalancePaise: sql`${users.walletBalancePaise} - ${amountPaise}` })
      .where(and(eq(users.id, userId), gte(users.walletBalancePaise, amountPaise)))
      .returning({ walletBalancePaise: users.walletBalancePaise });
    if (!charged) return false;

    await tx.insert(walletTransactions).values({
      userId,
      delta: -amountPaise,
      reason,
      balanceAfter: charged.walletBalancePaise,
    });
    return true;
  });
}

/** Add `amountPaise` back to the wallet (e.g. refunding a charge whose async job failed). */
export async function addWalletBalance(
  userId: string,
  amountPaise: number,
  reason: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ walletBalancePaise: sql`${users.walletBalancePaise} + ${amountPaise}` })
      .where(eq(users.id, userId))
      .returning({ walletBalancePaise: users.walletBalancePaise });
    if (!updated) return;

    await tx.insert(walletTransactions).values({
      userId,
      delta: amountPaise,
      reason,
      balanceAfter: updated.walletBalancePaise,
    });
  });
}

/**
 * Atomically apply the referral bonus. The referee (whoever redeemed a code) always
 * gets their one-time ₹50 for a valid, not-self code — the ₹2000 cap only limits how
 * much the REFERRER can earn from referring others, so a referrer hitting their cap
 * doesn't cost the new signup their welcome bonus.
 */
export async function applyReferralBonus(
  referrerId: string,
  refereeId: string,
): Promise<{ referrerBonus: boolean; refereeBonus: boolean }> {
  const REFERRER_BONUS_PAISE = 10000;
  const REFEREE_BONUS_PAISE = 5000;
  const CAP_PAISE = 200000;

  return db.transaction(async (tx) => {
    // Lock and check referrer cap
    const [referrer] = await tx.execute<{ referral_earnings_paise: number }>(sql`
      SELECT referral_earnings_paise FROM users WHERE id = ${referrerId} FOR UPDATE;
    `);

    const referrerBonus = !!referrer && referrer.referral_earnings_paise < CAP_PAISE;

    if (referrerBonus) {
      await tx.execute(sql`
        UPDATE users
        SET wallet_balance_paise = wallet_balance_paise + ${REFERRER_BONUS_PAISE},
            referral_earnings_paise = referral_earnings_paise + ${REFERRER_BONUS_PAISE}
        WHERE id = ${referrerId};
      `);
      await tx.execute(sql`
        INSERT INTO wallet_transactions (user_id, delta, reason, balance_after)
        VALUES (${referrerId}, ${REFERRER_BONUS_PAISE}, 'referral_bonus', (SELECT wallet_balance_paise FROM users WHERE id = ${referrerId}));
      `);
    }

    // Referee's one-time welcome bonus for redeeming a valid code — unconditional,
    // independent of the referrer's cap.
    await tx.execute(sql`
      UPDATE users
      SET wallet_balance_paise = wallet_balance_paise + ${REFEREE_BONUS_PAISE}
      WHERE id = ${refereeId};
    `);
    await tx.execute(sql`
      INSERT INTO wallet_transactions (user_id, delta, reason, balance_after)
      VALUES (${refereeId}, ${REFEREE_BONUS_PAISE}, 'referral_bonus', (SELECT wallet_balance_paise FROM users WHERE id = ${refereeId}));
    `);

    return { referrerBonus, refereeBonus: true };
  });
}

/** Get user notifications */
export async function getNotificationsForUser(userId: string) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt));
}

/** Mark all user notifications as read */
export async function markNotificationsRead(userId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export interface NewNotificationEntry {
  userId: string;
  title: string;
  body: string;
  type: string;
  link?: string | null;
}

/** Insert one Bell-inbox notification row. Repo-layer wrapper (rather than a lib module
 * touching `db` directly) so callers like notify-user.ts's notifyUser can be exercised in tests
 * by mocking this function, the same way every other notify-* call site already mocks
 * findActiveTokensForUser/sendPushBatch instead of the DB client underneath them. */
export async function insertNotification(entry: NewNotificationEntry): Promise<void> {
  await db.insert(notifications).values({
    userId: entry.userId,
    title: entry.title,
    body: entry.body,
    type: entry.type,
    link: entry.link ?? null,
  });
}

/** Bulk insert, chunked at 500 — same limit sendPushBatch's own FCM chunking already uses.
 * Matches insertTransitNotifications' (transit-alert.repo.ts) existing chunking precedent. */
export async function insertNotifications(entries: NewNotificationEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const CHUNK = 500;
  for (let i = 0; i < entries.length; i += CHUNK) {
    await db.insert(notifications).values(
      entries.slice(i, i + CHUNK).map((e) => ({
        userId: e.userId,
        title: e.title,
        body: e.body,
        type: e.type,
        link: e.link ?? null,
      })),
    );
  }
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

  // Palm photographs are irreducibly biometric — there is no "scrub in place" for them the
  // way there is for a text field, so they get the same hard-delete treatment as chat
  // transcripts below (the "highest-risk content class" precedent), not a soft anonymize.
  // Storage lives outside the DB transaction; best-effort and logged, never blocks erasure.
  await deleteAllUserFrames(id).catch((err: unknown) =>
    logger.error({ err, userId: id }, 'anonymizeUserById: failed to delete palm storage objects'),
  );

  await db.transaction(async (tx) => {
    await tx.delete(palmReadings).where(eq(palmReadings.userId, id));
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
  // palm_readings rows themselves cascade away with the user row below, but the actual
  // photograph objects in Cloud Storage do not — delete them explicitly or they're orphaned.
  // Best-effort and logged, never blocks the (legally required) DB erasure.
  await deleteAllUserFrames(id).catch((err: unknown) =>
    logger.error({ err, userId: id }, 'hardDeleteUserById: failed to delete palm storage objects'),
  );

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

/** Bumps `lastActiveAt` on any authenticated request — called fire-and-forget from `requireUser`. */
export async function touchUserLastActive(userId: string): Promise<void> {
  await db.update(users).set({ lastActiveAt: new Date() }).where(eq(users.id, userId));
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

export async function countNewUsersThisWeek(): Promise<number> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const [res] = await db
    .select({ count: count() })
    .from(users)
    .where(and(isNull(users.deletedAt), gte(users.createdAt, sevenDaysAgo)));
  return res?.count ?? 0;
}

/** Active in the last N minutes — the "logged in simultaneously" signal for admin-alerts.service.ts. */
export async function countUsersActiveSince(since: Date): Promise<number> {
  const [res] = await db
    .select({ count: count() })
    .from(users)
    .where(and(isNull(users.deletedAt), gte(users.lastActiveAt, since)));
  return res?.count ?? 0;
}

/** Generic version of `countNewUsersToday` — powers the new-user-burst check in admin-alerts.service.ts. */
export async function countNewUsersSince(since: Date): Promise<number> {
  const [res] = await db
    .select({ count: count() })
    .from(users)
    .where(and(isNull(users.deletedAt), gte(users.createdAt, since)));
  return res?.count ?? 0;
}

/**
 * `DateRange`-bounded sibling of `countUsersActiveSince` — added alongside it
 * (not a replacement) so admin-alerts.service.ts's existing open-ended
 * "since" call keeps working unchanged. Powers the admin dashboard's active-
 * users metric, which needs a closed [from, to) window rather than "since".
 */
export async function usersActiveBetween(range: DateRange): Promise<number> {
  const [res] = await db
    .select({ count: count() })
    .from(users)
    .where(
      and(
        isNull(users.deletedAt),
        gte(users.lastActiveAt, range.from),
        lt(users.lastActiveAt, range.to),
      ),
    );
  return res?.count ?? 0;
}

/** `DateRange`-bounded sibling of `countNewUsersSince` — see `usersActiveBetween`'s comment. */
export async function usersCreatedBetween(range: DateRange): Promise<number> {
  const [res] = await db
    .select({ count: count() })
    .from(users)
    .where(
      and(isNull(users.deletedAt), gte(users.createdAt, range.from), lt(users.createdAt, range.to)),
    );
  return res?.count ?? 0;
}

/** Sum of every active user's wallet balance — the platform's outstanding liability. */
export async function sumWalletBalanceOutstanding(): Promise<number> {
  const [res] = await db
    .select({ total: sql<number>`coalesce(sum(${users.walletBalancePaise}), 0)` })
    .from(users)
    .where(isNull(users.deletedAt));
  return Number(res?.total ?? 0);
}

/**
 * `q`'s search behavior is asymmetric across columns because phoneE164 is
 * encrypted at rest (non-deterministic ciphertext — see decryptUserRow's
 * doc comment): displayName/email are plaintext columns and can be ILIKE'd
 * for a partial match, but phone can only be matched EXACTLY via its
 * deterministic lookup hash (the same primitive findUserByPhoneE164 uses),
 * never partially.
 */
function userSearchWhere(q?: string) {
  const notDeleted = isNull(users.deletedAt);
  if (!q) return notDeleted;
  const like = `%${q}%`;
  return and(
    notDeleted,
    or(
      ilike(users.displayName, like),
      ilike(users.email, like),
      eq(users.phoneE164Hash, hashForLookup(q)),
    ),
  );
}

/** Powers both the Telegram `/users` command (no `q`) and the admin dashboard's `GET /v1/admin/users?q=` search. */
export async function listUsersPage(limit: number, offset: number, q?: string) {
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      phoneE164: users.phoneE164,
      email: users.email,
      walletBalancePaise: users.walletBalancePaise,
      createdAt: users.createdAt,
      lastActiveAt: users.lastActiveAt,
    })
    .from(users)
    .where(userSearchWhere(q))
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map((row) => ({ ...row, phoneE164: decryptField(row.phoneE164) }));
}

/** Total matching `listUsersPage`'s own search predicate — powers the admin dashboard's pagination total. */
export async function countUsersMatching(q?: string): Promise<number> {
  const [res] = await db.select({ count: count() }).from(users).where(userSearchWhere(q));
  return res?.count ?? 0;
}

/** Cost in paise to unlock one kundli house's detail view (Rs 50 = 5 credits at the old rate). Reused by `unlockHouseForOwnedProfile` (birth-profiles.repo.ts) for the additional-profile case. */
export const HOUSE_UNLOCK_COST_PAISE = 5000;

export async function unlockHouseForUser(userId: string, houseNumber: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [unlocked] = await tx
      .update(users)
      .set({
        walletBalancePaise: sql`${users.walletBalancePaise} - ${HOUSE_UNLOCK_COST_PAISE}`,
        unlockedHouses: sql`array_append(${users.unlockedHouses}, ${houseNumber})`,
      })
      .where(
        and(
          eq(users.id, userId),
          gte(users.walletBalancePaise, HOUSE_UNLOCK_COST_PAISE),
          sql`NOT (${houseNumber} = ANY(${users.unlockedHouses}))`,
        ),
      )
      .returning({ walletBalancePaise: users.walletBalancePaise });
    if (!unlocked) return false;

    await tx.insert(walletTransactions).values({
      userId,
      delta: -HOUSE_UNLOCK_COST_PAISE,
      reason: `house_unlock:${houseNumber}`,
      balanceAfter: unlocked.walletBalancePaise,
    });
    return true;
  });
}

/** Cost in paise to unlock the full gemstone report (whole report, one-time). Rs 100 = 10 credits at the old rate. */
export const GEMSTONE_UNLOCK_COST_PAISE = 10000;

/**
 * Atomically spend wallet balance to unlock the gemstone report — same
 * combined deduct-and-guard primitive as `unlockHouseForUser`. Returns false
 * if the user has too little balance OR the report is already unlocked, so a
 * second click can never double-charge.
 */
export async function unlockGemstoneForUser(
  userId: string,
  weightKg: number | null = null,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [unlocked] = await tx
      .update(users)
      .set({
        walletBalancePaise: sql`${users.walletBalancePaise} - ${GEMSTONE_UNLOCK_COST_PAISE}`,
        gemstoneUnlockedAt: new Date(),
        ...(weightKg !== null ? { gemstoneWeightKg: weightKg } : {}),
      })
      .where(
        and(
          eq(users.id, userId),
          gte(users.walletBalancePaise, GEMSTONE_UNLOCK_COST_PAISE),
          isNull(users.gemstoneUnlockedAt),
        ),
      )
      .returning({ walletBalancePaise: users.walletBalancePaise });
    if (!unlocked) return false;

    await tx.insert(walletTransactions).values({
      userId,
      delta: -GEMSTONE_UNLOCK_COST_PAISE,
      reason: 'gemstone_unlock',
      balanceAfter: unlocked.walletBalancePaise,
    });
    return true;
  });
}

/**
 * Reverts an unlock when background generation fails.
 * Refunds the balance and sets gemstoneUnlockedAt back to null.
 */
export async function relockGemstoneForUser(userId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [relocked] = await tx
      .update(users)
      .set({
        walletBalancePaise: sql`${users.walletBalancePaise} + ${GEMSTONE_UNLOCK_COST_PAISE}`,
        gemstoneUnlockedAt: null,
      })
      .where(and(eq(users.id, userId), isNotNull(users.gemstoneUnlockedAt)))
      .returning({ walletBalancePaise: users.walletBalancePaise });
    if (!relocked) return false;

    await tx.insert(walletTransactions).values({
      userId,
      delta: GEMSTONE_UNLOCK_COST_PAISE,
      reason: 'refund:gemstone_report',
      balanceAfter: relocked.walletBalancePaise,
    });
    return true;
  });
}

/**
 * Everything the account holds on one user, decrypted, for the DSAR export at
 * GET /v1/me/export (DPDP Act §11 access; GDPR Arts. 15 and 20).
 *
 * Reads go through this module rather than being assembled at the route,
 * because these tables are encrypted at rest and the decryption belongs at the
 * DB boundary — see the note on `decryptUserRow` above.
 *
 * Two deliberate omissions, both of which would make the export less safe
 * rather than more complete:
 *  - device push tokens: still-live device credentials, not information about
 *    the user. A leaked export must not let anyone push to their phone.
 *  - palm photographs: only the reading metadata is listed, never the image
 *    bytes. The frames stay behind the authenticated, ownership-checked route
 *    they already live behind (see palm.service.ts).
 */
export async function collectUserExport(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;

  const [profiles, sessions, facts, transactions, consents, notifs, palms] = await Promise.all([
    db.select().from(birthProfiles).where(eq(birthProfiles.ownerUserId, userId)),
    db.select().from(chatSessions).where(eq(chatSessions.userId, userId)),
    db.select().from(userFacts).where(eq(userFacts.userId, userId)),
    db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .orderBy(desc(walletTransactions.createdAt)),
    db
      .select()
      .from(userConsentLog)
      .where(eq(userConsentLog.userId, userId))
      .orderBy(desc(userConsentLog.occurredAt)),
    db.select().from(notifications).where(eq(notifications.userId, userId)),
    db
      .select({
        id: palmReadings.id,
        status: palmReadings.status,
        primaryHand: palmReadings.primaryHand,
        createdAt: palmReadings.createdAt,
      })
      .from(palmReadings)
      .where(eq(palmReadings.userId, userId)),
  ]);

  const decrypted = decryptUserRow(user);
  return {
    exportedAt: new Date().toISOString(),
    account: {
      ...decrypted,
      // Blind-index lookup hashes are internal plumbing, not the user's data,
      // and publishing them would weaken the lookup they exist to protect.
      phoneHash: undefined,
      emailHash: undefined,
    },
    birthProfiles: profiles.map((p) => ({
      ...p,
      dateOfBirth: decryptField(p.dateOfBirth),
      timeOfBirth: decryptField(p.timeOfBirth),
      placeOfBirth: decryptJson<PlaceOfBirth>(p.placeOfBirth as unknown as string | null),
      gotra: decryptField(p.gotra),
    })),
    chatSessions: sessions.map((s) => ({
      ...s,
      history: JSON.parse(decryptField(s.history) ?? '[]') as unknown,
      summary: decryptField(s.summary),
    })),
    rememberedFacts: facts.map((f) => ({
      ...f,
      fact: decryptField(f.fact),
      followUpQuestion: decryptField(f.followUpQuestion),
    })),
    walletTransactions: transactions,
    consentHistory: consents,
    notifications: notifs,
    palmReadings: palms,
  };
}
