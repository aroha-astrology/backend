import { and, eq, gt, isNull, or } from 'drizzle-orm';
import { db } from '../../config/db.js';
import { featureUnlocks, type FeatureUnlockRow } from '../../db/schema.js';

/**
 * One-off paid unlocks of a roadmap feature for a profile (full life timeline,
 * a bond's detailed insight, …) — see schema.ts's feature_unlocks.
 */

function profileFilter(birthProfileId: string | null) {
  return birthProfileId === null
    ? isNull(featureUnlocks.birthProfileId)
    : eq(featureUnlocks.birthProfileId, birthProfileId);
}

/** The live unlock (not expired) for this user/profile/feature, if any. */
export async function findActiveUnlock(
  userId: string,
  birthProfileId: string | null,
  featureKey: string,
): Promise<FeatureUnlockRow | undefined> {
  const [row] = await db
    .select()
    .from(featureUnlocks)
    .where(
      and(
        eq(featureUnlocks.userId, userId),
        profileFilter(birthProfileId),
        eq(featureUnlocks.featureKey, featureKey),
        or(isNull(featureUnlocks.expiresAt), gt(featureUnlocks.expiresAt, new Date())),
      ),
    )
    .limit(1);
  return row;
}

/**
 * Records an unlock. Returns false when one already exists (the partial
 * unique indexes make a double purchase impossible), so the caller can refund.
 */
export async function insertUnlock(values: {
  userId: string;
  birthProfileId: string | null;
  featureKey: string;
  pricePaidPaise: number;
  expiresAt?: Date | null;
}): Promise<boolean> {
  const rows = await db
    .insert(featureUnlocks)
    .values({ ...values, expiresAt: values.expiresAt ?? null })
    .onConflictDoNothing()
    .returning({ id: featureUnlocks.id });
  return rows.length > 0;
}
