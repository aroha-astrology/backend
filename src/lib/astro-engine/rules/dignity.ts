// =============================================================================
// Planetary dignity and friendship — one table for the engine
// =============================================================================
// The engine grew four separate dignity tables that disagree with each other
// (audit item TR1): shared/constants/astrology.ts (by planet), gemstones.ts
// (enemy signs), astrocartography/relocation-areas.ts (exaltation, own signs)
// and astro-tools/transit.ts (friend/enemy SIGNS, with cells that contradict
// the by-planet table: Libra friendly and Saturn's signs hostile for the Moon,
// Mars' signs hostile for Mercury and Venus, and so on).
//
// This module holds no table of its own. It derives everything from the
// by-planet tables in shared/constants, so a correction made there after the
// text is read reaches every caller. Callers move here as they are next
// touched; until then the old tables stay where they are.
//
// Source status: not yet recorded in docs/engine-audit/D-source-register.md.
// Rahu and Ketu's dignities and friendships are a variant, not a settled rule.
// =============================================================================

import type { Planet, ZodiacSign } from '@aroha-astrology/shared';
import {
  PLANET_DEBILITATION,
  PLANET_ENEMIES,
  PLANET_EXALTATION,
  PLANET_FRIENDS,
  PLANET_OWN_SIGNS,
  SIGN_LORDS,
  ZODIAC_SIGNS,
} from '@aroha-astrology/shared';

export type NaturalRelation = 'friend' | 'neutral' | 'enemy';

/** Natural (naisargika) relation of `planet` towards `other`. A planet is its own friend. */
export function naturalRelation(planet: Planet, other: Planet): NaturalRelation {
  if (planet === other) return 'friend';
  if (PLANET_FRIENDS[planet]?.includes(other)) return 'friend';
  if (PLANET_ENEMIES[planet]?.includes(other)) return 'enemy';
  return 'neutral';
}

export type SignDignity = 'exalted' | 'own' | 'friend' | 'neutral' | 'enemy' | 'debilitated';

/**
 * A planet's dignity in a sign, by sign alone (no degrees, no temporary
 * friendship). Exaltation and debilitation are checked before ownership, so
 * Mercury in Virgo reads as exalted.
 */
export function signDignity(planet: Planet, signIndex: number): SignDignity {
  const sign = ZODIAC_SIGNS[((signIndex % 12) + 12) % 12] as ZodiacSign;
  if (PLANET_EXALTATION[planet]?.sign === sign) return 'exalted';
  if (PLANET_DEBILITATION[planet]?.sign === sign) return 'debilitated';
  if (PLANET_OWN_SIGNS[planet]?.includes(sign)) return 'own';
  return naturalRelation(planet, SIGN_LORDS[sign]);
}

/** The 0-5 scale the transit and Vimsopaka code already reads: exalted 5 .. debilitated 0. */
export const SIGN_DIGNITY_SCORE: Record<SignDignity, number> = {
  exalted: 5,
  own: 4,
  friend: 3,
  neutral: 2,
  enemy: 1,
  debilitated: 0,
};
