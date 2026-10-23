// =============================================================================
// Cosmic Circles — rules that need no database
// =============================================================================
// The pulse is an Aroha score built from two things: how well the two charts get along
// (the Bonds compatibility, unchanged) and how the Moon of the day sits for each of them
// (Tara Bala and Chandrabala). The weights are product choices, not a classical rule, and live
// here in one place so they can be tuned. It never says what a person feels or will do.
// =============================================================================

import { randomBytes } from 'node:crypto';

/** People in one circle. */
export const MAX_CIRCLE = 12;
/** An invite link works this long. */
export const INVITE_TTL_DAYS = 14;
/** Invite links one person may have open (not yet accepted, not expired) at a time. */
export const MAX_OPEN_INVITES = 10;

export const PULSE_WEIGHTS = { compatibility: 0.5, moonOfTheDay: 0.5 } as const;

export type DayQuality = 'excellent' | 'good' | 'average' | 'poor';
export type PulseTone = 'glow' | 'steady' | 'quiet' | 'care';

const DAY_QUALITY_SCORE: Record<DayQuality, number> = {
  excellent: 100,
  good: 72,
  average: 48,
  poor: 18,
};

export function pulseScore(
  compatibilityPct: number,
  ownerDay: DayQuality,
  theirDay: DayQuality,
): number {
  const day = (DAY_QUALITY_SCORE[ownerDay] + DAY_QUALITY_SCORE[theirDay]) / 2;
  const raw =
    PULSE_WEIGHTS.compatibility * Math.max(0, Math.min(100, compatibilityPct)) +
    PULSE_WEIGHTS.moonOfTheDay * day;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function pulseTone(score: number): PulseTone {
  if (score >= 70) return 'glow';
  if (score >= 52) return 'steady';
  if (score >= 38) return 'quiet';
  return 'care';
}

/**
 * The text a birth identity is hashed from. Date, time and place to two decimals; the name is left
 * out on purpose, so the same person typed with another spelling is still a duplicate. (Twins born
 * together count as one: a circle is for different people.) Null when there is no birth date.
 */
export function identityText(input: {
  dateOfBirth: string | null | undefined;
  timeOfBirth: string | null | undefined;
  lat: number | null | undefined;
  lon: number | null | undefined;
}): string | null {
  if (!input.dateOfBirth) return null;
  const place =
    typeof input.lat === 'number' && typeof input.lon === 'number'
      ? `${input.lat.toFixed(2)},${input.lon.toFixed(2)}`
      : '';
  return `${input.dateOfBirth.trim()}|${(input.timeOfBirth ?? '').trim()}|${place}`;
}

/** No 0/O/1/I/L, so a code read aloud or from a screenshot is not misread. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 10): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  return out;
}

export const INVITE_CODE_PATTERN = /^[A-HJKMNP-Z2-9]{10}$/;

/** First word of a name: all an invitee sees of the inviter before accepting. */
export function firstNameOf(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] ?? '';
}
