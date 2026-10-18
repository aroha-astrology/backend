import { db } from '../../config/db.js';
import { eq } from 'drizzle-orm';
import { featureFlags, users, type FeatureFlagRow } from '../../db/schema.js';

/** Every admin-set feature override. A feature with no row here uses its FEATURE_REGISTRY default. */
export async function findAllFeatureOverrides(): Promise<FeatureFlagRow[]> {
  return db.select().from(featureFlags);
}

/** The look a user picked ('CLASSIC_VEDIC' / 'MODERN_COSMIC'), or null if they have not picked one. */
export async function findUserSkin(userId: string): Promise<'CLASSIC_VEDIC' | 'MODERN_COSMIC' | null> {
  const [row] = await db.select({ uiSkin: users.uiSkin }).from(users).where(eq(users.id, userId)).limit(1);
  return row?.uiSkin ?? null;
}

/** Upsert the override for one feature key. Used by the (future) admin PUT endpoint. */
export async function upsertFeatureOverride(
  key: string,
  enabled: boolean,
  pricePaise: number | null,
  originalPricePaise: number | null,
  model: string | null,
  updatedBy: string | null,
  enabledAt: Date | null,
  audience: 'all' | 'classic' | 'cosmic' | null = null,
): Promise<FeatureFlagRow> {
  const now = new Date();
  const [row] = await db
    .insert(featureFlags)
    .values({
      key,
      enabled,
      pricePaise,
      originalPricePaise,
      model,
      updatedBy,
      updatedAt: now,
      enabledAt,
      audience,
    })
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { enabled, pricePaise, originalPricePaise, model, updatedBy, updatedAt: now, enabledAt, audience },
    })
    .returning();
  return row!;
}
