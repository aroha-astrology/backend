/**
 * Field-level encryption for the highest-sensitivity columns (birth data,
 * gotra, chat transcripts). AES-256-GCM with a random IV per value — this is
 * a repo-layer-only concern: every function outside `*.repo.ts` keeps
 * reading/writing plain values exactly as before, because encryption and
 * decryption both happen at the DB read/write boundary.
 *
 * `ENCRYPTION_KEY` must be a 32-byte key, base64-encoded (`openssl rand
 * -base64 32`). Losing it means the encrypted columns become unrecoverable —
 * back it up outside the app's own `.env` (e.g. a secrets manager), the same
 * way `DATABASE_URL` and the Firebase Admin key are handled.
 */

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const PREFIX = 'enc:v1:';

let cachedKey: Buffer | undefined;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENCRYPTION_KEY is not set — required to read/write encrypted columns (birth data, gotra, chat transcripts).',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (base64 of a 256-bit key).');
  }
  cachedKey = key;
  return key;
}

/** Encrypts a string value. Returns null unchanged (nullable columns stay null). */
export function encryptField(value: string | null | undefined): string | null {
  if (value == null) return null;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`;
}

/**
 * Decrypts a value produced by `encryptField`. If the value doesn't carry
 * the `enc:v1:` prefix, it's returned as-is — this is what makes the
 * migration non-destructive: rows written before encryption was enabled
 * still read back correctly until they're next written (and re-encrypted).
 */
export function decryptField(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!value.startsWith(PREFIX)) return value;
  const [ivB64, authTagB64, ciphertextB64] = value.slice(PREFIX.length).split(':');
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error('Malformed encrypted field value (expected iv:authTag:ciphertext).');
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

/** Encrypts a JSON-serializable value (objects like PlaceOfBirth) as a single blob. */
export function encryptJson<T>(value: T | null | undefined): string | null {
  if (value == null) return null;
  return encryptField(JSON.stringify(value));
}

/** Inverse of `encryptJson` — returns null for null input or a non-JSON legacy plaintext value. */
export function decryptJson<T>(value: string | null | undefined): T | null {
  const decrypted = decryptField(value);
  if (decrypted == null) return null;
  try {
    return JSON.parse(decrypted) as T;
  } catch {
    // Legacy unencrypted row that isn't valid JSON either — surface as null
    // rather than throwing, so a single bad row can't 500 an entire request.
    return null;
  }
}

/**
 * Deterministic HMAC-SHA256 blind index for equality lookups (e.g. phone
 * number) on an otherwise non-deterministically-encrypted column. Uses a
 * separate key from the AES key so a hash-key leak alone can't decrypt data,
 * and vice versa.
 */
export function hashForLookup(value: string): string {
  const raw = env.ENCRYPTION_HASH_KEY;
  if (!raw) {
    throw new Error('ENCRYPTION_HASH_KEY is not set — required for encrypted-column lookups.');
  }
  return createHmac('sha256', Buffer.from(raw, 'base64')).update(value, 'utf8').digest('hex');
}
