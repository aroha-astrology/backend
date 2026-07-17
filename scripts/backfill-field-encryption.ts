/**
 * One-time backfill for the field-level-encryption migration
 * (0023_security_hardening_2026_07_17.sql).
 *
 * That migration only changes column TYPES (date/time/jsonb -> text) — it
 * does not touch existing values, so after it runs, every existing row still
 * holds PLAINTEXT in the columns the app now treats as encrypted. That's
 * safe to read (decryptField/decryptJson pass plaintext through unchanged
 * when it doesn't carry the `enc:v1:` prefix), but two things are NOT
 * optional and MUST happen before the new app code goes live:
 *
 *   1. `users.phone_e164_hash` is NULL for every existing row. Login
 *      (`findUserByPhoneE164`) looks users up by this hash, not by the
 *      plaintext column anymore — without this backfill, EVERY existing
 *      user is locked out.
 *   2. Existing PII sits unencrypted until this backfill (or a future write)
 *      touches it — that defeats the point of the migration for accounts
 *      that never get updated again.
 *
 * Run ONCE, after the schema migration and after ENCRYPTION_KEY /
 * ENCRYPTION_HASH_KEY are set in the environment, and BEFORE (or as part of)
 * deploying the new application code:
 *
 *   npx tsx scripts/backfill-field-encryption.ts
 *
 * Idempotent: already-encrypted values (prefixed `enc:v1:`) are left alone,
 * so it's safe to re-run if it's interrupted partway through.
 */
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '../src/config/db.js';
import { users, birthProfiles, chatSessions, userFacts } from '../src/db/schema.js';
import { encryptField, hashForLookup } from '../src/lib/crypto/field-encryption.js';

const ALREADY_ENCRYPTED = 'enc:v1:';
const isPlain = (v: string | null): v is string => v != null && !v.startsWith(ALREADY_ENCRYPTED);

async function backfillUsers() {
  const rows = await db.select().from(users);
  let touched = 0;
  for (const row of rows) {
    const patch: Record<string, string | null> = {};
    let needsWrite = false;

    if (row.phoneE164 && !row.phoneE164Hash) {
      // Compute the hash from whatever's currently in phoneE164 — if it's
      // already encrypted (a re-run after a partial backfill), skip; the
      // plaintext needed to hash it correctly is only available pre-encrypt.
      if (isPlain(row.phoneE164)) {
        patch.phoneE164Hash = hashForLookup(row.phoneE164);
        needsWrite = true;
      }
    }
    if (isPlain(row.phoneE164)) {
      patch.phoneE164 = encryptField(row.phoneE164);
      needsWrite = true;
    }
    if (isPlain(row.dateOfBirth)) {
      patch.dateOfBirth = encryptField(row.dateOfBirth);
      needsWrite = true;
    }
    if (isPlain(row.timeOfBirth)) {
      patch.timeOfBirth = encryptField(row.timeOfBirth);
      needsWrite = true;
    }
    const placeRaw = row.placeOfBirth as unknown as string | null;
    if (isPlain(placeRaw)) {
      // placeRaw here is the raw column value, which pre-migration-backfill
      // is a JSON string (from the old jsonb column) — encrypt it as-is,
      // decryptJson on read will JSON.parse the decrypted plaintext back.
      patch.placeOfBirth = encryptField(placeRaw);
      needsWrite = true;
    }
    if (isPlain(row.gotra)) {
      patch.gotra = encryptField(row.gotra);
      needsWrite = true;
    }
    if (isPlain(row.sankalpaName)) {
      patch.sankalpaName = encryptField(row.sankalpaName);
      needsWrite = true;
    }

    if (needsWrite) {
      await db.update(users).set(patch).where(eq(users.id, row.id));
      touched++;
    }
  }
  console.log(`users: backfilled ${touched}/${rows.length} rows`);
}

async function backfillBirthProfiles() {
  const rows = await db.select().from(birthProfiles);
  let touched = 0;
  for (const row of rows) {
    const patch: Record<string, string | null> = {};
    let needsWrite = false;

    if (isPlain(row.dateOfBirth)) {
      patch.dateOfBirth = encryptField(row.dateOfBirth);
      needsWrite = true;
    }
    if (isPlain(row.timeOfBirth)) {
      patch.timeOfBirth = encryptField(row.timeOfBirth);
      needsWrite = true;
    }
    const placeRaw = row.placeOfBirth as unknown as string | null;
    if (isPlain(placeRaw)) {
      patch.placeOfBirth = encryptField(placeRaw);
      needsWrite = true;
    }
    if (isPlain(row.gotra)) {
      patch.gotra = encryptField(row.gotra);
      needsWrite = true;
    }

    if (needsWrite) {
      await db.update(birthProfiles).set(patch).where(eq(birthProfiles.id, row.id));
      touched++;
    }
  }
  console.log(`birth_profiles: backfilled ${touched}/${rows.length} rows`);
}

async function backfillChatSessions() {
  const rows = await db.select().from(chatSessions);
  let touched = 0;
  for (const row of rows) {
    const patch: Record<string, string | null> = {};
    let needsWrite = false;

    // history's raw value pre-backfill is a JSON string (from the old jsonb
    // column) — encrypt as-is; decryptJson on read parses the decrypted text.
    if (isPlain(row.history)) {
      patch.history = encryptField(row.history);
      needsWrite = true;
    }
    if (isPlain(row.summary)) {
      patch.summary = encryptField(row.summary);
      needsWrite = true;
    }

    if (needsWrite) {
      await db.update(chatSessions).set(patch).where(eq(chatSessions.id, row.id));
      touched++;
    }
  }
  console.log(`chat_sessions: backfilled ${touched}/${rows.length} rows`);
}

async function backfillUserFacts() {
  const rows = await db.select().from(userFacts);
  let touched = 0;
  for (const row of rows) {
    if (isPlain(row.fact)) {
      await db
        .update(userFacts)
        .set({ fact: encryptField(row.fact) as string })
        .where(eq(userFacts.id, row.id));
      touched++;
    }
  }
  console.log(`user_facts: backfilled ${touched}/${rows.length} rows`);
}

async function main() {
  if (!process.env['ENCRYPTION_KEY'] || !process.env['ENCRYPTION_HASH_KEY']) {
    throw new Error(
      'ENCRYPTION_KEY and ENCRYPTION_HASH_KEY must be set before running this backfill.',
    );
  }
  await backfillUsers();
  await backfillBirthProfiles();
  await backfillChatSessions();
  await backfillUserFacts();
  console.log('Backfill complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
