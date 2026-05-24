import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { users, type NewUserRow, type UserRow } from '../../db/schema.js';

export async function findUserByFirebaseUid(firebaseUid: string): Promise<UserRow | undefined> {
  const rows = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid)).limit(1);
  return rows[0];
}

export async function findActiveUserByFirebaseUid(
  firebaseUid: string,
): Promise<UserRow | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.firebaseUid, firebaseUid), isNull(users.deletedAt)))
    .limit(1);
  return rows[0];
}

export async function findActiveUserById(id: string): Promise<UserRow | undefined> {
  const rows = await db
    .select()
    .from(users)
    .where(and(eq(users.id, id), isNull(users.deletedAt)))
    .limit(1);
  return rows[0];
}

export async function insertUser(values: NewUserRow): Promise<UserRow> {
  const [row] = await db.insert(users).values(values).returning();
  if (!row) throw new Error('Failed to insert user');
  return row;
}

export async function updateUserById(
  id: string,
  patch: Partial<NewUserRow>,
): Promise<UserRow | undefined> {
  const [row] = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return row;
}

export async function softDeleteUserById(id: string): Promise<void> {
  await db
    .update(users)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, id));
}
