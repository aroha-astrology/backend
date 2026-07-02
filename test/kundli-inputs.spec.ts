import { describe, it, expect } from 'vitest';
import { birthInputsForUser, missingKundliParams } from '../src/modules/kundli/kundli.service.js';
import { makeUserRow } from './helpers/mocks.js';

const MUMBAI = { name: 'Mumbai', lat: 19.076, lon: 72.8777, tz: 'Asia/Kolkata' };

function completeUser(overrides = {}) {
  return makeUserRow({
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
    expect(missingKundliParams(completeUser())).toEqual([]);
  });

  it('reports exact birth time as missing when absent (no degraded chart)', () => {
    expect(missingKundliParams(completeUser({ timeOfBirth: null }))).toEqual(['timeOfBirth']);
  });

  it("treats birthTimeAccuracy='unknown' as missing time even if a value is present", () => {
    expect(
      missingKundliParams(completeUser({ timeOfBirth: '06:30:00', birthTimeAccuracy: 'unknown' })),
    ).toEqual(['timeOfBirth']);
  });

  it('reports every missing field for an empty profile', () => {
    const missing = missingKundliParams(makeUserRow());
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
      missingKundliParams(completeUser({ placeOfBirth: { name: 'X', lat: 19, lon: 72, tz: '' } })),
    ).toEqual(['placeOfBirth']);
  });
});

describe('birthInputsForUser', () => {
  it('builds inputs when complete; resolves tz/ayanamsa/house system', () => {
    const inputs = birthInputsForUser(
      completeUser({ preferredAyanamsa: 'raman', preferredHouseSystem: 'placidus' }),
    );
    expect(inputs).not.toBeNull();
    expect(inputs?.hour).toBe(6);
    expect(inputs?.minute).toBe(30);
    expect(inputs?.tzOffset).toBeCloseTo(5.5);
    expect(inputs?.ayanamsa).toBe('raman');
    expect(inputs?.houseSystem).toBe('P');
  });

  it('returns null when a required parameter (exact time) is missing', () => {
    expect(birthInputsForUser(completeUser({ timeOfBirth: null }))).toBeNull();
  });

  it('changing birth inputs changes the birthHash (drives regeneration)', () => {
    const a = birthInputsForUser(completeUser({ timeOfBirth: '06:30' }));
    const b = birthInputsForUser(completeUser({ timeOfBirth: '07:30' }));
    expect(a?.birthHash).not.toBe(b?.birthHash);
  });
});
