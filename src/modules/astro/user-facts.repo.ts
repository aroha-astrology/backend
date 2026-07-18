import { eq, and, isNull, asc } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { userFacts } from '../../db/schema.js';
import { encryptField, decryptField } from '../../lib/crypto/field-encryption.js';

/** Hard cap so a very long-running conversation can't grow this unbounded — applied PER (userId, birthProfileId), not globally across a user's profiles. */
const MAX_FACTS_PER_USER = 50;

/** `birthProfileId === null` filters to the primary/self profile; a non-null id filters to that additional profile. */
function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(userFacts.birthProfileId)
    : eq(userFacts.birthProfileId, birthProfileId);
}

export async function getUserFacts(
  userId: string,
  birthProfileId: string | null,
): Promise<string[]> {
  const rows = await db
    .select({ fact: userFacts.fact })
    .from(userFacts)
    .where(and(eq(userFacts.userId, userId), profileFilter(birthProfileId)))
    .orderBy(asc(userFacts.createdAt));
  return rows.map((r) => decryptField(r.fact) ?? '');
}

/**
 * Insert newly-extracted facts, skipping any that duplicate (case-
 * insensitively) a fact already stored for this (userId, birthProfileId)
 * pair, then trims down to `MAX_FACTS_PER_USER` by dropping the oldest rows
 * first — scoped per profile, so a chatty conversation on one saved profile
 * can't evict facts remembered for a sibling profile.
 */
export async function saveUserFacts(
  userId: string,
  birthProfileId: string | null,
  facts: string[],
): Promise<void> {
  if (facts.length === 0) return;

  const existing = await db
    .select({ fact: userFacts.fact })
    .from(userFacts)
    .where(and(eq(userFacts.userId, userId), profileFilter(birthProfileId)));
  const existingLower = new Set(
    existing.map((r) => (decryptField(r.fact) ?? '').trim().toLowerCase()),
  );

  const toInsert = [...new Set(facts.map((f) => f.trim()).filter(Boolean))].filter(
    (f) => !existingLower.has(f.toLowerCase()),
  );
  if (toInsert.length === 0) return;

  await db
    .insert(userFacts)
    .values(
      toInsert.map((fact) => ({ userId, birthProfileId, fact: encryptField(fact) as string })),
    );

  const total = existing.length + toInsert.length;
  if (total > MAX_FACTS_PER_USER) {
    const overflow = total - MAX_FACTS_PER_USER;
    const oldest = await db
      .select({ id: userFacts.id })
      .from(userFacts)
      .where(and(eq(userFacts.userId, userId), profileFilter(birthProfileId)))
      .orderBy(asc(userFacts.createdAt))
      .limit(overflow);
    for (const row of oldest) {
      await db.delete(userFacts).where(eq(userFacts.id, row.id));
    }
  }
}
