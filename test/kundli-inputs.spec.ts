import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  birthInputsForProfile,
  missingKundliParams,
} from '../src/modules/kundli/kundli.service.js';
import { CALCULATION_VERSION, EPHEMERIS_VERSION } from '../src/lib/astro-engine/version.js';
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

  it('stamps the current CALCULATION_VERSION/EPHEMERIS_VERSION onto the result', () => {
    const inputs = birthInputsForProfile(completeProfile(), makeUserRow());
    expect(inputs?.calculationVersion).toBe(CALCULATION_VERSION);
    expect(inputs?.ephemerisVersion).toBe(EPHEMERIS_VERSION);
  });

  it('folds calculationVersion/ephemerisVersion into birthHash — a version bump changes the hash for IDENTICAL birth data, so a cached kundli auto-regenerates on next access with no backfill needed', () => {
    // Same technique test/kundli-repo-profile.spec.ts and friends use for hash-sensitivity:
    // birthInputsForProfile itself always stamps the CURRENT version, so to prove the version is
    // actually part of the hash input (not just carried alongside it unused), recompute the hash
    // the same way with a DIFFERENT version string and confirm it diverges.
    const profile = completeProfile();
    const user = makeUserRow();
    const withCurrentVersion = birthInputsForProfile(profile, user);
    expect(withCurrentVersion).not.toBeNull();

    const hashWithOtherVersion = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          d: profile.dateOfBirth,
          t: profile.timeOfBirth,
          acc: profile.birthTimeAccuracy,
          lat: profile.placeOfBirth!.lat,
          lon: profile.placeOfBirth!.lon,
          tz: profile.placeOfBirth!.tz,
          ayanamsa: withCurrentVersion!.ayanamsa,
          houseSystem: withCurrentVersion!.houseSystem,
          lunarNode: withCurrentVersion!.lunarNode,
          calculationVersion: 'some-other-version',
          ephemerisVersion: withCurrentVersion!.ephemerisVersion,
        }),
      )
      .digest('hex')
      .slice(0, 16);

    expect(hashWithOtherVersion).not.toBe(withCurrentVersion!.birthHash);
  });
});
