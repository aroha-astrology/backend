import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { digitalProducts, type DigitalProductRow } from '../../db/schema.js';

export type DigitalKind = 'yantra' | 'wallpaper';

function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(digitalProducts.birthProfileId)
    : eq(digitalProducts.birthProfileId, birthProfileId);
}

/** Every digital product the user owns for this profile. */
export async function listDigitalProducts(
  userId: string,
  birthProfileId: string | null,
): Promise<DigitalProductRow[]> {
  return db
    .select()
    .from(digitalProducts)
    .where(and(eq(digitalProducts.userId, userId), profileFilter(birthProfileId)));
}

/** Inserts the purchase; false when this profile already owns that kind (a concurrent buy won). */
export async function insertDigitalProduct(values: {
  userId: string;
  birthProfileId: string | null;
  kind: DigitalKind;
  spec: object;
  pricePaidPaise: number;
}): Promise<boolean> {
  const rows = await db
    .insert(digitalProducts)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: digitalProducts.id });
  return rows.length > 0;
}
