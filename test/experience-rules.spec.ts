import { describe, expect, it } from 'vitest';
import {
  EXPERIENCE_COOLDOWN_DAYS,
  decideExperienceChange,
  experienceStatus,
  type ExperienceRecord,
} from '../src/modules/experience/experience-rules.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-01T10:00:00Z');
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

const unpicked: ExperienceRecord = { skin: null, changedAt: null, freeChangeUsed: false };
const justPicked: ExperienceRecord = { skin: 'CLASSIC_VEDIC', changedAt: null, freeChangeUsed: false };
const afterFreeChange = (daysSince: number): ExperienceRecord => ({
  skin: 'MODERN_COSMIC',
  changedAt: daysAgo(daysSince),
  freeChangeUsed: true,
});

describe('experienceStatus', () => {
  it('an unpicked user can choose, and the picker is still to be shown', () => {
    expect(experienceStatus(unpicked, NOW)).toEqual({
      skin: null,
      picked: false,
      freeChangeLeft: true,
      nextAllowedAt: null,
      canChange: true,
    });
  });

  it('right after the first pick the one free change is still left, with no wait', () => {
    const s = experienceStatus(justPicked, NOW);
    expect(s.picked).toBe(true);
    expect(s.freeChangeLeft).toBe(true);
    expect(s.canChange).toBe(true);
    expect(s.nextAllowedAt).toBeNull();
  });

  it('after the free change the next one is 30 days later', () => {
    const s = experienceStatus(afterFreeChange(2), NOW);
    expect(s.freeChangeLeft).toBe(false);
    expect(s.canChange).toBe(false);
    expect(s.nextAllowedAt).toEqual(new Date(daysAgo(2).getTime() + EXPERIENCE_COOLDOWN_DAYS * DAY));
  });

  it('29 days after is still blocked, 30 days after is open', () => {
    expect(experienceStatus(afterFreeChange(29), NOW).canChange).toBe(false);
    const open = experienceStatus(afterFreeChange(30), NOW);
    expect(open.canChange).toBe(true);
    expect(open.nextAllowedAt).toBeNull();
  });
});

describe('decideExperienceChange', () => {
  it('the first pick is never blocked and starts no wait', () => {
    expect(decideExperienceChange(unpicked, 'MODERN_COSMIC', NOW)).toEqual({ kind: 'first_pick' });
  });

  it('asking for the look you already have changes nothing, even inside the wait', () => {
    expect(decideExperienceChange(justPicked, 'CLASSIC_VEDIC', NOW)).toEqual({ kind: 'unchanged' });
    expect(decideExperienceChange(afterFreeChange(1), 'MODERN_COSMIC', NOW)).toEqual({ kind: 'unchanged' });
  });

  it('the first change after picking is the free one, any time', () => {
    expect(decideExperienceChange(justPicked, 'MODERN_COSMIC', NOW)).toEqual({ kind: 'free_change' });
  });

  it('a change inside the 30 days is blocked and says when it opens', () => {
    const d = decideExperienceChange(afterFreeChange(10), 'CLASSIC_VEDIC', NOW);
    expect(d).toEqual({ kind: 'blocked', nextAllowedAt: new Date(daysAgo(10).getTime() + 30 * DAY) });
  });

  it('a change after the 30 days goes through as a normal change, then blocks again', () => {
    expect(decideExperienceChange(afterFreeChange(31), 'CLASSIC_VEDIC', NOW)).toEqual({ kind: 'change' });
    const after: ExperienceRecord = { skin: 'CLASSIC_VEDIC', changedAt: NOW, freeChangeUsed: true };
    const later = new Date(NOW.getTime() + 29 * DAY);
    expect(decideExperienceChange(after, 'MODERN_COSMIC', later).kind).toBe('blocked');
  });
});
