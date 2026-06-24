/**
 * Single source of truth for Navagraha visual metadata. Builds on
 * `PLANET_META` exported from `NavagrahaTransit3D.tsx` (Title-case keys —
 * Sun, Moon, Mars, …) and layers on the per-planet rendering flags used
 * by the larger DashaPlanet3DScene (ringed for Saturn/Jupiter, corona for
 * Sun, ghostly for the shadow planets Rahu/Ketu).
 *
 * Consumers should import from this file rather than referencing the
 * scattered color/glyph constants throughout the app.
 */

export type PlanetKey =
  | 'Sun' | 'Moon' | 'Mars' | 'Mercury' | 'Jupiter'
  | 'Venus' | 'Saturn' | 'Rahu' | 'Ketu' | 'Earth';

export const PLANET_KEYS: readonly PlanetKey[] = [
  'Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu', 'Earth',
] as const;

export interface PlanetVisual {
  color: string;
  emissive: number;
  ringed: boolean;     // Saturn, Jupiter — render torus rings
  corona: boolean;     // Sun — render outer glow sphere
  ghostly: boolean;    // Rahu, Ketu — semitransparent shadow body
  fallbackEmoji: string;
  nameEn: string;
  nameSa: string;
  /** Hex glow used for box-shadow / radial gradients in 2D fallbacks. */
  glow: string;
}

export const PLANET_VISUAL: Record<PlanetKey, PlanetVisual> = {
  Sun:     { color: '#F2CA50', emissive: 0.9,  ringed: false, corona: true,  ghostly: false, fallbackEmoji: '☉', nameEn: 'Sun',     nameSa: 'Surya',   glow: 'rgba(242,202,80,0.55)' },
  Moon:    { color: '#C0C8D8', emissive: 0.5,  ringed: false, corona: false, ghostly: false, fallbackEmoji: '☽', nameEn: 'Moon',    nameSa: 'Chandra', glow: 'rgba(192,200,216,0.45)' },
  Mars:    { color: '#FF6B55', emissive: 0.45, ringed: false, corona: false, ghostly: false, fallbackEmoji: '♂', nameEn: 'Mars',    nameSa: 'Mangal',  glow: 'rgba(255,107,85,0.55)' },
  Mercury: { color: '#5DD4A4', emissive: 0.45, ringed: false, corona: false, ghostly: false, fallbackEmoji: '☿', nameEn: 'Mercury', nameSa: 'Budh',    glow: 'rgba(93,212,164,0.5)' },
  Jupiter: { color: '#F2CA50', emissive: 0.55, ringed: true,  corona: false, ghostly: false, fallbackEmoji: '♃', nameEn: 'Jupiter', nameSa: 'Guru',    glow: 'rgba(242,202,80,0.5)' },
  Venus:   { color: '#F091B8', emissive: 0.45, ringed: false, corona: false, ghostly: false, fallbackEmoji: '♀', nameEn: 'Venus',   nameSa: 'Shukra',  glow: 'rgba(240,145,184,0.55)' },
  Saturn:  { color: '#9CA8BC', emissive: 0.4,  ringed: true,  corona: false, ghostly: false, fallbackEmoji: '♄', nameEn: 'Saturn',  nameSa: 'Shani',   glow: 'rgba(156,168,188,0.5)' },
  Rahu:    { color: '#9050E0', emissive: 0.5,  ringed: false, corona: false, ghostly: true,  fallbackEmoji: '☊', nameEn: 'Rahu',    nameSa: 'Rahu',    glow: 'rgba(144,80,224,0.55)' },
  Ketu:    { color: '#E0506B', emissive: 0.5,  ringed: false, corona: false, ghostly: true,  fallbackEmoji: '☋', nameEn: 'Ketu',    nameSa: 'Ketu',    glow: 'rgba(224,80,107,0.55)' },
  Earth:   { color: '#2B6CB0', emissive: 0.15, ringed: false, corona: false, ghostly: false, fallbackEmoji: '🌍', nameEn: 'Earth',   nameSa: 'Prithvi', glow: 'rgba(43,108,176,0.50)' },
};

/**
 * Normalize any free-form planet name (lowercase, abbreviations,
 * Sanskrit synonyms) to a canonical `PlanetKey`. Returns null when no
 * match — callers can decide whether to skip or fall back.
 */
export function resolvePlanetKey(input: string | undefined | null): PlanetKey | null {
  if (!input) return null;
  const k = input.trim().toLowerCase();
  switch (k) {
    case 'sun': case 'surya': case 'su': case 'ravi':
      return 'Sun';
    case 'moon': case 'chandra': case 'mo': case 'soma':
      return 'Moon';
    case 'mars': case 'mangal': case 'ma': case 'kuja': case 'angaraka':
      return 'Mars';
    case 'mercury': case 'budh': case 'budha': case 'me':
      return 'Mercury';
    case 'jupiter': case 'guru': case 'ju': case 'brihaspati':
      return 'Jupiter';
    case 'venus': case 'shukra': case 've': case 'sukra':
      return 'Venus';
    case 'saturn': case 'shani': case 'sa': case 'sani':
      return 'Saturn';
    case 'rahu': case 'ra': case 'north node':
      return 'Rahu';
    case 'ketu': case 'ke': case 'south node':
      return 'Ketu';
    default:
      // Try title-case match (handles 'Sun', 'Mars', etc. directly)
      const titled = (k[0]?.toUpperCase() ?? '') + k.slice(1);
      if ((PLANET_VISUAL as Record<string, PlanetVisual>)[titled]) {
        return titled as PlanetKey;
      }
      return null;
  }
}

export function getPlanetVisual(input: string | PlanetKey): PlanetVisual {
  const key = resolvePlanetKey(input as string) ?? 'Sun';
  return PLANET_VISUAL[key];
}
