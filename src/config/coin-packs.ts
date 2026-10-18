/**
 * The Aroha Coin packs (v7 spec, switch `money.coinPacks`). 1 coin = ₹1 = 100 paise, so a pack that
 * gives 330 coins credits 33,000 paise whatever the buyer paid in. The `id`s MUST match one-time
 * product ids set up in Google Play Console (the owner creates them); Play shows each buyer its
 * own local price, so `prices` here is what the WEBSITE charges through Razorpay and what the app
 * shows before opening the Play sheet.
 *
 * Prices are in the minor unit of each currency (paise, cents, pence).
 */

export type CoinCurrency = 'INR' | 'USD' | 'EUR' | 'GBP';
export const COIN_CURRENCIES: readonly CoinCurrency[] = ['INR', 'USD', 'EUR', 'GBP'];

export interface CoinPack {
  id: string;
  name: string;
  /** Coins that were paid for. */
  purchasedCoins: number;
  /** Coins on top, shown as a separate "Bonus" row in the wallet history. */
  bonusCoins: number;
  prices: Record<CoinCurrency, number>;
  popular?: boolean;
}

export const COIN_PACKS: readonly CoinPack[] = [
  {
    id: 'coins_100',
    name: 'Starter Pack',
    purchasedCoins: 100,
    bonusCoins: 0,
    prices: { INR: 9900, USD: 199, EUR: 199, GBP: 179 },
  },
  {
    id: 'coins_330',
    name: 'Popular Pack',
    purchasedCoins: 300,
    bonusCoins: 30,
    prices: { INR: 29900, USD: 499, EUR: 499, GBP: 449 },
    popular: true,
  },
  {
    id: 'coins_700',
    name: 'Seeker Pack',
    purchasedCoins: 600,
    bonusCoins: 100,
    prices: { INR: 59900, USD: 999, EUR: 999, GBP: 899 },
  },
  {
    id: 'coins_1800',
    name: 'Royal Vault',
    purchasedCoins: 1500,
    bonusCoins: 300,
    prices: { INR: 149900, USD: 1999, EUR: 1999, GBP: 1799 },
  },
];

export function coinPackById(id: string): CoinPack | undefined {
  return COIN_PACKS.find((p) => p.id === id);
}

/** Paise a pack puts in the wallet (coins x 100), the same in every currency. */
export function coinPackCreditPaise(pack: CoinPack): { purchased: number; bonus: number } {
  return { purchased: pack.purchasedCoins * 100, bonus: pack.bonusCoins * 100 };
}

export function isCoinCurrency(value: string | null | undefined): value is CoinCurrency {
  return COIN_CURRENCIES.includes(value as CoinCurrency);
}

const EURO_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', 'BE', 'BG', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV',
  'MT', 'NL', 'PT', 'SI', 'SK',
]);

/**
 * The currency to quote a buyer in, from their country: India rupees, the UK pounds, the euro area
 * euros, everywhere else US dollars. An unknown country is treated as India, which is what every
 * account before this offer was.
 */
export function currencyForCountry(country: string | null | undefined): CoinCurrency {
  const cc = country?.trim().toUpperCase();
  if (!cc || cc === 'IN') return 'INR';
  if (cc === 'GB' || cc === 'UK') return 'GBP';
  if (EURO_COUNTRIES.has(cc)) return 'EUR';
  return 'USD';
}

const SYMBOLS: Record<CoinCurrency, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };

/** "₹99", "$1.99", "€4.99", "£8.99": whole rupees without decimals, the rest with two. */
export function formatPackPrice(minor: number, currency: CoinCurrency): string {
  const major = minor / 100;
  return `${SYMBOLS[currency]}${currency === 'INR' ? major.toFixed(0) : major.toFixed(2)}`;
}
