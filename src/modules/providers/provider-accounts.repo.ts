import { and, eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import {
  providerAccounts,
  type NewProviderAccountRow,
  type ProviderAccountRow,
} from '../../db/schema.js';

export async function findProviderAccountByFirebaseUid(
  firebaseUid: string,
): Promise<ProviderAccountRow | undefined> {
  const rows = await db
    .select()
    .from(providerAccounts)
    .where(eq(providerAccounts.firebaseUid, firebaseUid))
    .limit(1);
  return rows[0];
}

export async function findProviderAccountByKindAndRefId(
  kind: 'astrologer' | 'pandit',
  refId: string,
): Promise<ProviderAccountRow | undefined> {
  const rows = await db
    .select()
    .from(providerAccounts)
    .where(and(eq(providerAccounts.kind, kind), eq(providerAccounts.refId, refId)))
    .limit(1);
  return rows[0];
}

export async function createProviderAccount(
  input: NewProviderAccountRow,
): Promise<ProviderAccountRow> {
  const [row] = await db.insert(providerAccounts).values(input).returning();
  return row!;
}
