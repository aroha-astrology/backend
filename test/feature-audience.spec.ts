import { beforeEach, describe, expect, it, vi } from 'vitest';

// A feature has an audience: 'all', 'classic' (the Indian look) or 'cosmic' (the international
// look). It is on for a user only when its switch is on AND the user's look matches. The owner
// sets it per feature on Admin -> Features; a feature switched on for one of the user's admin
// groups ignores the audience, so an international feature can be tried from a classic account.

const state = vi.hoisted(() => ({
  findAllFeatureOverrides: vi.fn(),
  findUserSkin: vi.fn(),
  listGroupIdsForUser: vi.fn(),
  listAllGroupFeatureOverrides: vi.fn(),
}));

vi.mock('../src/modules/features/features.repo.js', () => ({
  findAllFeatureOverrides: state.findAllFeatureOverrides,
  findUserSkin: state.findUserSkin,
}));
vi.mock('../src/modules/user-groups/user-groups.repo.js', () => ({
  listGroupIdsForUser: state.listGroupIdsForUser,
  listAllGroupFeatureOverrides: state.listAllGroupFeatureOverrides,
}));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  invalidateExperienceCache,
  invalidateFeatureCache,
  invalidateGroupOverrideCache,
  isFeatureOn,
  resolveFeatures,
  resolveFeaturesForUser,
} from '../src/modules/features/features.service.js';

// Any key that exists in the registry will do; audience is an override row here.
const KEY = 'nav.bonds';
const OTHER = 'nav.journal';

function overrideRow(key: string, enabled: boolean, audience: 'all' | 'classic' | 'cosmic' | null) {
  return {
    key,
    enabled,
    pricePaise: null,
    originalPricePaise: null,
    model: null,
    audience,
    enabledAt: null,
    updatedAt: new Date(),
    updatedBy: 'admin',
  };
}

beforeEach(() => {
  state.findAllFeatureOverrides.mockReset().mockResolvedValue([]);
  state.findUserSkin.mockReset().mockResolvedValue(null);
  state.listGroupIdsForUser.mockReset().mockResolvedValue([]);
  state.listAllGroupFeatureOverrides.mockReset().mockResolvedValue([]);
  invalidateFeatureCache();
  invalidateGroupOverrideCache();
  invalidateExperienceCache('u1');
});

describe('feature audience', () => {
  it('defaults to everyone, and an override can narrow it', async () => {
    expect((await resolveFeatures())[KEY]?.audience).toBe('all');
    state.findAllFeatureOverrides.mockResolvedValue([overrideRow(KEY, true, 'cosmic')]);
    invalidateFeatureCache();
    expect((await resolveFeatures())[KEY]?.audience).toBe('cosmic');
  });

  it('costs nothing for "all": the user\'s look is not even looked up', async () => {
    state.findAllFeatureOverrides.mockResolvedValue([overrideRow(KEY, true, 'all')]);
    const features = await resolveFeaturesForUser('u1');
    expect(features[KEY]?.enabled).toBe(true);
    expect(state.findUserSkin).not.toHaveBeenCalled();
  });

  it('a classic feature is on for the Indian look and off for the international look', async () => {
    state.findAllFeatureOverrides.mockResolvedValue([overrideRow(KEY, true, 'classic')]);

    state.findUserSkin.mockResolvedValue('CLASSIC_VEDIC');
    expect((await resolveFeaturesForUser('u1'))[KEY]?.enabled).toBe(true);

    invalidateExperienceCache('u1');
    state.findUserSkin.mockResolvedValue('MODERN_COSMIC');
    expect((await resolveFeaturesForUser('u1'))[KEY]?.enabled).toBe(false);
  });

  it('a cosmic feature is on only for the international look', async () => {
    state.findAllFeatureOverrides.mockResolvedValue([overrideRow(KEY, true, 'cosmic')]);

    state.findUserSkin.mockResolvedValue('MODERN_COSMIC');
    expect((await resolveFeaturesForUser('u1'))[KEY]?.enabled).toBe(true);

    invalidateExperienceCache('u1');
    state.findUserSkin.mockResolvedValue('CLASSIC_VEDIC');
    expect((await resolveFeaturesForUser('u1'))[KEY]?.enabled).toBe(false);
  });

  it('someone who has not picked a look yet counts as the Indian look (today\'s look)', async () => {
    state.findAllFeatureOverrides.mockResolvedValue([
      overrideRow(KEY, true, 'classic'),
      overrideRow(OTHER, true, 'cosmic'),
    ]);
    state.findUserSkin.mockResolvedValue(null);
    const features = await resolveFeaturesForUser('u1');
    expect(features[KEY]?.enabled).toBe(true);
    expect(features[OTHER]?.enabled).toBe(false);
  });

  it('a switched-off feature stays off whatever the audience', async () => {
    state.findAllFeatureOverrides.mockResolvedValue([overrideRow(KEY, false, 'classic')]);
    state.findUserSkin.mockResolvedValue('CLASSIC_VEDIC');
    expect((await resolveFeaturesForUser('u1'))[KEY]?.enabled).toBe(false);
  });

  it('a feature switched on for the user\'s admin group ignores the audience', async () => {
    state.findAllFeatureOverrides.mockResolvedValue([overrideRow(KEY, true, 'cosmic')]);
    state.findUserSkin.mockResolvedValue('CLASSIC_VEDIC');
    state.listGroupIdsForUser.mockResolvedValue(['g1']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: 'g1', featureKey: KEY, enabled: true, model: null },
    ]);
    expect((await resolveFeaturesForUser('u1'))[KEY]?.enabled).toBe(true);
  });

  it('a group that switches the feature off still wins over a matching audience', async () => {
    state.findAllFeatureOverrides.mockResolvedValue([overrideRow(KEY, true, 'classic')]);
    state.findUserSkin.mockResolvedValue('CLASSIC_VEDIC');
    state.listGroupIdsForUser.mockResolvedValue(['g1']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([
      { groupId: 'g1', featureKey: KEY, enabled: false, model: null },
    ]);
    expect((await resolveFeaturesForUser('u1'))[KEY]?.enabled).toBe(false);
  });

  it('if the look cannot be read the filter is skipped instead of breaking the user\'s features', async () => {
    state.findAllFeatureOverrides.mockResolvedValue([overrideRow(KEY, true, 'cosmic')]);
    state.findUserSkin.mockRejectedValue(new Error('db down'));
    expect((await resolveFeaturesForUser('u1'))[KEY]?.enabled).toBe(true);
  });

  it('isFeatureOn fails closed for a key that does not exist', async () => {
    expect(await isFeatureOn('u1', 'money.doesNotExist')).toBe(false);
  });
});
