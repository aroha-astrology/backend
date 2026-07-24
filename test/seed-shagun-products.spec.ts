import { describe, expect, it } from 'vitest';
import { SEED_SHAGUN_PRODUCTS } from '../scripts/seed-shagun-products.js';

const ALL_CATEGORIES = [
  'gemstone',
  'rudraksha',
  'yantra',
  'mala',
  'idol',
  'puja-item',
  'gift-set',
] as const;

describe('SEED_SHAGUN_PRODUCTS', () => {
  it('covers every product category at least once', () => {
    const seenCategories = new Set(SEED_SHAGUN_PRODUCTS.map((p) => p.category));
    for (const category of ALL_CATEGORIES) {
      expect(seenCategories.has(category)).toBe(true);
    }
  });

  it('has no duplicate product names', () => {
    const names = SEED_SHAGUN_PRODUCTS.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every product a unique, ascending sortOrder starting at 0', () => {
    // `?? 0` only narrows the type for strict TS (Drizzle's inferred insert
    // type marks `sortOrder` optional because the column has a DB default) —
    // every seed product sets it explicitly, so the fallback is never hit.
    const sortOrders = SEED_SHAGUN_PRODUCTS.map((p) => p.sortOrder ?? 0).sort((a, b) => a - b);
    expect(sortOrders).toEqual(SEED_SHAGUN_PRODUCTS.map((_, i) => i));
  });

  it('gives every product an https affiliateUrl', () => {
    for (const product of SEED_SHAGUN_PRODUCTS) {
      expect(product.affiliateUrl.startsWith('https://')).toBe(true);
    }
  });

  it('marks every seed product active', () => {
    for (const product of SEED_SHAGUN_PRODUCTS) {
      expect(product.isActive).toBe(true);
    }
  });
});
