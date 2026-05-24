import type { MiddlewareHandler } from 'hono';
import { getFirebaseAuth } from '../config/firebase.js';
import { Errors } from '../lib/errors.js';
import { findUserByFirebaseUid } from '../modules/users/users.repo.js';

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? null;
}

/**
 * Verifies the Firebase ID token on the request and stores the decoded
 * claims in `c.var.firebaseToken`. Does NOT touch the database.
 *
 * Use this on `POST /v1/auth/session` (where we still need to create the
 * user row).
 */
export const requireFirebaseToken: MiddlewareHandler = async (c, next) => {
  const token = extractBearer(c.req.header('authorization'));
  if (!token) throw Errors.unauthorized('Missing or malformed Authorization header');

  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    c.set('firebaseToken', decoded);
  } catch {
    throw Errors.unauthorized('Invalid or expired ID token');
  }

  await next();
};

/**
 * Verifies the Firebase ID token AND looks up the matching application
 * user. 401 if either step fails. The user row is exposed at `c.var.user`.
 *
 * Use this on any endpoint that operates on an existing user.
 */
export const requireUser: MiddlewareHandler = async (c, next) => {
  const token = extractBearer(c.req.header('authorization'));
  if (!token) throw Errors.unauthorized('Missing or malformed Authorization header');

  let decodedUid: string;
  try {
    const decoded = await getFirebaseAuth().verifyIdToken(token);
    c.set('firebaseToken', decoded);
    decodedUid = decoded.uid;
  } catch {
    throw Errors.unauthorized('Invalid or expired ID token');
  }

  const user = await findUserByFirebaseUid(decodedUid);
  if (!user || user.deletedAt !== null) {
    throw Errors.unauthorized(
      'No active account for this token. Call POST /v1/auth/session first.',
    );
  }
  c.set('user', user);

  await next();
};
