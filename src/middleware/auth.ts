import type { MiddlewareHandler } from 'hono';
import { getFirebaseAuth } from '../config/firebase.js';
import { env } from '../config/env.js';
import { Errors } from '../lib/errors.js';
import { findUserByFirebaseUid, touchUserLastActive } from '../modules/users/users.repo.js';
import { findProviderAccountByFirebaseUid } from '../modules/providers/provider-accounts.repo.js';

/** Only bump `lastActiveAt` this often per user, so a hot API path doesn't turn into a write on every request. */
const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000;

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
  // Cheap to set — already a field on the loaded `user` row, no extra query.
  // Route handlers that need the full resolved profile (birth data, etc.)
  // call resolveActiveProfileContext(c.var.user) themselves.
  c.set('activeProfileId', user.activeProfileId);

  const isStale =
    !user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > LAST_ACTIVE_THROTTLE_MS;
  if (isStale) {
    // Fire-and-forget — must never add latency or failure risk to the request itself.
    void touchUserLastActive(user.id).catch(() => {});
  }

  await next();
};

/**
 * `requireUser` PLUS a Firebase-UID allowlist check — for the `/v1/admin/*`
 * HTTP admin console routes. Mirrors the Telegram admin bot's chat-ID
 * allowlist pattern (see telegram-bot.service.ts resolveTier) but keyed off
 * the caller's own Firebase UID instead of a Telegram chat ID, since these
 * routes are reached with a normal Firebase ID token, not a Telegram webhook
 * update.
 *
 * Wraps requireUser (rather than duplicating its token-verification/user-
 * lookup logic) so `c.var.user`/`c.var.firebaseToken` end up set exactly the
 * same way as on every other authenticated route.
 */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  await requireUser(c, async () => {
    const user = c.get('user');
    const adminUids = new Set(env.ADMIN_FIREBASE_UIDS);
    if (!adminUids.has(user.firebaseUid)) {
      throw Errors.forbidden('Admin access required');
    }
    await next();
  });
};

/**
 * Verifies the Firebase ID token AND looks up the matching provider_accounts
 * row (an admin-invited astrologer/pandit's login — see
 * provider-accounts.repo.ts). 401 if either step fails. The provider is
 * exposed at `c.var.provider` as a plain `{ id, kind, refId, displayName }`
 * object (not the raw DB row).
 *
 * Deliberately does NOT reuse requireUser: a provider has no `users` row, so
 * requireUser would always 401 it. This is a parallel gate, not a superset.
 */
export const requireProvider: MiddlewareHandler = async (c, next) => {
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

  const account = await findProviderAccountByFirebaseUid(decodedUid);
  if (!account) {
    throw Errors.unauthorized('No provider account for this token.');
  }
  c.set('provider', {
    id: account.id,
    kind: account.kind,
    refId: account.refId,
    displayName: account.displayName,
  });

  await next();
};

/**
 * For endpoints reachable by EITHER a customer or their assigned provider —
 * the booking-messages routes (messaging.routes.ts). Verifies the token once,
 * then tries a customer match first (findUserByFirebaseUid, same
 * not-deleted check requireUser uses), falling back to a provider match
 * (findProviderAccountByFirebaseUid) if no user matches. 401 if neither
 * matches. Sets exactly ONE of `c.var.user` / `c.var.provider` — callers
 * must branch on which one is present (see messaging.routes.ts#resolveCaller).
 */
export const requireUserOrProvider: MiddlewareHandler = async (c, next) => {
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
  if (user && user.deletedAt === null) {
    c.set('user', user);
    c.set('activeProfileId', user.activeProfileId);
    const isStale =
      !user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > LAST_ACTIVE_THROTTLE_MS;
    if (isStale) {
      void touchUserLastActive(user.id).catch(() => {});
    }
    await next();
    return;
  }

  const account = await findProviderAccountByFirebaseUid(decodedUid);
  if (!account) {
    throw Errors.unauthorized('No active account for this token.');
  }
  c.set('provider', {
    id: account.id,
    kind: account.kind,
    refId: account.refId,
    displayName: account.displayName,
  });

  await next();
};
