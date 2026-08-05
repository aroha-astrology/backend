import type { DecodedIdToken } from 'firebase-admin/auth';
import type { UserRow } from '../../db/schema.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import {
  ensureReferralCode,
  findUserByEmail,
  findUserByFirebaseUid,
  findUserByPhoneE164,
  insertUser,
  touchUserLastActive,
  updateUserById,
} from '../users/users.repo.js';

export type EstablishSessionResult = {
  user: UserRow;
  created: boolean;
};

/**
 * Restore a soft-deleted row. The email partial-unique index frees a deleted
 * user's email, so another active account may have claimed it meanwhile;
 * on that collision, resurrect without the now-contested email rather than
 * 500-ing and locking the returning user out forever.
 *
 * Safe against phone-recycling/SIM-swap: `DELETE /v1/me` (`anonymizeUserById`
 * in users.repo.ts) scrubs every identifying field at deletion time rather
 * than only setting `deletedAt`. So if a recycled number's new owner ends up
 * here (by Firebase reissuing the same UID, or by the phone-collision branch
 * below), there is no previous owner's PII left on the row to hand back —
 * they just get an empty, freshly-onboardable account under their own auth.
 */
async function resurrect(existing: UserRow): Promise<UserRow> {
  try {
    return (await updateUserById(existing.id, { deletedAt: null })) ?? existing;
  } catch (err) {
    if (isUniqueViolation(err)) {
      return (await updateUserById(existing.id, { deletedAt: null, email: null })) ?? existing;
    }
    throw err;
  }
}

/**
 * Idempotent: given a verified Firebase token, ensure an active user row
 * exists for that UID and return it. Resurrects soft-deleted rows so a user
 * who deletes their account and signs back in can recover — including the case
 * where Firebase reissued a new UID for the same phone number.
 *
 * Provider-agnostic: phone-OTP tokens carry `phone_number`, Google tokens
 * carry `email` instead (no `phone_number` claim) — both are handled by the
 * same path, matching every downstream user/session consumer that already
 * treats phone and email as independently-nullable columns.
 */
export async function establishSession(token: DecodedIdToken): Promise<EstablishSessionResult> {
  const existing = await findUserByFirebaseUid(token.uid);
  const email = typeof token.email === 'string' ? token.email.toLowerCase() : null;

  if (existing) {
    let user = existing.deletedAt !== null ? await resurrect(existing) : existing;
    // Backfill: a phone user who later signs in with Google, or a row
    // created before email capture existed, picks up the email without a
    // separate account-linking flow.
    if (email && !user.email) {
      user = (await updateUserById(user.id, { email })) ?? user;
    }
    return finish(await ensureReferralCode(user), false);
  }

  const phoneE164 = typeof token.phone_number === 'string' ? token.phone_number : null;
  try {
    const created = await insertUser({ firebaseUid: token.uid, phoneE164, email });
    return finish(created, true);
  } catch (err) {
    // A row already holds this phone (Firebase reissued the UID for the same
    // number). Reclaim that row under the new UID instead of crashing.
    if (isUniqueViolation(err) && phoneE164) {
      const byPhone = await findUserByPhoneE164(phoneE164);
      if (byPhone) {
        const reclaimed = await updateUserById(byPhone.id, {
          firebaseUid: token.uid,
          deletedAt: null,
        });
        return finish(reclaimed ?? byPhone, false);
      }
    }
    // A row already holds this email. The common cause is the same person
    // arriving under a new UID — Firebase reissues UIDs per project, so any
    // change of Firebase project silently turns every returning Google user
    // into an "unknown" UID. Mirror the phone branch above and reclaim the
    // row, otherwise they'd land in a brand-new empty account with their
    // history stranded.
    //
    // Gated on `email_verified` because, unlike a phone number (which the OTP
    // flow always proves), an `email` claim is only as trustworthy as the
    // provider: reclaiming on an unverified address would be an account
    // takeover vector. Google always sets this.
    if (isUniqueViolation(err) && email) {
      // Apple relays `email_verified` as the string "true" rather than a
      // boolean, so accept both — a strict `=== true` would silently orphan
      // every Sign-in-with-Apple account (see hooks/useAppleAuth.ts).
      const verified =
        token.email_verified === true || (token.email_verified as unknown) === 'true';
      const byEmail = verified ? await findUserByEmail(email) : undefined;
      if (byEmail) {
        const reclaimed = await updateUserById(byEmail.id, {
          firebaseUid: token.uid,
          deletedAt: null,
        });
        return finish(reclaimed ?? byEmail, false);
      }
      // Unverified email: don't 500, just create an email-less account —
      // a real merge is a separate account-linking flow.
      const created = await insertUser({ firebaseUid: token.uid, phoneE164, email: null });
      return finish(created, true);
    }
    throw err;
  }
}

/**
 * Every return path funnels through here so `lastActiveAt` is recorded on
 * every app launch. This route runs under `requireFirebaseToken`, not
 * `requireUser` — the only authed route that skips the latter's automatic
 * heartbeat bump — and the nightly horoscope batch's dormant-user filter
 * (see horoscope.repo.ts `listRecentlyActiveUsersAfter`) depends on this
 * being current. Fire-and-forget: a heartbeat failure must never fail login.
 */
function finish(user: EstablishSessionResult['user'], created: boolean): EstablishSessionResult {
  void touchUserLastActive(user.id).catch(() => {});
  return { user, created };
}
