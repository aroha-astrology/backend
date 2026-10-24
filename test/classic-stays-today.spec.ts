import { beforeEach, describe, expect, it, vi } from 'vitest';

// The owner's rule (2026-10-24): the Indian look stays exactly as it is today. Every new v7 switch is
// foreign-only until the owner opens it to Indian users (or to everyone) on Admin -> Features, and
// the "choose your look" picker is never shown to someone who is Indian by their account.

const state = vi.hoisted(() => ({
  findAllFeatureOverrides: vi.fn(),
  findUserSkin: vi.fn(),
  findUserIsIndian: vi.fn(),
  listGroupIdsForUser: vi.fn(),
  listAllGroupFeatureOverrides: vi.fn(),
}));

vi.mock('../src/modules/features/features.repo.js', () => ({
  findAllFeatureOverrides: state.findAllFeatureOverrides,
  findUserSkin: state.findUserSkin,
  findUserIsIndian: state.findUserIsIndian,
}));
vi.mock('../src/modules/user-groups/user-groups.repo.js', () => ({
  listGroupIdsForUser: state.listGroupIdsForUser,
  listAllGroupFeatureOverrides: state.listAllGroupFeatureOverrides,
}));
vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { FEATURE_REGISTRY } from '../src/config/features.js';
import {
  invalidateExperienceCache,
  invalidateFeatureCache,
  invalidateGroupOverrideCache,
  resolveFeaturesForUser,
} from '../src/modules/features/features.service.js';

/** Every v7 switch: new, off by default, and not an amount-only price key. */
const V7_PREFIX = /^(money|experience|nav\.(pills|shortMenu|coachMarks)|live|ritual|circles|hooks|home\.timeMorph|memory|chat\.personas|community|lang)/;
const V7_SWITCHES = FEATURE_REGISTRY.filter((f) => V7_PREFIX.test(f.key) && f.tag === 'new');

const row = (key: string, audience: 'all' | 'classic' | 'cosmic' | null = null) => ({
  key,
  enabled: true,
  pricePaise: null,
  originalPricePaise: null,
  model: null,
  audience,
  enabledAt: null,
  updatedAt: new Date(),
  updatedBy: 'admin',
});

beforeEach(() => {
  state.findAllFeatureOverrides.mockReset().mockResolvedValue(V7_SWITCHES.map((f) => row(f.key)));
  state.findUserSkin.mockReset().mockResolvedValue(null);
  state.findUserIsIndian.mockReset().mockResolvedValue(false);
  state.listGroupIdsForUser.mockReset().mockResolvedValue([]);
  state.listAllGroupFeatureOverrides.mockReset().mockResolvedValue([]);
  invalidateFeatureCache();
  invalidateGroupOverrideCache();
  invalidateExperienceCache('u1');
});

describe('the registry', () => {
  it('finds all the v7 switches', () => {
    expect(V7_SWITCHES.length).toBeGreaterThanOrEqual(44);
  });

  it('every v7 switch is foreign-only by default, except the picker which is open to everyone', () => {
    for (const f of V7_SWITCHES) {
      const expected = f.key === 'experience.picker' ? undefined : 'cosmic';
      expect(f.defaultAudience, f.key).toBe(expected);
      expect(f.defaultEnabled, f.key).toBe(false);
    }
  });
});

describe('an Indian-look user with every v7 switch turned on', () => {
  it('sees none of them: not one new feature, not the picker', async () => {
    state.findUserSkin.mockResolvedValue('CLASSIC_VEDIC');
    const features = await resolveFeaturesForUser('u1');
    const leaked = V7_SWITCHES.filter((f) => features[f.key]?.enabled).map((f) => f.key);
    // the picker is on for the Classic user (only the Indian-account rule can hide it)
    expect(leaked.filter((k) => k !== 'experience.picker')).toEqual([]);
  });

  it('is never offered the picker when the account is Indian (Indian phone or Indian language) and no look is picked', async () => {
    state.findUserSkin.mockResolvedValue(null);
    state.findUserIsIndian.mockResolvedValue(true);
    const features = await resolveFeaturesForUser('u1');
    expect(features['experience.picker']?.enabled).toBe(false);
    expect(V7_SWITCHES.filter((f) => features[f.key]?.enabled)).toEqual([]);
  });

  it('gets a feature once the owner opens it to the Indian look, and only that one', async () => {
    state.findAllFeatureOverrides.mockResolvedValue(
      V7_SWITCHES.map((f) => row(f.key, f.key === 'ritual.morning' ? 'all' : null)),
    );
    state.findUserSkin.mockResolvedValue(null);
    state.findUserIsIndian.mockResolvedValue(true);
    const features = await resolveFeaturesForUser('u1');
    expect(V7_SWITCHES.filter((f) => features[f.key]?.enabled).map((f) => f.key)).toEqual(['ritual.morning']);
  });
});

describe('a foreign user', () => {
  it('who has not picked yet is offered the picker and nothing else new', async () => {
    state.findUserSkin.mockResolvedValue(null);
    state.findUserIsIndian.mockResolvedValue(false);
    const features = await resolveFeaturesForUser('u1');
    expect(V7_SWITCHES.filter((f) => features[f.key]?.enabled).map((f) => f.key)).toEqual(['experience.picker']);
  });

  it('who picked Modern Cosmic sees every switch that is on', async () => {
    state.findUserSkin.mockResolvedValue('MODERN_COSMIC');
    const features = await resolveFeaturesForUser('u1');
    expect(V7_SWITCHES.filter((f) => !features[f.key]?.enabled)).toEqual([]);
  });
});

describe('someone in an admin test group', () => {
  it('still gets the picker from an Indian account, so the owner can try it', async () => {
    state.findUserIsIndian.mockResolvedValue(true);
    state.listGroupIdsForUser.mockResolvedValue(['g1']);
    state.listAllGroupFeatureOverrides.mockResolvedValue([{ groupId: 'g1', featureKey: 'experience.picker', enabled: true }]);
    const features = await resolveFeaturesForUser('u1');
    expect(features['experience.picker']?.enabled).toBe(true);
  });
});
