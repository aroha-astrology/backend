/**
 * Seeds a couple of demo coupon codes for the credit-pack purchase flow.
 * Idempotent — re-running updates existing rows by code instead of duplicating.
 * Usage: npx tsx scripts/seed-coupons.ts
 */
import { db } from '../src/config/db.js';
import { coupons } from '../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';

const SEED_COUPONS = [
  {
    code: 'WELCOME10',
    discountType: 'percent' as const,
    discountValue: 10,
    maxRedemptions: null,
    minAmountPaise: null,
    active: true,
    expiresAt: null,
  },
  {
    code: 'FLAT50',
    discountType: 'flat' as const,
    discountValue: 5000, // paise = ₹50
    maxRedemptions: 500,
    minAmountPaise: 20000, // ₹200 minimum order
    active: true,
    expiresAt: null,
  },
];

async function main() {
  for (const c of SEED_COUPONS) {
    const [existing] = await db
      .select({ id: coupons.id })
      .from(coupons)
      .where(sql`upper(${coupons.code}) = upper(${c.code})`)
      .limit(1);

    if (existing) {
      await db
        .update(coupons)
        .set({
          discountType: c.discountType,
          discountValue: c.discountValue,
          maxRedemptions: c.maxRedemptions,
          minAmountPaise: c.minAmountPaise,
          active: c.active,
          expiresAt: c.expiresAt,
        })
        .where(eq(coupons.id, existing.id));
      console.log(`Updated coupon ${c.code}`);
    } else {
      await db.insert(coupons).values(c);
      console.log(`Inserted coupon ${c.code}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
