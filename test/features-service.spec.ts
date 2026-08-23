import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  findAllFeatureOverrides: vi.fn(),
}));

vi.mock('../src/modules/features/features.repo.js', () => ({
  findAllFeatureOverrides: state.findAllFeatureOverrides,
}));

vi.mock('../src/lib/logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '../src/lib/logger.js';
import { FEATURE_REGISTRY } from '../src/config/features.js';
import {
  resolveFeatures,
  invalidateFeatureCache,
} from '../src/modules/features/features.service.js';

beforeEach(() => {
  state.findAllFeatureOverrides.mockReset();
  vi.mocked(logger.error).mockReset();
  invalidateFeatureCache();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('resolveFeatures — merge behavior', () => {
  it('falls back to the registry default for a key with no override row', async () => {
    state.findAllFeatureOverrides.mockResolvedValue([]);

    const resolved = await resolveFeatures();

    for (const feature of FEATURE_REGISTRY) {
      expect(resolved[feature.key]).toEqual({
        enabled: feature.defaultEnabled,
        pricePaise: feature.defaultPricePaise ?? null,
        originalPricePaise: null,
        // Only the `ai` model-picker keys carry a defaultModel, and a disabled key resolves
        // to null (= use the global GEMINI_MODEL) — see FeatureDef.modelOptions.
        model: feature.defaultEnabled ? (feature.defaultModel ?? null) : null,
      });
    }
  });

  it('lets a DB override win over the registry default', async () => {
    const target = FEATURE_REGISTRY.find((f) => f.defaultEnabled)!;
    state.findAllFeatureOverrides.mockResolvedValue([
      {
        key: target.key,
        enabled: false,
        pricePaise: 12345,
        originalPricePaise: 19999,
        updatedAt: new Date(),
        updatedBy: 'admin',
      },
    ]);

    const resolved = await resolveFeatures();

    expect(resolved[target.key]).toEqual({
      enabled: false,
      pricePaise: 12345,
      originalPricePaise: 19999,
      model: null,
    });
  });

  it('leaves every other key at its registry default when only one key is overridden', async () => {
    const [target, ...rest] = FEATURE_REGISTRY;
    state.findAllFeatureOverrides.mockResolvedValue([
      {
        key: target!.key,
        enabled: false,
        pricePaise: null,
        originalPricePaise: null,
        updatedAt: new Date(),
        updatedBy: 'admin',
      },
    ]);

    const resolved = await resolveFeatures();

    for (const feature of rest) {
      expect(resolved[feature.key]).toEqual({
        enabled: feature.defaultEnabled,
        pricePaise: feature.defaultPricePaise ?? null,
        originalPricePaise: null,
        // Only the `ai` model-picker keys carry a defaultModel, and a disabled key resolves
        // to null (= use the global GEMINI_MODEL) — see FeatureDef.modelOptions.
        model: feature.defaultEnabled ? (feature.defaultModel ?? null) : null,
      });
    }
  });

  it('surfaces a null originalPricePaise when the override row has no discount configured', async () => {
    const target = FEATURE_REGISTRY.find((f) => f.defaultEnabled)!;
    state.findAllFeatureOverrides.mockResolvedValue([
      {
        key: target.key,
        enabled: true,
        pricePaise: 5000,
        originalPricePaise: null,
        updatedAt: new Date(),
        updatedBy: 'admin',
      },
    ]);

    const resolved = await resolveFeatures();

    expect(resolved[target.key]!.originalPricePaise).toBeNull();
  });
});

describe('resolveFeatures — DB failure fallback', () => {
  it('never throws and falls back to registry defaults when the DB call rejects', async () => {
    state.findAllFeatureOverrides.mockRejectedValue(new Error('connection refused'));

    const resolved = await expect(resolveFeatures()).resolves.toBeDefined();
    const value = await resolveFeatures();

    for (const feature of FEATURE_REGISTRY) {
      expect(value[feature.key]).toEqual({
        enabled: feature.defaultEnabled,
        pricePaise: feature.defaultPricePaise ?? null,
        originalPricePaise: null,
        // Only the `ai` model-picker keys carry a defaultModel, and a disabled key resolves
        // to null (= use the global GEMINI_MODEL) — see FeatureDef.modelOptions.
        model: feature.defaultEnabled ? (feature.defaultModel ?? null) : null,
      });
    }
    expect(logger.error).toHaveBeenCalled();
    void resolved;
  });
});

describe('resolveFeatures — TTL cache', () => {
  it('serves the cached value for 30 seconds without re-querying the DB', async () => {
    vi.useFakeTimers();
    state.findAllFeatureOverrides.mockResolvedValue([]);

    await resolveFeatures();
    await resolveFeatures();
    await resolveFeatures();

    expect(state.findAllFeatureOverrides).toHaveBeenCalledTimes(1);
  });

  it('re-queries the DB once the TTL has elapsed', async () => {
    vi.useFakeTimers();
    state.findAllFeatureOverrides.mockResolvedValue([]);

    await resolveFeatures();
    vi.advanceTimersByTime(30_001);
    await resolveFeatures();

    expect(state.findAllFeatureOverrides).toHaveBeenCalledTimes(2);
  });

  it('does not cache a DB failure, so the very next call retries immediately', async () => {
    state.findAllFeatureOverrides.mockRejectedValueOnce(new Error('boom'));
    state.findAllFeatureOverrides.mockResolvedValueOnce([]);

    await resolveFeatures();
    await resolveFeatures();

    expect(state.findAllFeatureOverrides).toHaveBeenCalledTimes(2);
  });
});

describe('invalidateFeatureCache', () => {
  it('forces the next resolveFeatures() call to re-query the DB immediately', async () => {
    state.findAllFeatureOverrides.mockResolvedValue([]);

    await resolveFeatures();
    invalidateFeatureCache();
    await resolveFeatures();

    expect(state.findAllFeatureOverrides).toHaveBeenCalledTimes(2);
  });
});
