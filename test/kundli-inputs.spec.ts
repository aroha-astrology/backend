import { describe, it, expect } from 'vitest';
import {
  birthInputsForProfile,
  birthTimeQuality,
  chartWarning,
  missingKundliParams,
} from '../src/modules/kundli/kundli.service.js';
import { makeProfileContext, makeUserRow } from './helpers/mocks.js';

const MUMBAI = { name: 'Mumbai', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata' };

function completeProfile(overrides = {}) {
  return makeProfileContext({
    displayName: 'Aanya',
    gender: 'female',
    dateOfBirth: '1990-05-20',
    timeOfBirth: '06:30:00',
    placeOfBirth: MUMBAI,
    ...overrides,
  });
}

describe('missingKundliParams (strict required set)', () => {
  it('is empty when all required birth details are present', () => {
    expect(missingKundliParams(completeProfile())).toEqual([]);
  });

  it('reports exact birth time as missing when absent (no degraded chart)', () => {
    expect(missingKundliParams(completeProfile({ timeOfBirth: null }))).toEqual(['timeOfBirth']);
  });

  it("treats birthTimeAccuracy='unknown' as missing time even if a value is present", () => {
    expect(
      missingKundliParams(
        completeProfile({ timeOfBirth: '06:30:00', birthTimeAccuracy: 'unknown' }),
      ),
    ).toEqual(['timeOfBirth']);
  });

  it('reports every chart-required field for an empty profile', () => {
    const missing = missingKundliParams(makeProfileContext());
    expect(missing).toEqual(expect.arrayContaining(['dateOfBirth', 'timeOfBirth', 'placeOfBirth']));
  });

  it('does NOT gate on gender/displayName — a chart can be computed without them', () => {
    // Regression: gender/displayName used to be in KUNDLI_REQUIRED_FIELDS, so a user who
    // hadn't picked a gender yet couldn't see their own kundli even with complete birth data.
    // They're profile metadata (used by naming/matchmaking features), not chart inputs.
    const missing = missingKundliParams(completeProfile({ displayName: null, gender: null }));
    expect(missing).toEqual([]);
  });

  it('reports placeOfBirth missing when coordinates/timezone are incomplete', () => {
    expect(
      missingKundliParams(
        completeProfile({ placeOfBirth: { name: 'X', lat: 19, lon: 72, tz: '' } }),
      ),
    ).toEqual(['placeOfBirth']);
  });
});

describe('birthTimeQuality / chartWarning — the accuracy funnel', () => {
  it("'exact' for a fully-known, exact-accuracy time", () => {
    expect(birthTimeQuality(completeProfile({ birthTimeAccuracy: 'exact' }))).toBe('exact');
    expect(chartWarning('exact')).toBeNull();
  });

  it("'approximate' carries a caveat, but still counts as a computable chart (not 'unknown')", () => {
    const profile = completeProfile({ birthTimeAccuracy: 'approximate' });
    expect(birthTimeQuality(profile)).toBe('approximate');
    expect(missingKundliParams(profile)).toEqual([]); // still generates a full chart
    expect(chartWarning('approximate')).toMatch(/approximate/i);
  });

  it("'unknown' when accuracy is explicitly 'unknown', even with a (placeholder) time value present", () => {
    const profile = completeProfile({ timeOfBirth: '12:00:00', birthTimeAccuracy: 'unknown' });
    expect(birthTimeQuality(profile)).toBe('unknown');
    expect(missingKundliParams(profile)).toEqual(['timeOfBirth']); // blocks chart generation
  });

  it("'unknown' when there is simply no time value at all", () => {
    expect(birthTimeQuality(completeProfile({ timeOfBirth: null }))).toBe('unknown');
  });
});

describe('birthInputsForProfile', () => {
  it('builds inputs when complete; resolves tz/ayanamsa/house system from the owning user', () => {
    const inputs = birthInputsForProfile(
      completeProfile(),
      makeUserRow({ preferredAyanamsa: 'raman', preferredHouseSystem: 'placidus' }),
    );
    expect(inputs).not.toBeNull();
    expect(inputs?.hour).toBe(6);
    expect(inputs?.minute).toBe(30);
    expect(inputs?.tzOffset).toBeCloseTo(5.5);
    expect(inputs?.ayanamsa).toBe('raman');
    expect(inputs?.houseSystem).toBe('P');
  });

  it('returns null when a required parameter (exact time) is missing', () => {
    expect(birthInputsForProfile(completeProfile({ timeOfBirth: null }), makeUserRow())).toBeNull();
  });

  it('changing birth inputs changes the birthHash (drives regeneration)', () => {
    const a = birthInputsForProfile(completeProfile({ timeOfBirth: '06:30' }), makeUserRow());
    const b = birthInputsForProfile(completeProfile({ timeOfBirth: '07:30' }), makeUserRow());
    expect(a?.birthHash).not.toBe(b?.birthHash);
  });
});
