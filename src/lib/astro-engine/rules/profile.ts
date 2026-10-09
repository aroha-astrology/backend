// =============================================================================
// Astrology rule profile — which variant the engine uses where texts differ
// =============================================================================
// Where two old traditions genuinely give different rules, the engine names
// both and states which one it uses here, instead of picking one silently.
// A field is added only when a real variant has been found in the texts and
// recorded in docs/engine-audit/D-source-register.md; the values below are
// what the code computed before the source audit began.
//
// Per-user settings (ayanamsa, house system, lunar node) are NOT profile
// fields: they are stored on each kundli and passed into the calculations.
// The profile holds the engine-wide rule choices only.
// =============================================================================

export interface AstrologyRuleProfile {
  /** Stable id, recorded with anything computed under this profile. */
  id: string;
  sourceFamily: 'parashari';
  /** Default ayanamsa for a new chart. */
  defaultAyanamsa: 'lahiri';
  /** Default house system for a new chart ('W' in swisseph terms). */
  defaultHouseSystem: 'whole-sign';
  /** Default lunar node. */
  defaultNode: 'mean' | 'true';
  /** Days in a dasha year. 365.25 is the engine's convention; 360 (savana) is the known alternative. */
  dashaYearDays: 365.25 | 360;
  /** Chara-karaka scheme: seven planets, or eight with Rahu. */
  karakaScheme: 'seven' | 'eight';
  /**
   * Points per dignity for Saptavargaja Bala. 'raman' is the set the code
   * shipped with (45/30/22.5/15/7.5/3.75/1.875). The other set usually quoted
   * (45/30/20/15/10/4/2) is added as a second value once its passage is read.
   */
  saptavargajaPoints: 'raman';
  /** How sunrise is defined for day-based rules. */
  sunrise: 'upper-limb-refracted';
}

export const DEFAULT_PROFILE: AstrologyRuleProfile = {
  id: 'aroha-parashari-v2',
  sourceFamily: 'parashari',
  defaultAyanamsa: 'lahiri',
  defaultHouseSystem: 'whole-sign',
  defaultNode: 'mean',
  dashaYearDays: 365.25,
  karakaScheme: 'seven',
  saptavargajaPoints: 'raman',
  sunrise: 'upper-limb-refracted',
};

let activeProfile: AstrologyRuleProfile = DEFAULT_PROFILE;

export function getActiveProfile(): AstrologyRuleProfile {
  return activeProfile;
}

/** For tests and side-by-side comparison only; production runs the default. */
export function setActiveProfile(profile: AstrologyRuleProfile): void {
  activeProfile = profile;
}

/**
 * Raised once per audit release that changes engine output, together with
 * CALCULATION_VERSION in ../version.ts (which is what invalidates stored
 * charts). 0 = the pre-audit behaviour.
 */
export const RULESET_VERSION = 0;
