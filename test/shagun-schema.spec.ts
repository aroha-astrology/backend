import { describe, expect, it } from 'vitest';
import { shagunClickEvents, shagunProductCategoryEnum, shagunProducts } from '../src/db/schema.js';

describe('shagunProductCategoryEnum', () => {
  it("matches productDetect.ts's ProductCategory taxonomy, plus gift-set", () => {
    expect(shagunProductCategoryEnum.enumValues).toEqual([
      'gemstone',
      'rudraksha',
      'yantra',
      'mala',
      'idol',
      'puja-item',
      'gift-set',
    ]);
  });
});

describe('shagunProducts table', () => {
  it('defines every column the catalog needs', () => {
    expect(shagunProducts.id).toBeDefined();
    expect(shagunProducts.category).toBeDefined();
    expect(shagunProducts.name).toBeDefined();
    expect(shagunProducts.description).toBeDefined();
    expect(shagunProducts.imageUrl).toBeDefined();
    expect(shagunProducts.priceRangeText).toBeDefined();
    expect(shagunProducts.affiliateUrl).toBeDefined();
    expect(shagunProducts.isActive).toBeDefined();
    expect(shagunProducts.sortOrder).toBeDefined();
    expect(shagunProducts.createdAt).toBeDefined();
    expect(shagunProducts.updatedAt).toBeDefined();
  });
});

describe('shagunClickEvents table', () => {
  it('defines every column the click log needs', () => {
    expect(shagunClickEvents.id).toBeDefined();
    expect(shagunClickEvents.productId).toBeDefined();
    expect(shagunClickEvents.userId).toBeDefined();
    expect(shagunClickEvents.clickedAt).toBeDefined();
  });
});
