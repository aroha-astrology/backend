import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  birthInputsForProfile,
  birthTimeQuality,
  chartWarning,
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

  it("does NOT block on birthTimeAccuracy='unknown' when a time value is present — generates with a caveat instead", () => {
    expect(
      missingKundliParams(
        completeProfile({ timeOfBirth: '06:30:00', birthTimeAccuracy: 'unknown' }),
      ),
    ).toEqual([]);
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

  it("folds a self-rated 'unknown' accuracy into 'approximate' when a time value IS present — generates, with the same caveat as 'approximate'", () => {
    const profile = completeProfile({ timeOfBirth: '14:03:00', birthTimeAccuracy: 'unknown' });
    expect(birthTimeQuality(profile)).toBe('approximate');
    expect(missingKundliParams(profile)).toEqual([]); // still generates a full chart
    expect(chartWarning(birthTimeQuality(profile))).toMatch(/approximate/i);
  });

  it("'unknown' when there is simply no time value at all — the only case that still blocks", () => {
    const profile = completeProfile({ timeOfBirth: null });
    expect(birthTimeQuality(profile)).toBe('unknown');
    expect(missingKundliParams(profile)).toEqual(['timeOfBirth']);
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

  /** The exact hash input shape, so the tests below can vary ONE thing each. */
  function hashWith(overrides: Record<string, unknown>): string {
    const profile = completeProfile();
    const inputs = birthInputsForProfile(profile, makeUserRow())!;
    return crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          d: profile.dateOfBirth,
          t: profile.timeOfBirth,
          acc: profile.birthTimeAccuracy,
          lat: profile.placeOfBirth!.lat,
          lon: profile.placeOfBirth!.lon,
          tz: profile.placeOfBirth!.tz,
          ayanamsa: inputs.ayanamsa,
          houseSystem: inputs.houseSystem,
          lunarNode: inputs.lunarNode,
          ...overrides,
        }),
      )
      .digest('hex')
      .slice(0, 16);
  }

  it('does NOT change any already-stored birthHash while at the pre-versioning baseline', () => {
    // The load-bearing one. Introducing versioning must not itself invalidate the cache:
    // a changed hash triggers a full regeneration, which ALSO deletes that profile's
    // horoscopes and re-fires its house insights (both LLM-backed), so a hash change on
    // every row at once would stampede every user through the engine and the shared Gemini
    // quota — to produce byte-identical charts, since the engine hasn't changed. The hash
    // here must equal one computed with no version keys at all (the pre-versioning shape).
    const preVersioningHash = hashWith({});
    expect(birthInputsForProfile(completeProfile(), makeUserRow())!.birthHash).toBe(
      preVersioningHash,
    );
  });

  it('DOES change the hash once a version moves off the baseline — the intended invalidation', () => {
    // The other half of the contract: the omission above must be conditional on still being
    // at the baseline, not a permanent no-op that quietly disables invalidation forever.
    expect(hashWith({ calculationVersion: '2027.01.1' })).not.toBe(hashWith({}));
    expect(hashWith({ ephemerisVersion: 'swisseph-wasm@0.1.0' })).not.toBe(hashWith({}));
  });

  it('still stamps the REAL current version onto the row, even though the hash omits it', () => {
    // Provenance (what actually computed this chart) is a separate concern from cache
    // invalidation — the stored columns must carry the true version regardless.
    const inputs = birthInputsForProfile(completeProfile(), makeUserRow());
    expect(inputs?.calculationVersion).toBe(CALCULATION_VERSION);
    expect(inputs?.ephemerisVersion).toBe(EPHEMERIS_VERSION);
  });
});
