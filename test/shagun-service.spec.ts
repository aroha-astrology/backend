import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  listActiveShagunProducts: vi.fn(),
  findActiveShagunProductById: vi.fn(),
  insertShagunClickEvent: vi.fn(),
}));

vi.mock('../src/modules/shagun/shagun.repo.js', () => ({
  listActiveShagunProducts: state.listActiveShagunProducts,
  findActiveShagunProductById: state.findActiveShagunProductById,
  insertShagunClickEvent: state.insertShagunClickEvent,
}));

import {
  listShagunProducts,
  recordShagunClickAndGetRedirectUrl,
  toShagunProductDto,
} from '../src/modules/shagun/shagun.service.js';

beforeEach(() => {
  state.listActiveShagunProducts.mockReset();
  state.findActiveShagunProductById.mockReset();
  state.insertShagunClickEvent.mockReset();
});

describe('toShagunProductDto', () => {
  it('maps a product row to its public DTO, omitting affiliateUrl', () => {
    const row = {
      id: 'p1',
      category: 'gemstone' as const,
      name: 'Yellow Sapphire (Pukhraj)',
      description: 'For Jupiter strength.',
      imageUrl: 'https://example.com/pukhraj.jpg',
      priceRangeText: '₹5000–15000',
      affiliateUrl: 'https://affiliate.example.com/pukhraj?ref=aroha',
      isActive: true,
      sortOrder: 1,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    };

    const dto = toShagunProductDto(row);

    expect(dto).toEqual({
      id: 'p1',
      category: 'gemstone',
      name: 'Yellow Sapphire (Pukhraj)',
      description: 'For Jupiter strength.',
      imageUrl: 'https://example.com/pukhraj.jpg',
      priceRangeText: '₹5000–15000',
      sortOrder: 1,
    });
    expect(dto).not.toHaveProperty('affiliateUrl');
  });
});

describe('listShagunProducts', () => {
  it('delegates to the repo with the given category and maps rows to DTOs', async () => {
    state.listActiveShagunProducts.mockResolvedValueOnce([
      {
        id: 'p1',
        category: 'gemstone',
        name: 'Yellow Sapphire',
        description: null,
        imageUrl: null,
        priceRangeText: null,
        affiliateUrl: 'https://affiliate.example.com/p1',
        isActive: true,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const result = await listShagunProducts('gemstone');

    expect(state.listActiveShagunProducts).toHaveBeenCalledWith('gemstone');
    expect(result).toEqual([
      {
        id: 'p1',
        category: 'gemstone',
        name: 'Yellow Sapphire',
        description: null,
        imageUrl: null,
        priceRangeText: null,
        sortOrder: 0,
      },
    ]);
  });

  it('passes undefined through when no category filter is given', async () => {
    state.listActiveShagunProducts.mockResolvedValueOnce([]);

    await listShagunProducts(undefined);

    expect(state.listActiveShagunProducts).toHaveBeenCalledWith(undefined);
  });
});

describe('recordShagunClickAndGetRedirectUrl', () => {
  it('logs the click and returns the affiliate URL when the product is active', async () => {
    state.findActiveShagunProductById.mockResolvedValueOnce({
      id: 'p1',
      affiliateUrl: 'https://affiliate.example.com/p1?ref=aroha',
    });

    const url = await recordShagunClickAndGetRedirectUrl('p1', 'user-1');

    expect(url).toBe('https://affiliate.example.com/p1?ref=aroha');
    expect(state.insertShagunClickEvent).toHaveBeenCalledWith('p1', 'user-1');
  });

  it('throws a NOT_FOUND error without logging a click when the product does not exist or is inactive', async () => {
    state.findActiveShagunProductById.mockResolvedValueOnce(undefined);

    await expect(recordShagunClickAndGetRedirectUrl('missing', 'user-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(state.insertShagunClickEvent).not.toHaveBeenCalled();
  });
});
