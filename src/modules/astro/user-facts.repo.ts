import { eq, asc } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { userFacts } from '../../db/schema.js';
import { encryptField, decryptField } from '../../lib/crypto/field-encryption.js';

/** Hard cap so a very long-running conversation can't grow this unbounded. */
const MAX_FACTS_PER_USER = 50;

export async function getUserFacts(userId: string): Promise<string[]> {
  const rows = await db
    .select({ fact: userFacts.fact })
    .from(userFacts)
    .where(eq(userFacts.userId, userId))
    .orderBy(asc(userFacts.createdAt));
  return rows.map((r) => decryptField(r.fact) ?? '');
}

/**
 * Insert newly-extracted facts, skipping any that duplicate (case-
 * insensitively) a fact already stored for this user, then trims down to
 * `MAX_FACTS_PER_USER` by dropping the oldest rows first.
 */
export async function saveUserFacts(userId: string, facts: string[]): Promise<void> {
  if (facts.length === 0) return;

  const existing = await db
    .select({ fact: userFacts.fact })
    .from(userFacts)
    .where(eq(userFacts.userId, userId));
  const existingLower = new Set(
    existing.map((r) => (decryptField(r.fact) ?? '').trim().toLowerCase()),
  );

  const toInsert = [...new Set(facts.map((f) => f.trim()).filter(Boolean))].filter(
    (f) => !existingLower.has(f.toLowerCase()),
  );
  if (toInsert.length === 0) return;

  await db
    .insert(userFacts)
    .values(toInsert.map((fact) => ({ userId, fact: encryptField(fact) as string })));

  const total = existing.length + toInsert.length;
  if (total > MAX_FACTS_PER_USER) {
    const overflow = total - MAX_FACTS_PER_USER;
    const oldest = await db
      .select({ id: userFacts.id })
      .from(userFacts)
      .where(eq(userFacts.userId, userId))
      .orderBy(asc(userFacts.createdAt))
      .limit(overflow);
    for (const row of oldest) {
      await db.delete(userFacts).where(eq(userFacts.id, row.id));
    }
  }
}
