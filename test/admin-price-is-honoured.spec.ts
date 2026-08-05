/**
 * The guard for a whole bug class, not a single bug.
 *
 * Background: every paid feature's price is admin-settable at runtime
 * (`feature_flags.price_paise`, edited from the admin Features board). The
 * frontend has always quoted that resolved price — `useFeature(key).pricePaise`
 * — but for a long time several BACKEND charge sites debited a module-level
 * constant instead. The result was a live billing defect where the app showed
 * one price and took another: house insight was advertised at ₹25 and billed
 * ₹50, profile creation advertised ₹99 and billed ₹200. Chat had the identical
 * bug and was fixed in isolation (f77b48c) without anyone noticing the siblings.
 *
 * These tests exist so the next person who adds a priced feature cannot
 * reintroduce it silently:
 *
 *  1. `priceOf`/`payoutOf` genuinely prefer the admin override over the
 *     registry default, and fall back safely when there is no override.
 *  2. Every registry key that declares a money amount is actually reachable
 *     through that resolution path — a new key wired to a constant will show up
 *     here as an unlisted key rather than as a production overcharge.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const state = vi.hoisted(() => ({
  overrides: [] as { key: string; enabled: boolean; pricePaise: number | null }[],
}));

vi.mock('../src/modules/features/features.repo.js', () => ({
  findAllFeatureOverrides: vi.fn(() =>
    Promise.resolve(state.overrides.map((o) => ({ ...o, originalPricePaise: null }))),
  ),
}));

// No user_groups tables in every environment (they are absent in production —
// the lookup throws and the service degrades to the global result). Model that
// same shape here so the tests exercise the real fallback path.
vi.mock('../src/modules/user-groups/user-groups.repo.js', () => ({
  listGroupIdsForUser: vi.fn(() => {
    throw new Error('relation "user_groups" does not exist');
  }),
  listAllGroupFeatureOverrides: vi.fn(() => Promise.resolve([])),
}));

vi.mock('../src/config/db.js', () => {
  const sqlClient: any = (..._args: unknown[]) => Promise.resolve([]);
  sqlClient.end = vi.fn().mockResolvedValue(undefined);
  return { db: {}, sqlClient };
});

vi.mock('../src/lib/logger.js', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { FEATURE_REGISTRY } from '../src/config/features.js';
import {
  priceOf,
  payoutOf,
  invalidateFeatureCache,
} from '../src/modules/features/features.service.js';

const USER = 'user-1';
const NONSENSE_FALLBACK = 123456;

beforeEach(() => {
  state.overrides = [];
  invalidateFeatureCache();
});

/** Every key the admin can attach a money amount to. */
const PRICED_KEYS = FEATURE_REGISTRY.filter((f) => f.defaultPricePaise !== undefined);

describe('priceOf', () => {
  it('prefers the admin-set override over the registry default', async () => {
    state.overrides = [{ key: 'paid.houseInsight', enabled: true, pricePaise: 2500 }];
    // The registry default is 5000; the admin says 2500. The admin wins — this
    // exact disagreement is what billed users double for 21 house unlocks.
    expect(await priceOf(USER, 'paid.houseInsight', NONSENSE_FALLBACK)).toBe(2500);
  });

  it('uses the registry default when there is no override row', async () => {
    const registryDefault = FEATURE_REGISTRY.find(
      (f) => f.key === 'paid.gemstone',
    )?.defaultPricePaise;
    expect(await priceOf(USER, 'paid.gemstone', NONSENSE_FALLBACK)).toBe(registryDefault);
  });

  it('falls back only for a key that has no price anywhere', async () => {
    expect(await priceOf(USER, 'nav.home', NONSENSE_FALLBACK)).toBe(NONSENSE_FALLBACK);
  });

  it('reflects a price change without a redeploy once the cache is invalidated', async () => {
    state.overrides = [{ key: 'paid.vastu', enabled: true, pricePaise: 9900 }];
    expect(await priceOf(USER, 'paid.vastu', NONSENSE_FALLBACK)).toBe(9900);

    state.overrides = [{ key: 'paid.vastu', enabled: true, pricePaise: 4900 }];
    invalidateFeatureCache();
    expect(await priceOf(USER, 'paid.vastu', NONSENSE_FALLBACK)).toBe(4900);
  });
});

describe('payoutOf', () => {
  it('pays the admin-set amount when enabled', async () => {
    state.overrides = [{ key: 'referral.referrerBonus', enabled: true, pricePaise: 15000 }];
    expect(await payoutOf(USER, 'referral.referrerBonus', NONSENSE_FALLBACK)).toBe(15000);
  });

  it('pays nothing when the feature is switched off', async () => {
    // Turning a referral bonus off in the admin panel must stop the payout, not
    // merely hide a button — otherwise money keeps moving after it is disabled.
    state.overrides = [{ key: 'referral.refereeBonus', enabled: false, pricePaise: 5000 }];
    expect(await payoutOf(USER, 'referral.refereeBonus', NONSENSE_FALLBACK)).toBe(0);
  });
});

describe('every priced feature resolves through the admin price', () => {
  it('has at least the known paid/report/referral families registered', () => {
    const keys = PRICED_KEYS.map((f) => f.key);
    expect(keys).toContain('paid.chat');
    expect(keys).toContain('paid.houseInsight');
    expect(keys).toContain('paid.gemstone');
    expect(keys).toContain('paid.vastu');
    expect(keys).toContain('paid.profileCreation');
    expect(keys).toContain('referral.referrerBonus');
    expect(keys).toContain('referral.refereeBonus');
    expect(keys).toContain('referral.feedbackReward');
  });

  it.each(PRICED_KEYS.map((f) => f.key))(
    '%s honours an admin override rather than any built-in constant',
    async (key) => {
      const overridden = 4242;
      state.overrides = [{ key, enabled: true, pricePaise: overridden }];
      // `NONSENSE_FALLBACK` is deliberately not a plausible price: if a charge
      // site ever ignores this resolution and uses its own constant, the value
      // returned here stops matching what that site actually debits, and the
      // integration tests for that feature fail.
      expect(await priceOf(USER, key, NONSENSE_FALLBACK)).toBe(overridden);
    },
  );

  it('no priced key silently loses its amount when overrides are absent', async () => {
    for (const def of PRICED_KEYS) {
      const resolved = await priceOf(USER, def.key, NONSENSE_FALLBACK);
      expect(resolved).toBe(def.defaultPricePaise);
      expect(resolved).not.toBe(NONSENSE_FALLBACK);
    }
  });
});

/**
 * The resolution tests above prove `priceOf` behaves — they cannot prove a
 * given charge site actually CALLS it. That was the real shape of the original
 * defect: `priceOf`-equivalent logic existed and worked, while
 * `unlockHouseForUser` quietly debited its own `HOUSE_UNLOCK_COST_PAISE`.
 *
 * So this asserts the naming invariant that makes such a constant impossible to
 * introduce accidentally: a module-level paise constant may exist ONLY as a
 * declared fallback (`*_FALLBACK_PAISE`) or default (`DEFAULT_*_PAISE`). Anything
 * called `*_COST_PAISE` / `*_PRICE_PAISE` / `*_BONUS_PAISE` is, by construction,
 * a second source of truth competing with the admin panel — and fails here.
 */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('no charge site may hold its own price constant', () => {
  it('every module-level *_PAISE constant is named as a fallback or default', () => {
    const declaration =
      /^\s*(?:export\s+)?const\s+([A-Z0-9_]*PAISE)\s*(?::\s*number\s*)?=\s*[0-9_]+/gm;
    const offenders: string[] = [];

    for (const file of walk('src')) {
      const source = readFileSync(file, 'utf8');
      for (const [, name] of source.matchAll(declaration)) {
        const isFallback = name!.endsWith('_FALLBACK_PAISE') || name!.startsWith('DEFAULT_');
        if (!isFallback) offenders.push(`${file}: ${name}`);
      }
    }

    expect(
      offenders,
      'Money amounts belong in FEATURE_REGISTRY (config/features.ts) and must be read ' +
        'via priceOf()/payoutOf(). If this is genuinely a fail-open fallback, name it ' +
        '*_FALLBACK_PAISE so that intent is explicit at the call site.',
    ).toEqual([]);
  });
});
