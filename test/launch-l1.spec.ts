import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeUserRow, makeProfileContext } from './helpers/mocks.js';
import { FEATURE_REGISTRY } from '../src/config/features.js';
import { REPORT_CATALOGUE } from '../src/config/reports.js';

// Sprint L1: the Varshik launch pop-up's own switch, one "Featured" switch per report, and the
// per-user server-side record of which one-time pop-ups a user has already been shown.

const fakeEnv = vi.hoisted(() => ({ ADMIN_PHONE_E164: [] as string[], LOG_LEVEL: 'silent' }));
vi.mock('../src/config/env.js', () => ({ env: fakeEnv, isProduction: false, isTest: true }));

const { toUserDto, appendSeenPopup } = await import('../src/modules/users/users.service.js');
const { UpdateMeBodySchema } = await import('../src/modules/users/users.schemas.js');

describe('home.varshikLaunchPopup', () => {
  const def = FEATURE_REGISTRY.find((f) => f.key === 'home.varshikLaunchPopup');
  it('is registered, OFF by default and tagged new', () => {
    expect(def).toBeDefined();
    expect(def!.defaultEnabled).toBe(false);
    expect(def!.tag).toBe('new');
    expect(def!.group).toBe('home');
  });
});

describe('Featured switches', () => {
  it('every report has a reports.featured_<key> switch, OFF by default', () => {
    for (const report of REPORT_CATALOGUE) {
      const def = FEATURE_REGISTRY.find((f) => f.key === `reports.featured_${report.key}`);
      expect(def, report.key).toBeDefined();
      expect(def!.defaultEnabled).toBe(false);
      expect(def!.group).toBe('reports');
    }
  });
  it('Varshik starts not featured', () => {
    const def = FEATURE_REGISTRY.find((f) => f.key === 'reports.featured_varshik_rashifal_2027');
    expect(def?.defaultEnabled).toBe(false);
  });
});

describe('popupsSeen', () => {
  beforeEach(() => {
    fakeEnv.ADMIN_PHONE_E164 = [];
  });
  it('the user DTO carries popupsSeen, empty for a user who has seen none', () => {
    const dto = toUserDto(makeUserRow({}), makeProfileContext(), {}, false, [], null);
    expect(dto.popupsSeen).toEqual([]);
  });
  it('the user DTO carries the ids the user has seen', () => {
    const dto = toUserDto(makeUserRow({ popupsSeen: ['varshik-2027'] }), makeProfileContext(), {}, false, [], null);
    expect(dto.popupsSeen).toEqual(['varshik-2027']);
  });
  it('appendSeenPopup appends once and never duplicates', () => {
    expect(appendSeenPopup([], 'varshik-2027')).toEqual(['varshik-2027']);
    expect(appendSeenPopup(['varshik-2027'], 'varshik-2027')).toEqual(['varshik-2027']);
    expect(appendSeenPopup(['a'], 'b')).toEqual(['a', 'b']);
  });
  it('PATCH /me accepts popupSeen, one id at a time', () => {
    expect(UpdateMeBodySchema.safeParse({ popupSeen: 'varshik-2027' }).success).toBe(true);
    expect(UpdateMeBodySchema.safeParse({ popupSeen: ['x'] }).success).toBe(false);
  });
});
