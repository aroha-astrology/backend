import type { MiddlewareHandler } from 'hono';
import { getFirebaseAuth } from '../config/firebase.js';
import { env } from '../config/env.js';
import { Errors } from '../lib/errors.js';
import { findUserByFirebaseUid, touchUserLastActive } from '../modules/users/users.repo.js';

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
 * Gates the HTTP admin API (`/v1/admin/*`) to an allowlisted set of phone
 * numbers (`ADMIN_PHONE_E164`, see config/env.ts). Wraps `requireUser` by
 * direct function call rather than composing two independent entries in a
 * route's `middleware: [...]` array (the pattern used elsewhere for e.g.
 * `[requireUser, llmRateLimit, requireConsent]`) — this codebase has no
 * existing precedent for one middleware assuming another already ran
 * upstream and then re-deriving that assumption in isolation, and a single
 * self-contained export is what actually needs unit testing here (the
 * "unauthenticated delegates to requireUser" case included). `requireUser`
 * is a plain (c, next) => Promise<void> function like any Hono middleware,
 * so calling it directly with a synthetic `next` is valid composition, not a
 * Hono-internal hack.
 *
 * Deliberately checks the Firebase ID token's `phone_number` CLAIM, not the
 * `users.phoneE164` DB column — a DB column would make admin access follow a
 * phone NUMBER rather than a verified identity, so a recycled number that
 * once belonged to an admin could inherit admin access for whoever picks it
 * up next (see the phone-recycling-takeover finding in the 2026-07-17
 * security audit). The `/v1/me` `isAdmin` flag is the one place that reads
 * the DB column instead — deliberately, since it's just a UI affordance
 * (whether to render the `/admin` link) and not an authorization boundary.
 */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  await requireUser(c, async () => {
    const token = c.get('firebaseToken');
    const phone = typeof token.phone_number === 'string' ? token.phone_number : null;
    if (!phone || !env.ADMIN_PHONE_E164.includes(phone)) {
      throw Errors.forbidden('Admin access required');
    }
    await next();
  });
};
