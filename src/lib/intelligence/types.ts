/**
 * Shared vocabulary for "Why Aroha is saying this".
 *
 * A WhyFactor is one piece of chart evidence behind a reading, window or
 * recommendation — "Saturn is transiting your 10th house", "you're in Mercury
 * Mahadasha". It carries structured fields plus a translation key, never
 * English prose, so the frontend renders it in the user's language without an
 * AI call. Every roadmap feature (Astro Weather, Calendar, Timeline, Ask
 * Aroha, Decisions, Bonds) explains itself with the same shape.
 */
export type WhyFactorKind =
  | 'dasha'
  | 'transit'
  | 'house'
  | 'lordship'
  | 'nakshatra'
  | 'yoga'
  | 'panchang';

export interface WhyFactor {
  kind: WhyFactorKind;
  planet?: string;
  /** 1-12. */
  house?: number;
  sign?: string;
  nakshatra?: string;
  /** Dasha level for kind 'dasha'. */
  level?: 'mahadasha' | 'antardasha' | 'pratyantardasha';
  /** Whether this factor supports (+1), strains (-1) or is neutral (0) for the area. */
  effect: -1 | 0 | 1;
  /** i18n key the frontend renders, e.g. `why.transitInHouse`. */
  textKey: string;
  /** Interpolation values for `textKey`. */
  params?: Record<string, string | number>;
}
