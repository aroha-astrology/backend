import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  findAllFeatureOverrides: vi.fn(),
  listGroupIdsForUser: vi.fn(),
  listAllGroupFeatureOverrides: vi.fn(),
}));

vi.mock('../src/modules/features/features.repo.js', () => ({
  findAllFeatureOverrides: state.findAllFeatureOverrides,
}));

vi.mock('../src/modules/user-groups/user-groups.repo.js', () => ({
  listGroupIdsForUser: state.listGroupIdsForUser,
  listAllGroupFeatureOverrides: state.listAllGroupFeatureOverrides,
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '../src/lib/logger.js';
import { FEATURE_REGISTRY } from '../src/config/features.js';
import {
  resolveFeatures,
  resolveFeaturesForUser,
  invalidateFeatureCache,
  invalidateGroupOverrideCache,
} from '../src/modules/features/features.service.js';

// A feature with a non-null default price, so "price is never touched" has
// something meaningful to assert against.
const PRICED_KEY = 'paid.chat';
const PRICED_DEFAULT = FEATURE_REGISTRY.find((f) => f.key === PRICED_KEY)!;

beforeEach(() => {
  state.findAllFeatureOverrides.mockReset().mockResolvedValue([]);
  state.listGroupIdsForUser.mockReset().mockResolvedValue([]);
  state.listAllGroupFeatureOverrides.mockReset().mockResolvedValue([]);
  vi.mocked(logger.error).mockReset();
  invalidateFeatureCache();
  invalidateGroupOverrideCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveFeaturesForUser — no groups', () => {
  it('falls through to the base resolveFeatures() result unchanged', async () => {
    state.listGroupIdsForUser.mockResolvedValue([]);

    const base = await resolveFeatures();
    const forUser = await resolveFeaturesForUser('user-1');

    expect(forUser).toEqual(base);
    expect(state.listAllGroupFeatureOverrides).not.toHaveBeenCalled();
  });
});

describe('resolveFeaturesForUser — single group override', () => {
  it('an "off" override disables a feature that is enabled by default', async () => {
    state.listGroupIdsForUser.mockResolvedValue(['group-beta']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: 'group-beta', featureKey: PRICED_KEY, enabled: false },
    ]);

    const resolved = await resolveFeaturesForUser('user-1');

    expect(resolved[PRICED_KEY]!.enabled).toBe(false);
  });

  it('an "on" override enables a feature the GLOBAL flag has disabled', async () => {
    state.findAllFeatureOverrides.mockResolvedValue([
      { key: PRICED_KEY, enabled: false, pricePaise: PRICED_DEFAULT.defaultPricePaise, updatedAt: new Date(), updatedBy: 'admin' },
    ]);
    state.listGroupIdsForUser.mockResolvedValue(['group-beta']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: 'group-beta', featureKey: PRICED_KEY, enabled: true },
    ]);

    const base = await resolveFeatures();
    expect(base[PRICED_KEY]!.enabled).toBe(false); // sanity: global flag really did disable it

    const resolved = await resolveFeaturesForUser('user-1');

    expect(resolved[PRICED_KEY]!.enabled).toBe(true);
  });

  it('leaves every other key untouched when only one key is overridden for the group', async () => {
    state.listGroupIdsForUser.mockResolvedValue(['group-beta']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: 'group-beta', featureKey: PRICED_KEY, enabled: false },
    ]);

    const base = await resolveFeatures();
    const resolved = await resolveFeaturesForUser('user-1');

    for (const feature of FEATURE_REGISTRY) {
      if (feature.key === PRICED_KEY) continue;
      expect(resolved[feature.key]).toEqual(base[feature.key]);
    }
  });
});

describe('resolveFeaturesForUser — multiple groups agreeing', () => {
  it('two groups both disabling the same key resolve to disabled', async () => {
    state.listGroupIdsForUser.mockResolvedValue(['group-a', 'group-b']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: 'group-a', featureKey: PRICED_KEY, enabled: false },
      { groupId: 'group-b', featureKey: PRICED_KEY, enabled: false },
    ]);

    const resolved = await resolveFeaturesForUser('user-1');

    expect(resolved[PRICED_KEY]!.enabled).toBe(false);
  });

  it('two groups both enabling the same (globally-disabled) key resolve to enabled', async () => {
    state.findAllFeatureOverrides.mockResolvedValue([
      { key: PRICED_KEY, enabled: false, pricePaise: PRICED_DEFAULT.defaultPricePaise, updatedAt: new Date(), updatedBy: 'admin' },
    ]);
    state.listGroupIdsForUser.mockResolvedValue(['group-a', 'group-b']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: 'group-a', featureKey: PRICED_KEY, enabled: true },
      { groupId: 'group-b', featureKey: PRICED_KEY, enabled: true },
    ]);

    const resolved = await resolveFeaturesForUser('user-1');

    expect(resolved[PRICED_KEY]!.enabled).toBe(true);
  });
});

describe('resolveFeaturesForUser — multiple groups conflicting: disabled wins, order-independent', () => {
  it('membership order [enabling-group, disabling-group] still resolves to disabled', async () => {
    state.listGroupIdsForUser.mockResolvedValue(['group-on', 'group-off']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: 'group-on', featureKey: PRICED_KEY, enabled: true },
      { groupId: 'group-off', featureKey: PRICED_KEY, enabled: false },
    ]);

    const resolved = await resolveFeaturesForUser('user-1');

    expect(resolved[PRICED_KEY]!.enabled).toBe(false);
  });

  it('membership order [disabling-group, enabling-group] (reversed) still resolves to disabled', async () => {
    state.listGroupIdsForUser.mockResolvedValue(['group-off', 'group-on']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: 'group-on', featureKey: PRICED_KEY, enabled: true },
      { groupId: 'group-off', featureKey: PRICED_KEY, enabled: false },
    ]);

    const resolved = await resolveFeaturesForUser('user-1');

    expect(resolved[PRICED_KEY]!.enabled).toBe(false);
  });

  it('is independent of the raw override row order too (disabling row listed first)', async () => {
    state.listGroupIdsForUser.mockResolvedValue(['group-on', 'group-off']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: 'group-off', featureKey: PRICED_KEY, enabled: false },
      { groupId: 'group-on', featureKey: PRICED_KEY, enabled: true },
    ]);

    const resolved = await resolveFeaturesForUser('user-1');

    expect(resolved[PRICED_KEY]!.enabled).toBe(false);
  });

  it('is independent of the raw override row order too (enabling row listed first)', async () => {
    state.listGroupIdsForUser.mockResolvedValue(['group-on', 'group-off']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: 'group-on', featureKey: PRICED_KEY, enabled: true },
      { groupId: 'group-off', featureKey: PRICED_KEY, enabled: false },
    ]);

    const resolved = await resolveFeaturesForUser('user-1');

    expect(resolved[PRICED_KEY]!.enabled).toBe(false);
  });
});

describe('resolveFeaturesForUser — price is never altered by a group override', () => {
  it('keeps the base (global) price even when a group override disables the feature', async () => {
    state.listGroupIdsForUser.mockResolvedValue(['group-beta']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: 'group-beta', featureKey: PRICED_KEY, enabled: false },
    ]);

    const resolved = await resolveFeaturesForUser('user-1');

    expect(resolved[PRICED_KEY]!.pricePaise).toBe(PRICED_DEFAULT.defaultPricePaise);
  });

  it('keeps the base (global override) price even when a group override enables the feature', async () => {
    state.findAllFeatureOverrides.mockResolvedValue([
      { key: PRICED_KEY, enabled: false, pricePaise: 999999, updatedAt: new Date(), updatedBy: 'admin' },
    ]);
    state.listGroupIdsForUser.mockResolvedValue(['group-beta']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: 'group-beta', featureKey: PRICED_KEY, enabled: true },
    ]);

    const resolved = await resolveFeaturesForUser('user-1');

    expect(resolved[PRICED_KEY]!.enabled).toBe(true);
    expect(resolved[PRICED_KEY]!.pricePaise).toBe(999999);
  });
});

describe('resolveFeaturesForUser — fail-safe on DB error', () => {
  it('never throws and falls back to the base result when listGroupIdsForUser rejects', async () => {
    state.listGroupIdsForUser.mockRejectedValue(new Error('connection refused'));

    const base = await resolveFeatures();
    const resolved = await expect(resolveFeaturesForUser('user-1')).resolves.toBeDefined();
    const value = await resolveFeaturesForUser('user-1');

    expect(value).toEqual(base);
    expect(logger.error).toHaveBeenCalled();
    void resolved;
  });

  it('never throws and falls back to the base result when listAllGroupFeatureOverrides rejects', async () => {
    state.listGroupIdsForUser.mockResolvedValue(['group-beta']);
    state.listAllGroupFeatureOverrides.mockRejectedValue(new Error('connection refused'));

    const base = await resolveFeatures();
    const value = await resolveFeaturesForUser('user-1');

    expect(value).toEqual(base);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('resolveFeaturesForUser — group-override cache', () => {
  it('serves the cached group-override set for 30s without re-querying the DB', async () => {
    vi.useFakeTimers();
    state.listGroupIdsForUser.mockResolvedValue(['group-beta']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([]);

    await resolveFeaturesForUser('user-1');
    await resolveFeaturesForUser('user-1');
    await resolveFeaturesForUser('user-2');

    expect(state.listAllGroupFeatureOverrides).toHaveBeenCalledTimes(1);
  });

  it('re-queries once the TTL has elapsed', async () => {
    vi.useFakeTimers();
    state.listGroupIdsForUser.mockResolvedValue(['group-beta']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([]);

    await resolveFeaturesForUser('user-1');
    vi.advanceTimersByTime(30_001);
    await resolveFeaturesForUser('user-1');

    expect(state.listAllGroupFeatureOverrides).toHaveBeenCalledTimes(2);
  });

  it('invalidateGroupOverrideCache forces the next call to re-query immediately', async () => {
    state.listGroupIdsForUser.mockResolvedValue(['group-beta']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([]);

    await resolveFeaturesForUser('user-1');
    invalidateGroupOverrideCache();
    await resolveFeaturesForUser('user-1');

    expect(state.listAllGroupFeatureOverrides).toHaveBeenCalledTimes(2);
  });
});
