import type { DecodedIdToken } from 'firebase-admin/auth';
import type { UserRow } from '../db/schema.js';

declare module 'hono' {
  interface ContextVariableMap {
    /** Decoded Firebase ID token claims (set by requireFirebaseToken). */
    firebaseToken: DecodedIdToken;
    /** The application user row matching the Firebase UID (set by requireUser). */
    user: UserRow;
    /** Short request id, on every log line and on the X-Request-Id header. */
    requestId: string;
  }
}

export {};
