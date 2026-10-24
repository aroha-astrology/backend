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

/** Content languages spoken mostly in India. A reader on one of these is not asked to choose a look. */
const INDIAN_LANGUAGES = new Set(['hi', 'bn', 'mr', 'te', 'ta', 'gu', 'kn']);

/**
 * True for a reader who looks Indian from the account itself: they signed in with an Indian phone
 * number (the phone sign-in is offered in India only) or use the app in an Indian language, and
 * have not picked a look. Such a reader keeps today's app: no picker, no Settings switch row.
 */
export async function findUserIsIndian(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ uiSkin: users.uiSkin, phoneHash: users.phoneE164Hash, language: users.contentLanguage })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row || row.uiSkin) return false;
  const language = (row.language ?? '').split('-')[0]!.toLowerCase();
  return row.phoneHash != null || INDIAN_LANGUAGES.has(language);
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
