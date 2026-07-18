import { describe, it, expect } from 'vitest';
import {
  birthInputsForProfile,
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

  it('reports every missing field for an empty profile', () => {
    const missing = missingKundliParams(makeProfileContext());
    expect(missing).toEqual(
      expect.arrayContaining([
        'displayName',
        'gender',
        'dateOfBirth',
        'timeOfBirth',
        'placeOfBirth',
      ]),
    );
  });

  it('reports placeOfBirth missing when coordinates/timezone are incomplete', () => {
    expect(
      missingKundliParams(
        completeProfile({ placeOfBirth: { name: 'X', lat: 19, lon: 72, tz: '' } }),
      ),
    ).toEqual(['placeOfBirth']);
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
