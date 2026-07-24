import type { DecodedIdToken } from 'firebase-admin/auth';
import type { ProviderAccountRow, UserRow } from '../db/schema.js';

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
    /**
     * The authenticated provider account (set by requireProvider, or by
     * requireUserOrProvider when the caller turns out to be a provider, not
     * a customer). NOT the raw DB row — no firebaseUid/createdAt in the
     * request context, just what routes actually need.
     */
    provider: Pick<ProviderAccountRow, 'id' | 'kind' | 'refId' | 'displayName'>;
    /** Short request id, on every log line and on the X-Request-Id header. */
    requestId: string;
  }
}

export {};
