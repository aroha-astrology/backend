/**
 * How much Aroha trusts a profile's birth time, as a 0-100 figure.
 *
 * Without a rectification, this is a stated-evidence baseline: we can't verify
 * a certificate, so even an "exact" time from a birth certificate tops out at
 * 80. A rectification's own confidencePct replaces the baseline once the user
 * has run one (see rectification.ts).
 */
export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type ConfidenceBasis =
  | 'certificate'
  | 'stated_exact'
  | 'stated_approximate'
  | 'part_of_day'
  | 'missing'
  | 'rectified';

export interface BirthTimeConfidence {
  pct: number;
  level: ConfidenceLevel;
  basis: ConfidenceBasis;
}

export function levelFor(pct: number): ConfidenceLevel {
  if (pct >= 75) return 'high';
  if (pct >= 50) return 'medium';
  return 'low';
}

export function baselineBirthTimeConfidence(profile: {
  timeOfBirth: string | null;
  birthTimeAccuracy: 'exact' | 'approximate' | 'unknown' | null;
  birthTimeSource: string | null;
}): BirthTimeConfidence {
  const make = (pct: number, basis: ConfidenceBasis) => ({ pct, level: levelFor(pct), basis });
  if (!profile.timeOfBirth) return make(0, 'missing');
  if (profile.birthTimeAccuracy === 'unknown') return make(20, 'part_of_day');
  if (profile.birthTimeAccuracy === 'approximate') return make(45, 'stated_approximate');
  const documented =
    profile.birthTimeSource === 'birth_certificate' ||
    profile.birthTimeSource === 'hospital_record';
  return documented ? make(80, 'certificate') : make(70, 'stated_exact');
}
