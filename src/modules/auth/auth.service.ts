import type { DecodedIdToken } from 'firebase-admin/auth';
import type { UserRow } from '../../db/schema.js';
import { findUserByFirebaseUid, insertUser, updateUserById } from '../users/users.repo.js';

export type EstablishSessionResult = {
  user: UserRow;
  created: boolean;
};

/**
 * Idempotent: given a verified Firebase token, ensure an active user row
 * exists for that UID and return it. Resurrects soft-deleted rows so a
 * user who deletes their account and signs back in can recover.
 */
export async function establishSession(token: DecodedIdToken): Promise<EstablishSessionResult> {
  const existing = await findUserByFirebaseUid(token.uid);

  if (existing) {
    if (existing.deletedAt !== null) {
      const restored = await updateUserById(existing.id, { deletedAt: null });
      return { user: restored ?? existing, created: false };
    }
    return { user: existing, created: false };
  }

  const phoneE164 = typeof token.phone_number === 'string' ? token.phone_number : null;
  const created = await insertUser({
    firebaseUid: token.uid,
    phoneE164,
  });
  return { user: created, created: true };
}
