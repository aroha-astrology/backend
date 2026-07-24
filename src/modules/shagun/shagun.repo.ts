import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { shagunClickEvents, shagunProducts, type ShagunProductRow } from '../../db/schema.js';
import type { ShagunProductCategory } from './shagun.schemas.js';

/** Active products, optionally filtered to one category, sorted for display. */
export async function listActiveShagunProducts(
  category?: ShagunProductCategory,
): Promise<ShagunProductRow[]> {
  return db
    .select()
    .from(shagunProducts)
    .where(
      category
        ? and(eq(shagunProducts.isActive, true), eq(shagunProducts.category, category))
        : eq(shagunProducts.isActive, true),
    )
    .orderBy(asc(shagunProducts.sortOrder));
}

/**
 * A single active product by id — used to resolve the affiliate URL for the
 * redirect endpoint. Returns undefined for an unknown id OR one that's been
 * deactivated, so both cases 404 alike.
 */
export async function findActiveShagunProductById(
  id: string,
): Promise<ShagunProductRow | undefined> {
  const rows = await db
    .select()
    .from(shagunProducts)
    .where(and(eq(shagunProducts.id, id), eq(shagunProducts.isActive, true)))
    .limit(1);
  return rows[0];
}

/** Logs one click — analytics only, no read path depends on this. */
export async function insertShagunClickEvent(productId: string, userId: string): Promise<void> {
  await db.insert(shagunClickEvents).values({ productId, userId });
}
