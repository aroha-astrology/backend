import { describe, expect, it } from 'vitest';
import {
  ShagunProductCategorySchema,
  ShagunProductIdParamSchema,
  ShagunProductListQuerySchema,
  ShagunProductSchema,
} from '../src/modules/shagun/shagun.schemas.js';

describe('ShagunProductCategorySchema', () => {
  it('accepts every category in the taxonomy', () => {
    for (const category of [
      'gemstone',
      'rudraksha',
      'yantra',
      'mala',
      'idol',
      'puja-item',
      'gift-set',
    ]) {
      expect(() => ShagunProductCategorySchema.parse(category)).not.toThrow();
    }
  });

  it('rejects an unknown category', () => {
    expect(() => ShagunProductCategorySchema.parse('crystal-ball')).toThrow();
  });
});

describe('ShagunProductListQuerySchema', () => {
  it('allows an omitted category', () => {
    const parsed = ShagunProductListQuerySchema.parse({});
    expect(parsed.category).toBeUndefined();
  });

  it('accepts a valid category', () => {
    const parsed = ShagunProductListQuerySchema.parse({ category: 'yantra' });
    expect(parsed.category).toBe('yantra');
  });

  it('rejects an invalid category', () => {
    expect(() => ShagunProductListQuerySchema.parse({ category: 'nope' })).toThrow();
  });
});

describe('ShagunProductIdParamSchema', () => {
  it('accepts a valid UUID', () => {
    expect(() =>
      ShagunProductIdParamSchema.parse({ id: '11111111-1111-1111-1111-111111111111' }),
    ).not.toThrow();
  });

  it('rejects a non-UUID id', () => {
    expect(() => ShagunProductIdParamSchema.parse({ id: 'not-a-uuid' })).toThrow();
  });
});

describe('ShagunProductSchema', () => {
  it('parses a full product DTO', () => {
    const dto = {
      id: '11111111-1111-1111-1111-111111111111',
      category: 'idol' as const,
      name: 'Ganesha Idol (Brass)',
      description: 'Handcrafted brass Ganesha idol.',
      imageUrl: 'https://images.example.com/ganesha.jpg',
      priceRangeText: '₹1,200–₹4,500',
      sortOrder: 0,
    };
    expect(() => ShagunProductSchema.parse(dto)).not.toThrow();
  });

  it('rejects a DTO missing required fields', () => {
    expect(() =>
      ShagunProductSchema.parse({ id: '11111111-1111-1111-1111-111111111111' }),
    ).toThrow();
  });
});
