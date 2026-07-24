/**
 * Seeds the curated Shagun affiliate product catalog. Idempotent —
 * re-running updates existing rows (matched by product name) instead of
 * duplicating. The `affiliateUrl` values below are placeholders — replace
 * them with real negotiated affiliate/commission links before seeding a
 * production database. In particular, every `tag=arohaastrology-21` below is
 * a PLACEHOLDER Amazon Associates tracking ID — before seeding production,
 * sign up for a real Amazon Associates account (free, instant — no
 * qualifying-sales requirement for a basic tracking ID/tag; that requirement
 * only gates PA-API programmatic access, which this feature deliberately
 * does not use, see "Before you start") and swap in the real tag. There is
 * no admin UI for this catalog (out of scope for this feature) — edit this
 * file and re-run to change the catalog.
 * Usage: npx tsx scripts/seed-shagun-products.ts
 */
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from '../src/config/db.js';
import { shagunProducts, type NewShagunProductRow } from '../src/db/schema.js';

export const SEED_SHAGUN_PRODUCTS: NewShagunProductRow[] = [
  {
    category: 'gemstone',
    name: 'Yellow Sapphire (Pukhraj)',
    description:
      'Certified natural Pukhraj for Jupiter (Guru) strength — career, wisdom, marriage.',
    imageUrl: 'https://images.example.com/shagun/yellow-sapphire.jpg',
    priceRangeText: '₹5,000–₹18,000',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-PUKHRAJ?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 0,
  },
  {
    category: 'gemstone',
    name: 'Blue Sapphire (Neelam)',
    description:
      'Certified natural Neelam for Saturn (Shani) — wear only after astrological confirmation.',
    imageUrl: 'https://images.example.com/shagun/blue-sapphire.jpg',
    priceRangeText: '₹8,000–₹25,000',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-NEELAM?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 1,
  },
  {
    category: 'rudraksha',
    name: '5-Mukhi Rudraksha Mala (108 Beads)',
    description: 'Original certified 5-Mukhi rudraksha mala for Jupiter — calm and focus.',
    imageUrl: 'https://images.example.com/shagun/5-mukhi-mala.jpg',
    priceRangeText: '₹800–₹2,500',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-5MUKHI?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 2,
  },
  {
    category: 'yantra',
    name: 'Shri Yantra (Brass, 3-inch)',
    description: 'Hand-engraved brass Shri Yantra for prosperity and abundance.',
    imageUrl: 'https://images.example.com/shagun/shri-yantra.jpg',
    priceRangeText: '₹600–₹2,000',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-SHRIYANTRA?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 3,
  },
  {
    category: 'yantra',
    name: 'Kuber Yantra (Brass)',
    description: 'Brass Kuber Yantra for wealth and financial stability.',
    imageUrl: 'https://images.example.com/shagun/kuber-yantra.jpg',
    priceRangeText: '₹500–₹1,800',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-KUBERYANTRA?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 4,
  },
  {
    category: 'mala',
    name: 'Tulsi Mala (108 Beads)',
    description: 'Original Tulsi wood mala for japa and daily wear.',
    imageUrl: 'https://images.example.com/shagun/tulsi-mala.jpg',
    priceRangeText: '₹300–₹900',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-TULSIMALA?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 5,
  },
  {
    category: 'idol',
    name: 'Ganesha Idol (Brass)',
    description: 'Handcrafted brass Ganesha idol for the home altar or gifting.',
    imageUrl: 'https://images.example.com/shagun/ganesha-idol.jpg',
    priceRangeText: '₹1,200–₹4,500',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-GANESHAIDOL?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 6,
  },
  {
    category: 'puja-item',
    name: 'Copper Kalash (Puja Set)',
    description: 'Traditional copper kalash for daily and festival puja.',
    imageUrl: 'https://images.example.com/shagun/copper-kalash.jpg',
    priceRangeText: '₹700–₹2,200',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-KALASH?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 7,
  },
  {
    category: 'gift-set',
    name: 'Ganesh-Lakshmi Diwali Puja Gift Set',
    description: 'Idol pair, diya, and incense in a gift-ready box for Diwali shagun.',
    imageUrl: 'https://images.example.com/shagun/diwali-gift-set.jpg',
    priceRangeText: '₹1,500–₹4,000',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-DIWALISET?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 8,
  },
  {
    category: 'gift-set',
    name: 'Griha Pravesh Shagun Gift Hamper',
    description: 'Curated housewarming hamper — coconut, kalash, toran, and sweets box.',
    imageUrl: 'https://images.example.com/shagun/griha-pravesh-hamper.jpg',
    priceRangeText: '₹1,800–₹5,000',
    affiliateUrl: 'https://www.amazon.in/dp/EXAMPLE-GRIHAPRAVESH?tag=arohaastrology-21',
    isActive: true,
    sortOrder: 9,
  },
];

async function main() {
  for (const p of SEED_SHAGUN_PRODUCTS) {
    const [existing] = await db
      .select({ id: shagunProducts.id })
      .from(shagunProducts)
      .where(eq(shagunProducts.name, p.name))
      .limit(1);

    if (existing) {
      await db
        .update(shagunProducts)
        .set({
          category: p.category,
          description: p.description,
          imageUrl: p.imageUrl,
          priceRangeText: p.priceRangeText,
          affiliateUrl: p.affiliateUrl,
          isActive: p.isActive,
          sortOrder: p.sortOrder,
          updatedAt: new Date(),
        })
        .where(eq(shagunProducts.id, existing.id));
      console.log(`Updated shagun product "${p.name}"`);
    } else {
      await db.insert(shagunProducts).values(p);
      console.log(`Inserted shagun product "${p.name}"`);
    }
  }
}

// Guards against running `main()` as a side effect of importing this module
// (e.g. test/seed-shagun-products.spec.ts imports SEED_SHAGUN_PRODUCTS) —
// only runs when this file is executed directly via `npx tsx`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
