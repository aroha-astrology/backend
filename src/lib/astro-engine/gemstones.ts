// =============================================================================
// Gemstone (Ratna) recommendations — deterministic core
// =============================================================================
//
// Static planet→gemstone lookup + a natal-strength analysis that flags which
// planets are weak/afflicted (and therefore candidates for a strengthening
// gemstone). Ported from the legacy web app's gemstone page and adapted to the
// live `kundli.chartData` shape (`chart.planets`, no persisted shadbala).
//
// The AI layer (src/lib/llm/gemstone.ts) writes the personalized prose on top;
// everything here is pure, deterministic, and safe (curated care notes incl.
// the Blue Sapphire warning are authored, never model-generated).
//
// `conditionalDont.check` predicates below are evaluated fresh against the
// user's actual chart on every read (see gemstone.service.ts) — they are never
// baked into a cached response, so a caution only ever appears when it's
// actually true for that person, and any future fix to this logic applies
// retroactively to every already-unlocked user with no backfill.
// =============================================================================

export type PlanetStrength = 'weak' | 'average' | 'strong';

// Locale-dependent facts (name, alternatives, finger, metal, day, weight, dos, static donts, the
// conditional caution's wording) live in the frontend's i18n resources, keyed by `planet` — see
// `kundli.gemstone.data.<planet>.*` in frontend/i18n/resources.ts. This module only owns what
// varies per user (the conditionalDont predicate) or is locale-invariant (Sanskrit mantra, hex color).
export interface GemstoneInfo {
  planet: string;
  mantra: string;
  /** Practical mantra practice: N times per day for N days (uniform across all 9 stones). */
  mantraPerDay: number;
  mantraDays: number;
  /** Hex accent used by the UI to render the stone's colour swatch. */
  color: string;
  /** A chart-specific caution, evaluated per-user — omitted entirely when it doesn't apply. */
  conditionalDont?: {
    check: (chart: Record<string, unknown> | null) => boolean;
  };
}

interface NatalPlanet {
  planet: string;
  sign?: string;
  isRetrograde?: boolean;
  house?: number;
  longitude?: number;
}

interface NatalHouse {
  house?: number;
  lord?: string;
}

const DEBILITATION: Record<string, string> = {
  Sun: 'Libra',
  Moon: 'Scorpio',
  Mars: 'Cancer',
  Mercury: 'Pisces',
  Jupiter: 'Capricorn',
  Venus: 'Virgo',
  Saturn: 'Aries',
  Rahu: 'Scorpio',
  Ketu: 'Taurus',
};
const EXALTATION: Record<string, string> = {
  Sun: 'Aries',
  Moon: 'Taurus',
  Mars: 'Capricorn',
  Mercury: 'Virgo',
  Jupiter: 'Cancer',
  Venus: 'Pisces',
  Saturn: 'Libra',
  Rahu: 'Taurus',
  Ketu: 'Scorpio',
};
const OWN_SIGNS: Record<string, string[]> = {
  Sun: ['Leo'],
  Moon: ['Cancer'],
  Mars: ['Aries', 'Scorpio'],
  Mercury: ['Gemini', 'Virgo'],
  Jupiter: ['Sagittarius', 'Pisces'],
  Venus: ['Taurus', 'Libra'],
  Saturn: ['Capricorn', 'Aquarius'],
  Rahu: ['Aquarius'],
  Ketu: ['Scorpio'],
};
const ENEMY_SIGNS: Record<string, string[]> = {
  Sun: ['Taurus', 'Libra', 'Capricorn', 'Aquarius'],
  Moon: [],
  Mars: ['Gemini', 'Virgo'],
  Mercury: ['Cancer'],
  Jupiter: ['Gemini', 'Virgo', 'Taurus', 'Libra'],
  Venus: ['Leo', 'Cancer'],
  Saturn: ['Leo', 'Cancer', 'Aries', 'Scorpio'],
  Rahu: ['Leo', 'Cancer', 'Aries', 'Scorpio'],
  Ketu: ['Leo', 'Cancer'],
};
/** No entry ⇒ combustion doesn't apply to that body (Sun can't be combust with itself; Rahu/Ketu are shadow points). */
const COMBUST_DISTANCE: Record<string, number> = {
  Moon: 12,
  Mars: 17,
  Mercury: 14,
  Jupiter: 11,
  Venus: 10,
  Saturn: 15,
};

function getPlanetPos(
  planetName: string,
  chart: Record<string, unknown> | null,
): NatalPlanet | undefined {
  const planets = ((chart?.planets ?? []) as NatalPlanet[]) || [];
  return planets.find((p) => p.planet === planetName);
}

/** Whole-sign-house conjunction — same house number, mirroring how houses are assigned elsewhere in this app. */
function isConjunct(
  planetA: string,
  planetB: string,
  chart: Record<string, unknown> | null,
): boolean {
  const a = getPlanetPos(planetA, chart);
  const b = getPlanetPos(planetB, chart);
  return typeof a?.house === 'number' && a.house === b?.house;
}

function getHousesRuledBy(planetName: string, chart: Record<string, unknown> | null): number[] {
  const houses = ((chart?.houses ?? []) as NatalHouse[]) || [];
  return houses
    .filter((h) => h.lord === planetName)
    .map((h) => h.house)
    .filter((h): h is number => typeof h === 'number');
}

function rulesAnyOf(
  planetName: string,
  houseNumbers: number[],
  chart: Record<string, unknown> | null,
): boolean {
  return getHousesRuledBy(planetName, chart).some((h) => houseNumbers.includes(h));
}

function isInHouse(
  planetName: string,
  houseNumbers: number[],
  chart: Record<string, unknown> | null,
): boolean {
  const pos = getPlanetPos(planetName, chart);
  return typeof pos?.house === 'number' && houseNumbers.includes(pos.house);
}

function isInEnemySign(planetName: string, chart: Record<string, unknown> | null): boolean {
  const pos = getPlanetPos(planetName, chart);
  return !!pos?.sign && (ENEMY_SIGNS[planetName]?.includes(pos.sign) ?? false);
}

function isCombust(planetName: string, chart: Record<string, unknown> | null): boolean {
  const distance = COMBUST_DISTANCE[planetName];
  if (!distance) return false;
  const pos = getPlanetPos(planetName, chart);
  const sunPos = getPlanetPos('Sun', chart);
  if (
    !pos ||
    !sunPos ||
    typeof pos.longitude !== 'number' ||
    typeof sunPos.longitude !== 'number'
  ) {
    return false;
  }
  const diff = Math.abs(pos.longitude - sunPos.longitude);
  const angDist = diff > 180 ? 360 - diff : diff;
  return angDist < distance;
}

export const GEMSTONE_DATA: Record<string, GemstoneInfo> = {
  Sun: {
    planet: 'Sun',
    mantra: 'Om Hraam Hreem Hraum Sah Suryaya Namah',
    mantraPerDay: 108,
    mantraDays: 11,
    color: '#ef4444',
    conditionalDont: { check: (chart) => isInEnemySign('Sun', chart) },
  },
  Moon: {
    planet: 'Moon',
    mantra: 'Om Shraam Shreem Shraum Sah Chandraya Namah',
    mantraPerDay: 108,
    mantraDays: 11,
    color: '#e2e8f0',
    conditionalDont: {
      check: (chart) => isConjunct('Moon', 'Rahu', chart) || isConjunct('Moon', 'Ketu', chart),
    },
  },
  Mars: {
    planet: 'Mars',
    mantra: 'Om Kraam Kreem Kraum Sah Bhaumaya Namah',
    mantraPerDay: 108,
    mantraDays: 11,
    color: '#f97316',
    conditionalDont: { check: (chart) => rulesAnyOf('Mars', [6, 8, 12], chart) },
  },
  Mercury: {
    planet: 'Mercury',
    mantra: 'Om Braam Breem Braum Sah Budhaya Namah',
    mantraPerDay: 108,
    mantraDays: 11,
    color: '#22c55e',
    conditionalDont: { check: (chart) => isCombust('Mercury', chart) },
  },
  Jupiter: {
    planet: 'Jupiter',
    mantra: 'Om Graam Greem Graum Sah Gurave Namah',
    mantraPerDay: 108,
    mantraDays: 11,
    color: '#eab308',
    conditionalDont: { check: (chart) => isInHouse('Jupiter', [6, 8, 12], chart) },
  },
  Venus: {
    planet: 'Venus',
    mantra: 'Om Draam Dreem Draum Sah Shukraya Namah',
    mantraPerDay: 108,
    mantraDays: 11,
    color: '#a78bfa',
    conditionalDont: { check: (chart) => isCombust('Venus', chart) },
  },
  Saturn: {
    planet: 'Saturn',
    mantra: 'Om Praam Preem Praum Sah Shanaischaraya Namah',
    mantraPerDay: 108,
    mantraDays: 11,
    color: '#3b82f6',
    conditionalDont: { check: (chart) => rulesAnyOf('Saturn', [2, 7], chart) },
  },
  Rahu: {
    planet: 'Rahu',
    mantra: 'Om Bhraam Bhreem Bhraum Sah Rahave Namah',
    mantraPerDay: 108,
    mantraDays: 11,
    color: '#6b7280',
    conditionalDont: { check: (chart) => isInHouse('Rahu', [6, 8, 12], chart) },
  },
  Ketu: {
    planet: 'Ketu',
    mantra: 'Om Sraam Sreem Sraum Sah Ketave Namah',
    mantraPerDay: 108,
    mantraDays: 11,
    color: '#92400e',
    conditionalDont: {
      check: (chart) =>
        isInEnemySign('Ketu', chart) ||
        ['Sun', 'Mars', 'Saturn', 'Rahu'].some((m) => isConjunct('Ketu', m, chart)),
    },
  },
};

export const GEMSTONE_PLANET_ORDER = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
] as const;

export interface PlanetAnalysis {
  planet: string;
  strength: PlanetStrength;
  reason: string;
  needsGemstone: boolean;
  /** 0-100 — how strongly this gemstone is preferred for the user (higher = wear it). */
  preference: number;
}

/**
 * Classify each of the 9 planets as weak / average / strong from the natal
 * chart (`kundli.chartData`) using sign dignity (exaltation / debilitation /
 * own / enemy) and combustion. Shadbala is not persisted on the live kundli
 * row, so — unlike the legacy version — this reads sign dignity only and
 * degrades gracefully when a planet's position is missing.
 */
export function analyzePlanetStrengths(chart: Record<string, unknown> | null): PlanetAnalysis[] {
  const planets = ((chart?.planets ?? []) as NatalPlanet[]) || [];

  return GEMSTONE_PLANET_ORDER.map((planetName): PlanetAnalysis => {
    const pos = planets.find((p) => p.planet === planetName);
    if (!pos || !pos.sign) {
      return {
        planet: planetName,
        strength: 'average',
        reason: 'Position data unavailable',
        needsGemstone: false,
        preference: 50,
      };
    }

    const reasons: string[] = [];
    let strength: PlanetStrength = 'average';
    let needsGemstone = false;
    // Preference score (0-100): starts neutral, rises with affliction (the
    // planet needs strengthening → wear the stone) and falls with dignity.
    let score = 45;

    if (DEBILITATION[planetName] === pos.sign) {
      reasons.push(`Debilitated in ${pos.sign}`);
      strength = 'weak';
      needsGemstone = true;
      score += 38;
    }
    if (isInEnemySign(planetName, chart)) {
      reasons.push(`In enemy sign ${pos.sign}`);
      strength = 'weak';
      needsGemstone = true;
      score += 26;
    }
    if (isCombust(planetName, chart)) {
      reasons.push('Combust (close to Sun)');
      strength = 'weak';
      needsGemstone = true;
      score += 24;
    }
    if (pos.isRetrograde) {
      reasons.push('Retrograde');
      score += 8;
    }

    // Exaltation / own sign are strong signals that override the "weak" flags.
    if (EXALTATION[planetName] === pos.sign) {
      reasons.push(`Exalted in ${pos.sign}`);
      strength = 'strong';
      needsGemstone = false;
      score -= 32;
    }
    if (OWN_SIGNS[planetName]?.includes(pos.sign)) {
      reasons.push(`In own sign ${pos.sign}`);
      if (strength !== 'strong') strength = 'strong';
      needsGemstone = false;
      score -= 22;
    }

    const preference = Math.max(5, Math.min(95, Math.round(score)));

    return {
      planet: planetName,
      strength,
      reason: reasons.length > 0 ? reasons.join('; ') : 'Neutral placement',
      needsGemstone,
      preference,
    };
  });
}
