import type { DecodedIdToken } from 'firebase-admin/auth';
import type { UserRow } from '../db/schema.js';

declare module 'hono' {
  interface ContextVariableMap {
    /** Decoded Firebase ID token claims (set by requireFirebaseToken). */
    firebaseToken: DecodedIdToken;
    /** The application user row matching the Firebase UID (set by requireUser). */
    user: UserRow;
    /**
     * `user.activeProfileId`, mirrored onto the context for cheap access
     * (set by requireUser — no extra query, it's already on the loaded row).
     * null = the primary/self profile; non-null = an additional profile in
     * birth_profiles. Route handlers that need the full resolved birth data
     * should call resolveActiveProfileContext(c.var.user) themselves — this
     * is just the raw pointer.
     */
    activeProfileId: string | null;
    /** Short request id, on every log line and on the X-Request-Id header. */
    requestId: string;
  }
}

export {};
