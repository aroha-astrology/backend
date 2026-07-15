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
// =============================================================================

export type PlanetStrength = 'weak' | 'average' | 'strong';

export interface GemstoneInfo {
  planet: string;
  planetHindi: string;
  gemstone: string;
  gemstoneHindi: string;
  alternativeStones: string[];
  finger: string;
  metal: string;
  dayToWear: string;
  mantra: string;
  mantraCount: number;
  weightCarats: string;
  /** Hex accent used by the UI to render the stone's colour swatch. */
  color: string;
  dos: string[];
  donts: string[];
}

export const GEMSTONE_DATA: Record<string, GemstoneInfo> = {
  Sun: {
    planet: 'Sun',
    planetHindi: 'Surya',
    gemstone: 'Ruby (Manik)',
    gemstoneHindi: 'Manik',
    alternativeStones: ['Garnet', 'Red Spinel', 'Sunstone'],
    finger: 'Ring finger',
    metal: 'Gold',
    dayToWear: 'Sunday',
    mantra: 'Om Hraam Hreem Hraum Sah Suryaya Namah',
    mantraCount: 7000,
    weightCarats: '3-5 carats',
    color: '#ef4444',
    dos: [
      'Wear during Shukla Paksha on a Sunday morning',
      'Energize with Surya mantra before wearing',
      'Touch the ring to your forehead before wearing',
      'Offer water to the Sun every morning',
    ],
    donts: [
      'Do not wear if Sun is in enemy sign with Saturn',
      'Avoid wearing cracked or flawed rubies',
      'Do not wear during eclipse periods',
      'Remove before sleeping if it causes heat or restlessness',
    ],
  },
  Moon: {
    planet: 'Moon',
    planetHindi: 'Chandra',
    gemstone: 'Pearl (Moti)',
    gemstoneHindi: 'Moti',
    alternativeStones: ['Moonstone', 'White Coral', 'White Sapphire'],
    finger: 'Little finger',
    metal: 'Silver',
    dayToWear: 'Monday',
    mantra: 'Om Shraam Shreem Shraum Sah Chandraya Namah',
    mantraCount: 11000,
    weightCarats: '2-4 carats',
    color: '#e2e8f0',
    dos: [
      'Wear on a Monday during Shukla Paksha',
      'Dip in Gangajal or raw milk before wearing',
      'Chant Chandra mantra 108 times',
      'Offer white flowers to Lord Shiva',
    ],
    donts: [
      'Do not wear if Moon is conjunct Rahu or Ketu',
      'Avoid yellow or discolored pearls',
      'Do not wear during Amavasya (new moon)',
      'Remove if experiencing excessive cold or lethargy',
    ],
  },
  Mars: {
    planet: 'Mars',
    planetHindi: 'Mangal',
    gemstone: 'Red Coral (Moonga)',
    gemstoneHindi: 'Moonga',
    alternativeStones: ['Carnelian', 'Red Jasper', 'Bloodstone'],
    finger: 'Ring finger',
    metal: 'Gold or Copper',
    dayToWear: 'Tuesday',
    mantra: 'Om Kraam Kreem Kraum Sah Bhaumaya Namah',
    mantraCount: 10000,
    weightCarats: '3-5 carats',
    color: '#f97316',
    dos: [
      'Wear on a Tuesday morning during Shukla Paksha',
      'Wash with Gangajal and energize with mantra',
      'Offer red flowers at Hanuman temple',
      'Recite Hanuman Chalisa before wearing',
    ],
    donts: [
      'Do not wear if Mars is lord of 6th, 8th, or 12th house for your ascendant',
      'Avoid cracked or spotted corals',
      'Do not combine with emerald or blue sapphire',
      'Remove if experiencing excessive anger or aggression',
    ],
  },
  Mercury: {
    planet: 'Mercury',
    planetHindi: 'Budh',
    gemstone: 'Emerald (Panna)',
    gemstoneHindi: 'Panna',
    alternativeStones: ['Green Tourmaline', 'Peridot', 'Green Jade'],
    finger: 'Little finger',
    metal: 'Gold',
    dayToWear: 'Wednesday',
    mantra: 'Om Braam Breem Braum Sah Budhaya Namah',
    mantraCount: 9000,
    weightCarats: '3-5 carats',
    color: '#22c55e',
    dos: [
      'Wear on a Wednesday morning during Shukla Paksha',
      'Dip in Gangajal and chant Budh mantra 108 times',
      'Offer green moong dal to Brahmins',
      'Keep emerald clean and free of scratches',
    ],
    donts: [
      'Do not combine with red coral or pearl',
      'Avoid emeralds with black spots or inclusions',
      'Do not wear if Mercury is combust',
      'Remove if experiencing skin allergies',
    ],
  },
  Jupiter: {
    planet: 'Jupiter',
    planetHindi: 'Guru/Brihaspati',
    gemstone: 'Yellow Sapphire (Pukhraj)',
    gemstoneHindi: 'Pukhraj',
    alternativeStones: ['Yellow Topaz', 'Citrine', 'Yellow Beryl'],
    finger: 'Index finger',
    metal: 'Gold',
    dayToWear: 'Thursday',
    mantra: 'Om Graam Greem Graum Sah Gurave Namah',
    mantraCount: 19000,
    weightCarats: '3-5 carats',
    color: '#eab308',
    dos: [
      'Wear on a Thursday morning during Shukla Paksha',
      'Dip in Gangajal and turmeric water',
      'Chant Guru mantra 108 times before wearing',
      'Offer yellow sweets and clothes to Brahmins',
    ],
    donts: [
      'Do not wear with blue sapphire or diamond',
      'Avoid milky or clouded yellow sapphires',
      'Do not wear if Jupiter is in 6th, 8th, or 12th house',
      'Remove if experiencing weight gain or liver issues',
    ],
  },
  Venus: {
    planet: 'Venus',
    planetHindi: 'Shukra',
    gemstone: 'Diamond (Heera)',
    gemstoneHindi: 'Heera',
    alternativeStones: ['White Sapphire', 'Zircon', 'White Topaz'],
    finger: 'Middle finger or Ring finger',
    metal: 'Platinum or Silver',
    dayToWear: 'Friday',
    mantra: 'Om Draam Dreem Draum Sah Shukraya Namah',
    mantraCount: 16000,
    weightCarats: '0.5-2 carats',
    color: '#a78bfa',
    dos: [
      'Wear on a Friday morning during Shukla Paksha',
      'Dip in raw milk and Gangajal',
      'Chant Shukra mantra 108 times',
      'Offer white flowers and sweets to a Goddess temple',
    ],
    donts: [
      'Do not combine with ruby or red coral',
      'Avoid diamonds with dark inclusions or cracks',
      'Do not wear if Venus is combust with Sun',
      'Remove if experiencing relationship turbulence',
    ],
  },
  Saturn: {
    planet: 'Saturn',
    planetHindi: 'Shani',
    gemstone: 'Blue Sapphire (Neelam)',
    gemstoneHindi: 'Neelam',
    alternativeStones: ['Amethyst', 'Blue Topaz', 'Iolite', 'Lapis Lazuli'],
    finger: 'Middle finger',
    metal: 'Panchdhatu or Silver',
    dayToWear: 'Saturday',
    mantra: 'Om Praam Preem Praum Sah Shanaischaraya Namah',
    mantraCount: 23000,
    weightCarats: '2-5 carats',
    color: '#3b82f6',
    dos: [
      'Test for 3 days by keeping under pillow before wearing',
      'Wear on a Saturday evening during Shukla Paksha',
      'Dip in sesame oil and Gangajal',
      'Offer mustard oil and black sesame to Shani temple',
    ],
    donts: [
      'NEVER wear without consulting an astrologer first',
      'Do not combine with ruby, red coral, or pearl',
      'Remove immediately if bad dreams or accidents occur within 3 days',
      'Avoid if Saturn rules the 2nd or 7th house for your lagna — consult an astrologer first',
    ],
  },
  Rahu: {
    planet: 'Rahu',
    planetHindi: 'Rahu',
    gemstone: 'Hessonite / Gomed',
    gemstoneHindi: 'Gomed',
    alternativeStones: ['Orange Zircon', 'Spessartite Garnet'],
    finger: 'Middle finger',
    metal: 'Panchdhatu or Silver',
    dayToWear: 'Saturday or Wednesday',
    mantra: 'Om Bhraam Bhreem Bhraum Sah Rahave Namah',
    mantraCount: 18000,
    weightCarats: '3-5 carats',
    color: '#6b7280',
    dos: [
      'Wear on a Saturday during Shukla Paksha',
      'Dip in raw milk and Gangajal',
      'Chant Rahu mantra 108 times',
      'Offer coconut and blue flowers at a Naga temple',
    ],
    donts: [
      'Do not combine with ruby, pearl, or red coral',
      'Avoid if Rahu is in 6th, 8th, or 12th house',
      'Do not wear cracked or dull hessonites',
      'Remove if experiencing confusion or anxiety',
    ],
  },
  Ketu: {
    planet: 'Ketu',
    planetHindi: 'Ketu',
    gemstone: "Cat's Eye (Lehsunia)",
    gemstoneHindi: 'Lehsunia / Vaidurya',
    alternativeStones: ['Tiger Eye', 'Chrysoberyl'],
    finger: 'Little finger or Ring finger',
    metal: 'Panchdhatu or Silver',
    dayToWear: 'Tuesday or Saturday',
    mantra: 'Om Sraam Sreem Sraum Sah Ketave Namah',
    mantraCount: 7000,
    weightCarats: '3-5 carats',
    color: '#92400e',
    dos: [
      'Wear on a Tuesday during Shukla Paksha',
      'Dip in Gangajal and energize with mantra',
      'Offer a flag at a Ganesha temple',
      'Donate blankets to the needy',
    ],
    donts: [
      'Do not combine with emerald or diamond',
      'Avoid if Ketu is in enemy sign or conjunct malefics',
      'Do not wear chipped or cloudy stones',
      'Remove if experiencing detachment or confusion',
    ],
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
const COMBUST_DISTANCE: Record<string, number> = {
  Moon: 12,
  Mars: 17,
  Mercury: 14,
  Jupiter: 11,
  Venus: 10,
  Saturn: 15,
};

interface NatalPlanet {
  planet: string;
  sign?: string;
  isRetrograde?: boolean;
  house?: number;
  longitude?: number;
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
  const sunPos = planets.find((p) => p.planet === 'Sun');

  return GEMSTONE_PLANET_ORDER.map((planetName): PlanetAnalysis => {
    const pos = planets.find((p) => p.planet === planetName);
    if (!pos || !pos.sign) {
      return {
        planet: planetName,
        strength: 'average',
        reason: 'Position data unavailable',
        needsGemstone: false,
      };
    }

    const reasons: string[] = [];
    let strength: PlanetStrength = 'average';
    let needsGemstone = false;

    if (DEBILITATION[planetName] === pos.sign) {
      reasons.push(`Debilitated in ${pos.sign}`);
      strength = 'weak';
      needsGemstone = true;
    }
    if (ENEMY_SIGNS[planetName]?.includes(pos.sign)) {
      reasons.push(`In enemy sign ${pos.sign}`);
      strength = 'weak';
      needsGemstone = true;
    }
    if (
      planetName !== 'Sun' &&
      planetName !== 'Rahu' &&
      planetName !== 'Ketu' &&
      sunPos &&
      typeof pos.longitude === 'number' &&
      typeof sunPos.longitude === 'number'
    ) {
      const diff = Math.abs(pos.longitude - sunPos.longitude);
      const angDist = diff > 180 ? 360 - diff : diff;
      if (angDist < (COMBUST_DISTANCE[planetName] ?? 10)) {
        reasons.push('Combust (close to Sun)');
        strength = 'weak';
        needsGemstone = true;
      }
    }
    if (pos.isRetrograde) reasons.push('Retrograde');

    // Exaltation / own sign are strong signals that override the "weak" flags.
    if (EXALTATION[planetName] === pos.sign) {
      reasons.push(`Exalted in ${pos.sign}`);
      strength = 'strong';
      needsGemstone = false;
    }
    if (OWN_SIGNS[planetName]?.includes(pos.sign)) {
      reasons.push(`In own sign ${pos.sign}`);
      if (strength !== 'strong') strength = 'strong';
      needsGemstone = false;
    }

    return {
      planet: planetName,
      strength,
      reason: reasons.length > 0 ? reasons.join('; ') : 'Neutral placement',
      needsGemstone,
    };
  });
}
