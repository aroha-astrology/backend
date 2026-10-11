// =============================================================================
// Astrology rule profile — which variant the engine uses where texts differ
// =============================================================================
// Where two old traditions genuinely give different rules, the engine names
// both and states which one it uses here, instead of picking one silently.
// A field is added only when a real variant has been found in the texts and
// recorded in docs/engine-audit/D-source-register.md. A default is what the
// code computed before the source audit began, except `saptavargajaPoints`,
// whose default now follows BPHS 27.2-3.
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
   * Points per dignity for Saptavargaja Bala (moolatrikona, own, great
   * friend, friend, neutral, enemy, great enemy).
   *  - 'bphs': 45/30/20/15/10/4/2, the figures of BPHS 27.2-3 (register
   *    BPHS-27.2-3; the Sanskrit gives them in the reversed-digit style).
   *  - 'raman': 45/30/22.5/15/7.5/3.75/1.875, the set the code shipped with.
   *    It has no old text behind it.
   */
  saptavargajaPoints: 'bphs' | 'raman';
  /**
   * In the six divisions other than the sign (hora, drekkana, saptamsa,
   * navamsa, dvadasamsa, trimsamsa) only the sign or the lord is known, not
   * the degree. 'sign': a planet in its moolatrikona SIGN there counts as
   * moolatrikona (the literal reading of "svatrikona"). 'rasi-only': the
   * degree range applies in the sign chart only and elsewhere the sign is
   * simply its own. BPHS does not say which.
   */
  moolatrikonaInVargas: 'sign' | 'rasi-only';
  /**
   * Whether the Sun's Ayana Bala and the Moon's Paksha Bala are doubled.
   * 'none': the verses (BPHS 27.10-11, 27.15-17) do not double them.
   * 'sun-ayana-moon-paksha': the translator's notes say they are, as other
   * works do.
   */
  kalaDoubling: 'none' | 'sun-ayana-moon-paksha';
  /**
   * What stops Kemadruma (the Moon with no planet but the Sun in its 2nd or
   * 12th). 'brihat-jataka': the Moon in an angle from the Lagna, or any planet
   * with the Moon (BJ 13.3). 'later-tradition': also a planet in an angle from
   * the Moon, Jupiter's aspect on the Moon, Venus with the Moon; the text calls
   * the first of these "not authoritative" and does not have the second.
   */
  kemadrumaExemptions: 'brihat-jataka' | 'later-tradition';
  /**
   * What cancels the debilitation of a planet (Neechabhanga).
   *  - 'phaladeepika': Phaladeepika 7.26-29. The lord of the debilitation sign or
   *    of the exaltation sign in a kendra from the Lagna or the Moon; those two
   *    lords in kendras from each other; the planet aspected by the lord of
   *    its debilitation sign. The seven planets only.
   *  - 'earlier': what the engine used before the audit. It also let the
   *    exaltation lord's aspect or conjunction cancel, and counted Rahu and Ketu.
   *    Those two rules are in no text opened.
   */
  neechabhangaRules: 'phaladeepika' | 'earlier';
  /**
   * Gajakesari Yoga.
   *  - 'bphs': BPHS 36.3. Jupiter in a kendra from the Lagna or the Moon, joined
   *    or aspected by a benefic, and not debilitated, combust or in an enemy's sign.
   *  - 'moon-kendra': what the engine used before the audit, Jupiter in a kendra
   *    from the Moon and nothing else (the common later form).
   */
  gajakesariRule: 'bphs' | 'moon-kendra';
  /**
   * Bhakoot (the 2nd-12th, 5th-9th and 6th-8th relations of the Moon signs).
   *  - 'muhurta-chintamani': MC 6.31-33. The fault is lifted when the two sign
   *    lords are one planet, or are friendly (a 6th-8th needs only a pure nadi;
   *    a 2nd-12th or 5th-9th also needs a pure tara), and a pure nadi is
   *    required for any exemption.
   *  - 'earlier': what the engine used before the audit, 0 for every such pair.
   */
  bhakootRule: 'muhurta-chintamani' | 'earlier';
  /**
   * Combustion orbs. 'by-motion': the translator's table in the notes to BPHS ch. 7
   * (Mars 17 direct / 8 retrograde, Mercury 14 / 12, Venus 10 / 8; the others one
   * orb). 'single': the direct orb for a retrograde planet too, as before.
   */
  combustionOrbs: 'by-motion' | 'single';
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
  saptavargajaPoints: 'bphs',
  moolatrikonaInVargas: 'sign',
  kalaDoubling: 'none',
  kemadrumaExemptions: 'brihat-jataka',
  neechabhangaRules: 'phaladeepika',
  gajakesariRule: 'bphs',
  bhakootRule: 'muhurta-chintamani',
  combustionOrbs: 'by-motion',
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
