import type { DecodedIdToken } from 'firebase-admin/auth';
import type { UserRow } from '../../db/schema.js';
import { isUniqueViolation } from '../../lib/db-errors.js';
import {
  findUserByFirebaseUid,
  findUserByPhoneE164,
  insertUser,
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
 */
export async function establishSession(token: DecodedIdToken): Promise<EstablishSessionResult> {
  const existing = await findUserByFirebaseUid(token.uid);

  if (existing) {
    if (existing.deletedAt !== null) {
      return { user: await resurrect(existing), created: false };
    }
    return { user: existing, created: false };
  }

  const phoneE164 = typeof token.phone_number === 'string' ? token.phone_number : null;
  try {
    const created = await insertUser({ firebaseUid: token.uid, phoneE164 });
    return { user: created, created: true };
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
        return { user: reclaimed ?? byPhone, created: false };
      }
    }
    throw err;
  }
}
