import { describe, expect, it } from 'vitest';
import {
  COIN_CURRENCIES,
  COIN_PACKS,
  coinPackById,
  coinPackCreditPaise,
  currencyForCountry,
  formatPackPrice,
  isCoinCurrency,
} from '../src/config/coin-packs.js';

describe('coin packs', () => {
  it('are the four packs of the spec, in rupees, dollars, euros and pounds', () => {
    expect(COIN_PACKS.map((p) => [p.id, p.purchasedCoins + p.bonusCoins])).toEqual([
      ['coins_100', 100],
      ['coins_330', 330],
      ['coins_700', 700],
      ['coins_1800', 1800],
    ]);
    expect(COIN_PACKS.map((p) => p.prices.INR)).toEqual([9900, 29900, 59900, 149900]);
    expect(COIN_PACKS.map((p) => p.prices.USD)).toEqual([199, 499, 999, 1999]);
    expect(COIN_PACKS.map((p) => p.prices.EUR)).toEqual([199, 499, 999, 1999]);
    expect(COIN_PACKS.map((p) => p.prices.GBP)).toEqual([179, 449, 899, 1799]);
  });

  it('every pack has a price in every currency, and exactly one is marked popular', () => {
    for (const p of COIN_PACKS) for (const c of COIN_CURRENCIES) expect(p.prices[c], `${p.id} ${c}`).toBeGreaterThan(0);
    expect(COIN_PACKS.filter((p) => p.popular)).toHaveLength(1);
  });

  it('credit coins x 100 paise whatever currency was paid, split into paid and bonus', () => {
    expect(coinPackCreditPaise(coinPackById('coins_330')!)).toEqual({ purchased: 30000, bonus: 3000 });
    expect(coinPackCreditPaise(coinPackById('coins_100')!)).toEqual({ purchased: 10000, bonus: 0 });
  });

  it('an unknown id is not a pack', () => {
    expect(coinPackById('recharge_250')).toBeUndefined();
  });
});

describe('currencyForCountry', () => {
  it('quotes India in rupees, the UK in pounds, the euro area in euros, the rest in dollars', () => {
    expect(currencyForCountry('IN')).toBe('INR');
    expect(currencyForCountry('GB')).toBe('GBP');
    expect(currencyForCountry('de')).toBe('EUR');
    expect(currencyForCountry('FR')).toBe('EUR');
    expect(currencyForCountry('US')).toBe('USD');
    expect(currencyForCountry('AU')).toBe('USD');
    expect(currencyForCountry('JP')).toBe('USD');
  });

  it('treats an unknown country as India, as every account was before', () => {
    expect(currencyForCountry(null)).toBe('INR');
    expect(currencyForCountry(undefined)).toBe('INR');
    expect(currencyForCountry('')).toBe('INR');
  });
});

describe('formatPackPrice and isCoinCurrency', () => {
  it('writes whole rupees and two-decimal dollars, euros and pounds', () => {
    expect(formatPackPrice(9900, 'INR')).toBe('₹99');
    expect(formatPackPrice(149900, 'INR')).toBe('₹1499');
    expect(formatPackPrice(199, 'USD')).toBe('$1.99');
    expect(formatPackPrice(1999, 'EUR')).toBe('€19.99');
    expect(formatPackPrice(179, 'GBP')).toBe('£1.79');
  });

  it('only the four currencies count', () => {
    expect(isCoinCurrency('USD')).toBe(true);
    expect(isCoinCurrency('JPY')).toBe(false);
    expect(isCoinCurrency(null)).toBe(false);
  });
});
