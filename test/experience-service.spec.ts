import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/modules/experience/experience.repo.js', () => ({
  applyExperience: vi.fn(),
  readExperience: vi.fn(),
  resetExperienceCooldown: vi.fn(),
}));
vi.mock('../src/modules/features/features.service.js', () => ({
  invalidateExperienceCache: vi.fn(),
}));

import { applyExperience, readExperience, resetExperienceCooldown } from '../src/modules/experience/experience.repo.js';
import { invalidateExperienceCache } from '../src/modules/features/features.service.js';
import { getExperience, resetExperience, setExperience } from '../src/modules/experience/experience.service.js';

const NOW = new Date('2026-11-01T10:00:00Z');

beforeEach(() => vi.clearAllMocks());

describe('setExperience', () => {
  it('a change forgets the cached look and reports the new status with ISO dates', async () => {
    const next = new Date('2026-12-01T10:00:00Z');
    vi.mocked(applyExperience).mockResolvedValue({
      decision: { kind: 'change' },
      status: { skin: 'MODERN_COSMIC', picked: true, freeChangeLeft: false, canChange: false, nextAllowedAt: next },
    });
    const out = await setExperience('u1', 'MODERN_COSMIC', NOW);
    expect(out.blocked).toBeNull();
    expect(out.status).toEqual({
      skin: 'MODERN_COSMIC',
      picked: true,
      freeChangeLeft: false,
      canChange: false,
      nextAllowedAt: next.toISOString(),
    });
    expect(invalidateExperienceCache).toHaveBeenCalledWith('u1');
  });

  it('a request inside the wait comes back blocked with the date it opens', async () => {
    const next = new Date('2026-12-01T10:00:00Z');
    vi.mocked(applyExperience).mockResolvedValue({
      decision: { kind: 'blocked', nextAllowedAt: next },
      status: { skin: 'CLASSIC_VEDIC', picked: true, freeChangeLeft: false, canChange: false, nextAllowedAt: next },
    });
    const out = await setExperience('u1', 'MODERN_COSMIC', NOW);
    expect(out.blocked).toEqual(next);
  });

  it('an unknown user is a not-found', async () => {
    vi.mocked(applyExperience).mockResolvedValue(null);
    await expect(setExperience('ghost', 'MODERN_COSMIC', NOW)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('getExperience / resetExperience', () => {
  it('reads the status', async () => {
    vi.mocked(readExperience).mockResolvedValue({
      skin: null,
      picked: false,
      freeChangeLeft: true,
      canChange: true,
      nextAllowedAt: null,
    });
    expect(await getExperience('u1', NOW)).toEqual({
      skin: null,
      picked: false,
      freeChangeLeft: true,
      canChange: true,
      nextAllowedAt: null,
    });
  });

  it('a reset on an unknown user answers null', async () => {
    vi.mocked(resetExperienceCooldown).mockResolvedValue(null);
    expect(await resetExperience('ghost', NOW)).toBeNull();
  });
});
