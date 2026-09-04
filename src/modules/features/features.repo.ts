import { db } from '../../config/db.js';
import { featureFlags, type FeatureFlagRow } from '../../db/schema.js';

/** Every admin-set feature override. A feature with no row here uses its FEATURE_REGISTRY default. */
export async function findAllFeatureOverrides(): Promise<FeatureFlagRow[]> {
  return db.select().from(featureFlags);
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
    })
    .onConflictDoUpdate({
      target: featureFlags.key,
      set: { enabled, pricePaise, originalPricePaise, model, updatedBy, updatedAt: now, enabledAt },
    })
    .returning();
  return row!;
}
