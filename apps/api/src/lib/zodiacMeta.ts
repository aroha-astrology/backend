/**
 * Single source of truth for zodiac sign metadata.
 * Used by YouProfileCard, NatalWheel, and any other UI that needs sign attributes.
 */

export type ZodiacSign =
  | 'Aries' | 'Taurus' | 'Gemini' | 'Cancer'
  | 'Leo' | 'Virgo' | 'Libra' | 'Scorpio'
  | 'Sagittarius' | 'Capricorn' | 'Aquarius' | 'Pisces';

export type Element = 'Fire' | 'Earth' | 'Air' | 'Water';
export type Modality = 'Cardinal' | 'Fixed' | 'Mutable';
export type Polarity = 'Masculine' | 'Feminine';

export interface SignMeta {
  sign: ZodiacSign;
  /** Sanskrit / Vedic name */
  rashi: string;
  /** Unicode zodiac glyph */
  glyph: string;
  element: Element;
  modality: Modality;
  polarity: Polarity;
  /** Hex color used by the avatar gradient bubble and wheel segment. */
  color: string;
  /** Hex color of the element. */
  elementColor: string;
  /** Date range (informational). */
  dateRange: string;
}

export const SIGN_META: Record<ZodiacSign, SignMeta> = {
  Aries:       { sign: 'Aries',       rashi: 'Mesha',     glyph: '♈', element: 'Fire',  modality: 'Cardinal', polarity: 'Masculine', color: '#FF6B6B', elementColor: '#FF6B4A', dateRange: 'Mar 21 - Apr 19' },
  Taurus:      { sign: 'Taurus',      rashi: 'Vrishabha', glyph: '♉', element: 'Earth', modality: 'Fixed',    polarity: 'Feminine',  color: '#22C55E', elementColor: '#8B7355', dateRange: 'Apr 20 - May 20' },
  Gemini:      { sign: 'Gemini',      rashi: 'Mithuna',   glyph: '♊', element: 'Air',   modality: 'Mutable',  polarity: 'Masculine', color: '#FBBF24', elementColor: '#7C3AED', dateRange: 'May 21 - Jun 20' },
  Cancer:      { sign: 'Cancer',      rashi: 'Karka',     glyph: '♋', element: 'Water', modality: 'Cardinal', polarity: 'Feminine',  color: '#A78BFA', elementColor: '#3B82F6', dateRange: 'Jun 21 - Jul 22' },
  Leo:         { sign: 'Leo',         rashi: 'Simha',     glyph: '♌', element: 'Fire',  modality: 'Fixed',    polarity: 'Masculine', color: '#FB923C', elementColor: '#FF6B4A', dateRange: 'Jul 23 - Aug 22' },
  Virgo:       { sign: 'Virgo',       rashi: 'Kanya',     glyph: '♍', element: 'Earth', modality: 'Mutable',  polarity: 'Feminine',  color: '#16A34A', elementColor: '#8B7355', dateRange: 'Aug 23 - Sep 22' },
  Libra:       { sign: 'Libra',       rashi: 'Tula',      glyph: '♎', element: 'Air',   modality: 'Cardinal', polarity: 'Masculine', color: '#38BDF8', elementColor: '#7C3AED', dateRange: 'Sep 23 - Oct 22' },
  Scorpio:     { sign: 'Scorpio',     rashi: 'Vrischika', glyph: '♏', element: 'Water', modality: 'Fixed',    polarity: 'Feminine',  color: '#DC2626', elementColor: '#3B82F6', dateRange: 'Oct 23 - Nov 21' },
  Sagittarius: { sign: 'Sagittarius', rashi: 'Dhanu',     glyph: '♐', element: 'Fire',  modality: 'Mutable',  polarity: 'Masculine', color: '#A855F7', elementColor: '#FF6B4A', dateRange: 'Nov 22 - Dec 21' },
  Capricorn:   { sign: 'Capricorn',   rashi: 'Makara',    glyph: '♑', element: 'Earth', modality: 'Cardinal', polarity: 'Feminine',  color: '#64748B', elementColor: '#8B7355', dateRange: 'Dec 22 - Jan 19' },
  Aquarius:    { sign: 'Aquarius',    rashi: 'Kumbha',    glyph: '♒', element: 'Air',   modality: 'Fixed',    polarity: 'Masculine', color: '#06B6D4', elementColor: '#7C3AED', dateRange: 'Jan 20 - Feb 18' },
  Pisces:      { sign: 'Pisces',      rashi: 'Meena',     glyph: '♓', element: 'Water', modality: 'Mutable',  polarity: 'Feminine',  color: '#10B981', elementColor: '#3B82F6', dateRange: 'Feb 19 - Mar 20' },
};

/** Ordered list (Aries → Pisces) used by anything that needs to render all 12. */
export const ZODIAC_ORDER: ZodiacSign[] = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
];

/** Modality glyph used in the profile card. */
export const MODALITY_GLYPH: Record<Modality, string> = {
  Cardinal: '△',  // △  forward-driving
  Fixed:    '□',  // □  stable
  Mutable:  '◇',  // ◇  adaptive
};

/** Polarity glyph used in the profile card. */
export const POLARITY_GLYPH: Record<Polarity, string> = {
  Masculine: '♂', // ♂
  Feminine:  '♀', // ♀
};

/** Map gender string (from profile.gender) to the polarity label used in the card subtitle. */
export function genderLabel(gender: string | null | undefined): 'Woman' | 'Man' | 'You' {
  if (gender === 'female') return 'Woman';
  if (gender === 'male') return 'Man';
  return 'You';
}
