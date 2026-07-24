/**
 * Seeds the pooja_catalog table for the concierge-pilot pooja-booking batch,
 * reusing the exact same curated pooja names/descriptions already used by
 * the free/AI pooja-guidance report
 * (src/lib/astro-engine/poojaRecommendations.ts) — deliberately NOT
 * inventing a new 50-pooja catalog (see the old, abandoned apps/api
 * reference implementation for what that looked like).
 * Idempotent — re-running updates existing rows by (lowercased) name instead
 * of duplicating, same convention as scripts/seed-coupons.ts.
 * Usage: npx tsx scripts/seed-pooja-catalog.ts
 */
import { db } from '../src/config/db.js';
import { poojaCatalog } from '../src/db/schema.js';
import { eq, sql } from 'drizzle-orm';

const SEED_POOJAS = [
  {
    name: 'Satyanarayan Pooja',
    description:
      'A traditional pooja performed for overall prosperity, harmony, and removing obstacles — suitable for anyone regardless of specific chart afflictions.',
    deity: 'Lord Vishnu',
    basePricePaise: 110000,
    durationMinutes: 90,
  },
  {
    name: 'Navgraha Shanti Pooja',
    description:
      'Propitiates all nine planetary deities together to support overall balance and ease the impact of any planetary weaknesses.',
    deity: 'The nine planets (Navagraha)',
    basePricePaise: 210000,
    durationMinutes: 120,
  },
  {
    name: 'Mangal Shanti Pooja',
    description:
      'Traditionally performed to pacify Mars and ease the effects associated with Mangal Dosha, particularly ahead of marriage.',
    deity: 'Lord Hanuman / Mangal (Mars)',
    basePricePaise: 150000,
    durationMinutes: 90,
  },
  {
    name: 'Kaal Sarp Dosha Nivaran Pooja',
    description:
      'Traditionally performed (often at a Shiva temple such as Trimbakeshwar) to ease the effects associated with Kaal Sarp Dosha.',
    deity: 'Lord Shiva',
    basePricePaise: 510000,
    durationMinutes: 180,
  },
  {
    name: 'Shani Shanti Pooja',
    description:
      "Traditionally performed during Sade Sati to seek Saturn's grace and ease the intensity of this transit period.",
    deity: 'Lord Shani (Saturn) / Hanuman',
    basePricePaise: 180000,
    durationMinutes: 90,
  },
  {
    name: 'Pitra Dosha Nivaran Pooja (Shraadh)',
    description:
      'Traditionally performed to honor ancestors and ease the effects associated with Pitra Dosha.',
    deity: 'Ancestors / Lord Vishnu',
    basePricePaise: 310000,
    durationMinutes: 120,
  },
  {
    name: 'Kemdruma Dosha Nivaran Pooja',
    description:
      'Traditionally performed to strengthen the Moon and ease the effects associated with Kemdruma Dosha.',
    deity: 'Chandra (Moon)',
    basePricePaise: 150000,
    durationMinutes: 90,
  },
  {
    name: 'Grahan Dosha Nivaran Pooja',
    description:
      'Traditionally performed to ease the effects associated with Grahan (eclipse) Dosha.',
    deity: 'Sun/Moon and Rahu-Ketu',
    basePricePaise: 180000,
    durationMinutes: 90,
  },
  {
    name: 'Guru Chandal Dosha Nivaran Pooja',
    description:
      'Traditionally performed to strengthen Jupiter and ease the effects associated with Guru Chandal Dosha.',
    deity: 'Lord Brihaspati (Jupiter)',
    basePricePaise: 180000,
    durationMinutes: 90,
  },
] as const;

async function main() {
  for (const p of SEED_POOJAS) {
    const [existing] = await db
      .select({ id: poojaCatalog.id })
      .from(poojaCatalog)
      .where(sql`lower(${poojaCatalog.name}) = lower(${p.name})`)
      .limit(1);

    if (existing) {
      await db
        .update(poojaCatalog)
        .set({
          description: p.description,
          deity: p.deity,
          basePricePaise: p.basePricePaise,
          durationMinutes: p.durationMinutes,
          isActive: true,
        })
        .where(eq(poojaCatalog.id, existing.id));
      console.log(`Updated pooja ${p.name}`);
    } else {
      await db.insert(poojaCatalog).values(p);
      console.log(`Inserted pooja ${p.name}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
