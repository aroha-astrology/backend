export type Skin = 'CLASSIC_VEDIC' | 'MODERN_COSMIC';

export const SKINS: readonly Skin[] = ['CLASSIC_VEDIC', 'MODERN_COSMIC'];

/** How long a user waits between changes of look once their one free change is used. */
export const EXPERIENCE_COOLDOWN_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ExperienceRecord {
  skin: Skin | null;
  /** When the look was last changed; null if it was only ever picked, or never. */
  changedAt: Date | null;
  freeChangeUsed: boolean;
}

export interface ExperienceStatus {
  skin: Skin | null;
  /** False until the user has chosen once; the app shows the picker while this is false. */
  picked: boolean;
  /** True while the one free change (any time, no waiting) is still unused. */
  freeChangeLeft: boolean;
  /** When the next change is allowed; null when it is allowed now. */
  nextAllowedAt: Date | null;
  canChange: boolean;
}

/**
 * Where a user stands on changing their look.
 *
 * The first pick (onboarding, or the one-time picker for an existing user) starts no cooldown.
 * After it the user has ONE free change, usable at any time. From then on a change is allowed
 * only 30 days after the last one.
 */
export function experienceStatus(record: ExperienceRecord, now: Date, unlimited = false): ExperienceStatus {
  // Test groups (switch experience.testSwitch): a picked look can always be changed, with no wait.
  if (unlimited && record.skin !== null) {
    return { skin: record.skin, picked: true, freeChangeLeft: false, nextAllowedAt: null, canChange: true };
  }
  if (record.skin === null) {
    return { skin: null, picked: false, freeChangeLeft: true, nextAllowedAt: null, canChange: true };
  }
  if (!record.freeChangeUsed) {
    return { skin: record.skin, picked: true, freeChangeLeft: true, nextAllowedAt: null, canChange: true };
  }
  if (record.changedAt === null) {
    return { skin: record.skin, picked: true, freeChangeLeft: false, nextAllowedAt: null, canChange: true };
  }
  const next = new Date(record.changedAt.getTime() + EXPERIENCE_COOLDOWN_DAYS * DAY_MS);
  const canChange = next.getTime() <= now.getTime();
  return {
    skin: record.skin,
    picked: true,
    freeChangeLeft: false,
    nextAllowedAt: canChange ? null : next,
    canChange,
  };
}

export type ExperienceDecision =
  | { kind: 'unchanged' }
  | { kind: 'first_pick' }
  | { kind: 'free_change' }
  | { kind: 'change' }
  | { kind: 'test_change' }
  | { kind: 'blocked'; nextAllowedAt: Date };

/** What asking for `to` does to this record right now. */
export function decideExperienceChange(record: ExperienceRecord, to: Skin, now: Date, unlimited = false): ExperienceDecision {
  if (record.skin === null) return { kind: 'first_pick' };
  if (record.skin === to) return { kind: 'unchanged' };
  // A test-group change touches neither the wait nor the one free change, so it leaves no trace on the real rule.
  if (unlimited) return { kind: 'test_change' };
  const status = experienceStatus(record, now);
  if (!status.canChange && status.nextAllowedAt) return { kind: 'blocked', nextAllowedAt: status.nextAllowedAt };
  return { kind: record.freeChangeUsed ? 'change' : 'free_change' };
}
