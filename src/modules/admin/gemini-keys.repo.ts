import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { geminiKeys, type GeminiKeyRow, type NewGeminiKeyRow } from '../../db/schema.js';

export async function listGeminiKeyRows(): Promise<GeminiKeyRow[]> {
  return db.select().from(geminiKeys).orderBy(asc(geminiKeys.createdAt));
}

export async function findGeminiKeyRow(id: string): Promise<GeminiKeyRow | undefined> {
  const [row] = await db.select().from(geminiKeys).where(eq(geminiKeys.id, id));
  return row;
}

/** Inserts the rows .env keys need; a fingerprint that already has one is left alone. */
export async function insertMissingGeminiKeyRows(rows: NewGeminiKeyRow[]): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(geminiKeys).values(rows).onConflictDoNothing({ target: geminiKeys.fingerprint });
}

/** Returns null when the fingerprint already has a row (the key is already in the pool). */
export async function insertGeminiKeyRow(row: NewGeminiKeyRow): Promise<GeminiKeyRow | null> {
  const [inserted] = await db
    .insert(geminiKeys)
    .values(row)
    .onConflictDoNothing({ target: geminiKeys.fingerprint })
    .returning();
  return inserted ?? null;
}

export async function updateGeminiKeyRow(
  id: string,
  patch: Partial<Pick<GeminiKeyRow, 'name' | 'tier' | 'enabled' | 'paidRank'>>,
  updatedBy: string,
): Promise<GeminiKeyRow | undefined> {
  const [row] = await db
    .update(geminiKeys)
    .set({ ...patch, updatedAt: sql`now()`, updatedBy })
    .where(eq(geminiKeys.id, id))
    .returning();
  return row;
}

export async function recordGeminiKeyTest(id: string, ok: boolean, message: string): Promise<void> {
  await db
    .update(geminiKeys)
    .set({ lastTestedAt: sql`now()`, lastTestOk: ok, lastTestMessage: message })
    .where(eq(geminiKeys.id, id));
}

export async function deleteGeminiKeyRow(id: string): Promise<void> {
  await db.delete(geminiKeys).where(eq(geminiKeys.id, id));
}
