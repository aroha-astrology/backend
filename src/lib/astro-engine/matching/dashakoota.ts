// @ts-nocheck
// =============================================================================
// Dashakoota (10-Porutham) Matching System - South Indian Compatibility
// =============================================================================
//
// Computes 10 poruthams used in South Indian marriage compatibility.
// Each porutham is pass/fail with a weight. Total points awarded for passes.
// All calculations use classical Vedic rules, fully deterministic.
// =============================================================================

import type {
  DashakootaResult,
  ZodiacSign,
  Planet,
  ChartData,
} from '@aroha-astrology/shared';

import {
  NAKSHATRA_GANA,
  NAKSHATRA_YONI,
  SIGN_LORDS,
  PLANET_FRIENDS,
  PLANET_ENEMIES,
  ZODIAC_SIGNS,
} from '@aroha-astrology/shared';

// =============================================================================
// Helpers
// =============================================================================

function signIndexOf(sign: ZodiacSign): number {
  return ZODIAC_SIGNS.indexOf(sign);
}

function signDistance(sign1: ZodiacSign, sign2: ZodiacSign): number {
  const i1 = signIndexOf(sign1);
  const i2 = signIndexOf(sign2);
  return ((i2 - i1 + 12) % 12) + 1;
}

function getPlanetRelation(
  planet1: Planet,
  planet2: Planet,
): 'friend' | 'neutral' | 'enemy' {
  if (planet1 === planet2) return 'friend';
  if (PLANET_FRIENDS[planet1]?.includes(planet2)) return 'friend';
  if (PLANET_ENEMIES[planet1]?.includes(planet2)) return 'enemy';
  return 'neutral';
}

// =============================================================================
// 1. Dina Porutham (Star compatibility)
// =============================================================================
// Count from girl's nakshatra to boy's nakshatra. Divide by 9.
// Remainder 2, 4, 6, 8, 0 (i.e. even or 0) = good. Odd remainders 1, 3, 5, 7 = bad.
// Some texts: count from boy to girl. We check both directions (either favorable = pass).
// Additionally, remainders corresponding to Janma (1st), Vipat (3rd), Pratyari (5th),
// Naidhana (7th) taras are inauspicious.

function calculateDina(
  nakshatraIndex1: number,
  nakshatraIndex2: number,
): { score: number; maxScore: number; description: string } {
  // Count from girl's star to boy's star
  const countGtoB = ((nakshatraIndex1 - nakshatraIndex2 + 27) % 27) + 1;
  const remainder = countGtoB % 9;
  // Favorable remainders: 2, 4, 6, 8, 0 (even or divisible by 9)
  const favorable = remainder === 0 || remainder % 2 === 0;

  // Also check reverse
  const countBtoG = ((nakshatraIndex2 - nakshatraIndex1 + 27) % 27) + 1;
  const remainder2 = countBtoG % 9;
  const favorable2 = remainder2 === 0 || remainder2 % 2 === 0;

  const pass = favorable || favorable2;

  return {
    score: pass ? 1 : 0,
    maxScore: 1,
    description: pass
      ? 'Dina porutham is favorable - good health and longevity for couple'
      : 'Dina porutham unfavorable - may affect health',
  };
}

// =============================================================================
// 2. Gana Porutham (Temperament)
// =============================================================================
// Same rules as Ashtakoota Gana.
// Deva-Deva, Manushya-Manushya, Rakshasa-Rakshasa = compatible
// Deva-Manushya = compatible (one direction accepted in South Indian)
// Any combo with Rakshasa (unless both Rakshasa) = incompatible

function calculateGana(
  nakshatraIndex1: number,
  nakshatraIndex2: number,
): { score: number; maxScore: number; description: string } {
  const gana1 = NAKSHATRA_GANA[nakshatraIndex1];
  const gana2 = NAKSHATRA_GANA[nakshatraIndex2];

  let pass: boolean;

  if (gana1 === gana2) {
    pass = true;
  } else if (
    (gana1 === 'Deva' && gana2 === 'Manushya') ||
    (gana1 === 'Manushya' && gana2 === 'Deva')
  ) {
    pass = true;
  } else {
    pass = false;
  }

  return {
    score: pass ? 1 : 0,
    maxScore: 1,
    description: pass
      ? `Gana match (${gana1}-${gana2}) - compatible temperaments`
      : `Gana mismatch (${gana1}-${gana2}) - incompatible temperaments`,
  };
}

// =============================================================================
// 3. Mahendra Porutham (Prosperity / Progeny)
// =============================================================================
// Count from girl's nakshatra to boy's nakshatra.
// If the count is 4, 7, 10, 13, 16, 19, 22, 25 (i.e. count % 3 === 1,
// starting from 4), it is favorable.
// Formula: (count - 1) % 3 === 0 AND count >= 4 is one way.
// Classical: favorable counts are 4, 7, 10, 13, 16, 19, 22, 25.

function calculateMahendra(
  nakshatraIndex1: number,
  nakshatraIndex2: number,
): { score: number; maxScore: number; description: string } {
  const count = ((nakshatraIndex1 - nakshatraIndex2 + 27) % 27) + 1;
  const favorableCounts = [4, 7, 10, 13, 16, 19, 22, 25];
  const pass = favorableCounts.includes(count);

  return {
    score: pass ? 1 : 0,
    maxScore: 1,
    description: pass
      ? 'Mahendra porutham present - prosperity and progeny indicated'
      : 'Mahendra porutham absent',
  };
}

// =============================================================================
// 4. Stree Deergha Porutham (Woman's longevity / marital bliss)
// =============================================================================
// Count from girl's nakshatra to boy's nakshatra must be > 13.
// i.e. boy's star should be at least 13 nakshatras away from girl's star
// (counting forward from girl).
// Some texts accept >= 7 if other poruthams are strong.

function calculateStreeDeergha(
  nakshatraIndex1: number,
  nakshatraIndex2: number,
): { score: number; maxScore: number; description: string } {
  // Count from girl's nakshatra to boy's nakshatra (forward)
  const count = ((nakshatraIndex1 - nakshatraIndex2 + 27) % 27);
  // count = 0 means same nakshatra; actual count forward is this value
  const pass = count >= 13;

  return {
    score: pass ? 1 : 0,
    maxScore: 1,
    description: pass
      ? `Stree Deergha present (distance ${count}) - marital longevity indicated`
      : `Stree Deergha absent (distance ${count}) - may affect marital harmony`,
  };
}

// =============================================================================
// 5. Yoni Porutham (Sexual / Physical compatibility)
// =============================================================================
// Same animal or friendly animals = compatible.
// Enemy animals = incompatible.

const YONI_ENEMIES: Record<string, string> = {
  Horse: 'Buffalo',
  Buffalo: 'Horse',
  Elephant: 'Lion',
  Lion: 'Elephant',
  Dog: 'Deer',
  Deer: 'Dog',
  Cat: 'Rat',
  Rat: 'Cat',
  Serpent: 'Mongoose',
  Mongoose: 'Serpent',
  Monkey: 'Goat',
  Goat: 'Monkey',
  Tiger: 'Cow',
  Cow: 'Tiger',
};

function calculateYoni(
  nakshatraIndex1: number,
  nakshatraIndex2: number,
): { score: number; maxScore: number; description: string } {
  const yoni1 = NAKSHATRA_YONI[nakshatraIndex1];
  const yoni2 = NAKSHATRA_YONI[nakshatraIndex2];

  if (!yoni1 || !yoni2) {
    return { score: 0, maxScore: 1, description: 'Invalid nakshatra index' };
  }

  if (yoni1.animal === yoni2.animal) {
    return {
      score: 1,
      maxScore: 1,
      description: `Same yoni animal (${yoni1.animal}) - excellent physical compatibility`,
    };
  }

  if (YONI_ENEMIES[yoni1.animal] === yoni2.animal) {
    return {
      score: 0,
      maxScore: 1,
      description: `Enemy yonis (${yoni1.animal} vs ${yoni2.animal}) - poor compatibility`,
    };
  }

  // Not same, not enemy = neutral/compatible
  return {
    score: 1,
    maxScore: 1,
    description: `Compatible yonis (${yoni1.animal} & ${yoni2.animal})`,
  };
}

// =============================================================================
// 6. Rashi Porutham (Moon sign compatibility)
// =============================================================================
// Count from girl's rashi to boy's rashi.
// Favorable positions: 2, 3, 4, 5, 6 (boy's rashi is 2nd to 6th from girl's).
// Also favorable if same rashi (count=1) with different nakshatras (simplified: same=ok).
// Positions 7-12 counting forward: 7 is ok (7th house = partnership).
// Unfavorable: 6th, 8th, 12th from each other.
// Classical South Indian rule: count from girl to boy.
// Favorable: 1 (same), 3, 4, 7, 10, 11 from girl.
// Unfavorable: 2, 5, 6, 8, 9, 12.

function calculateRashi(
  moonSign1: ZodiacSign,
  moonSign2: ZodiacSign,
): { score: number; maxScore: number; description: string } {
  const dist = signDistance(moonSign2, moonSign1); // from girl to boy

  // Classical favorable distances from girl's rashi to boy's rashi
  const favorable = [1, 3, 4, 7, 10, 11];
  const pass = favorable.includes(dist);

  return {
    score: pass ? 1 : 0,
    maxScore: 1,
    description: pass
      ? `Rashi porutham favorable (distance ${dist} from girl)`
      : `Rashi porutham unfavorable (distance ${dist} from girl)`,
  };
}

// =============================================================================
// 7. Rasyadhipathi Porutham (Sign-lord friendship)
// =============================================================================
// Friendship between lords of the Moon signs of boy and girl.
// Both friends or one friend/one neutral = compatible.
// Both neutral = acceptable.
// Any enemy combination = incompatible.

function calculateRasyadhipathi(
  moonSign1: ZodiacSign,
  moonSign2: ZodiacSign,
): { score: number; maxScore: number; description: string } {
  const lord1 = SIGN_LORDS[moonSign1];
  const lord2 = SIGN_LORDS[moonSign2];

  const rel1to2 = getPlanetRelation(lord1, lord2);
  const rel2to1 = getPlanetRelation(lord2, lord1);

  // Pass if no enemy relationship exists
  const hasEnemy = rel1to2 === 'enemy' || rel2to1 === 'enemy';
  const pass = !hasEnemy;

  return {
    score: pass ? 1 : 0,
    maxScore: 1,
    description: pass
      ? `Rasyadhipathi compatible (${lord1} & ${lord2} are ${rel1to2}/${rel2to1})`
      : `Rasyadhipathi incompatible (${lord1} & ${lord2} have enmity)`,
  };
}

// =============================================================================
// 8. Vasya Porutham (Dominance / Mutual attraction)
// =============================================================================
// Same as Ashtakoota Vashya but pass/fail.
// Moon sign groups determine vasya.
// If one sign has vasya over the other, or same group = pass.

const VASYA_GROUP: Record<ZodiacSign, string> = {
  Aries: 'Chatushpada',
  Taurus: 'Chatushpada',
  Gemini: 'Manava',
  Cancer: 'Jalachara',
  Leo: 'Vanachara',
  Virgo: 'Manava',
  Libra: 'Manava',
  Scorpio: 'Keeta',
  Sagittarius: 'Manava',
  Capricorn: 'Chatushpada',
  Aquarius: 'Manava',
  Pisces: 'Jalachara',
};

// Which signs are vasya (submissive/attracted) to which sign
const VASYA_MAP: Record<ZodiacSign, ZodiacSign[]> = {
  Aries: ['Leo', 'Scorpio'],
  Taurus: ['Cancer', 'Libra'],
  Gemini: ['Virgo'],
  Cancer: ['Scorpio', 'Sagittarius'],
  Leo: ['Libra'],
  Virgo: ['Pisces', 'Gemini'],
  Libra: ['Virgo', 'Capricorn'],
  Scorpio: ['Cancer'],
  Sagittarius: ['Pisces'],
  Capricorn: ['Aries', 'Aquarius'],
  Aquarius: ['Aries'],
  Pisces: ['Capricorn'],
};

function calculateVasya(
  moonSign1: ZodiacSign,
  moonSign2: ZodiacSign,
): { score: number; maxScore: number; description: string } {
  // Same sign is always compatible
  if (moonSign1 === moonSign2) {
    return {
      score: 1,
      maxScore: 1,
      description: 'Same Moon sign - Vasya porutham present',
    };
  }

  // Check if girl's sign is vasya to boy's sign or vice versa
  const boyVasyaToGirl = VASYA_MAP[moonSign1]?.includes(moonSign2) ?? false;
  const girlVasyaToBoy = VASYA_MAP[moonSign2]?.includes(moonSign1) ?? false;

  // Same group is also compatible
  const sameGroup = VASYA_GROUP[moonSign1] === VASYA_GROUP[moonSign2];

  const pass = boyVasyaToGirl || girlVasyaToBoy || sameGroup;

  return {
    score: pass ? 1 : 0,
    maxScore: 1,
    description: pass
      ? 'Vasya porutham present - mutual attraction indicated'
      : 'Vasya porutham absent - may lack mutual attraction',
  };
}

// =============================================================================
// 9. Rajju Porutham (Durability of marriage / longevity)
// =============================================================================
// Each nakshatra belongs to one of 5 Rajju groups (body parts):
// Pada (feet), Kati (waist), Nabhi (navel), Kantha (neck), Sira (head)
//
// If both nakshatras fall in the same Rajju, it is inauspicious (fail).
// Different Rajju = pass.
//
// Rajju assignment (classical 27-nakshatra cycle in groups of 5):
// Group pattern repeats: Pada, Kati, Nabhi, Kantha, Sira, Sira, Kantha, Nabhi, Kati
// Then restarts. Actually the classical mapping is:

const NAKSHATRA_RAJJU: string[] = [
  // Ashwini(0) to Revati(26)
  'Pada',   // 0  Ashwini
  'Kati',   // 1  Bharani
  'Nabhi',  // 2  Krittika
  'Kantha', // 3  Rohini
  'Sira',   // 4  Mrigashira
  'Sira',   // 5  Ardra
  'Kantha', // 6  Punarvasu
  'Nabhi',  // 7  Pushya
  'Kati',   // 8  Ashlesha
  'Pada',   // 9  Magha
  'Kati',   // 10 PurvaPhalguni
  'Nabhi',  // 11 UttaraPhalguni
  'Kantha', // 12 Hasta
  'Sira',   // 13 Chitra
  'Sira',   // 14 Swati
  'Kantha', // 15 Vishakha
  'Nabhi',  // 16 Anuradha
  'Kati',   // 17 Jyeshtha
  'Pada',   // 18 Moola
  'Kati',   // 19 PurvaAshadha
  'Nabhi',  // 20 UttaraAshadha
  'Kantha', // 21 Shravana
  'Sira',   // 22 Dhanishta
  'Sira',   // 23 Shatabhisha
  'Kantha', // 24 PurvaBhadrapada
  'Nabhi',  // 25 UttaraBhadrapada
  'Kati',   // 26 Revati
];

function calculateRajju(
  nakshatraIndex1: number,
  nakshatraIndex2: number,
): { score: number; maxScore: number; description: string } {
  const rajju1 = NAKSHATRA_RAJJU[nakshatraIndex1];
  const rajju2 = NAKSHATRA_RAJJU[nakshatraIndex2];

  const sameRajju = rajju1 === rajju2;
  const pass = !sameRajju;

  let warning = '';
  if (sameRajju) {
    switch (rajju1) {
      case 'Sira':
        warning = ' (Sira rajju - may affect husband longevity)';
        break;
      case 'Kantha':
        warning = ' (Kantha rajju - may cause difficulties)';
        break;
      case 'Nabhi':
        warning = ' (Nabhi rajju - may affect progeny)';
        break;
      case 'Kati':
        warning = ' (Kati rajju - may cause wandering/separation)';
        break;
      case 'Pada':
        warning = ' (Pada rajju - may cause poverty)';
        break;
    }
  }

  return {
    score: pass ? 1 : 0,
    maxScore: 1,
    description: pass
      ? `Different Rajju (${rajju1} & ${rajju2}) - marriage durability indicated`
      : `Same Rajju (${rajju1})${warning} - Rajju dosha present`,
  };
}

// =============================================================================
// 10. Vedha Porutham (Affliction check)
// =============================================================================
// Certain nakshatra pairs cause vedha (affliction). If the boy's and girl's
// nakshatras form a vedha pair, it fails. Otherwise, it passes.
//
// Classical Vedha pairs (0-indexed):

const VEDHA_PAIRS: [number, number][] = [
  [0, 17],  // Ashwini - Jyeshtha
  [1, 16],  // Bharani - Anuradha
  [2, 15],  // Krittika - Vishakha
  [3, 14],  // Rohini - Swati
  [4, 22],  // Mrigashira - Dhanishta
  [5, 21],  // Ardra - Shravana
  [6, 20],  // Punarvasu - UttaraAshadha
  [7, 19],  // Pushya - PurvaAshadha
  [8, 18],  // Ashlesha - Moola
  [9, 26],  // Magha - Revati
  [10, 25], // PurvaPhalguni - UttaraBhadrapada
  [11, 24], // UttaraPhalguni - PurvaBhadrapada
  [12, 23], // Hasta - Shatabhisha
  [13, 13], // Chitra has no vedha pair (self-pair placeholder, not used)
];

function calculateVedha(
  nakshatraIndex1: number,
  nakshatraIndex2: number,
): { score: number; maxScore: number; description: string } {
  let hasVedha = false;

  for (const [a, b] of VEDHA_PAIRS) {
    if (a === b) continue; // skip self-pair placeholder
    if (
      (nakshatraIndex1 === a && nakshatraIndex2 === b) ||
      (nakshatraIndex1 === b && nakshatraIndex2 === a)
    ) {
      hasVedha = true;
      break;
    }
  }

  const pass = !hasVedha;

  return {
    score: pass ? 1 : 0,
    maxScore: 1,
    description: pass
      ? 'No Vedha (affliction) between nakshatras'
      : 'Vedha dosha present - nakshatras form an afflicting pair',
  };
}

// =============================================================================
// Overall compatibility classification
// =============================================================================

function overallCompatibility(
  total: number,
  max: number,
): 'excellent' | 'good' | 'average' | 'below_average' | 'poor' {
  const ratio = total / max;
  if (ratio >= 0.8) return 'excellent';      // 8-10
  if (ratio >= 0.7) return 'good';            // 7
  if (ratio >= 0.6) return 'average';         // 6
  if (ratio >= 0.5) return 'below_average';   // 5
  return 'poor';                               // <5
}

// =============================================================================
// Main: calculateDashakoota
// =============================================================================

/**
 * Computes all 10 Poruthams for South Indian (Dashakoota) marriage compatibility.
 *
 * @param nakshatraIndex1 - Boy's birth nakshatra index (0-26)
 * @param nakshatraIndex2 - Girl's birth nakshatra index (0-26)
 * @param moonSign1 - Boy's Moon sign
 * @param moonSign2 - Girl's Moon sign
 * @param _charts - Optional chart data (reserved for future use with divisional charts)
 * @returns Full DashakootaResult with all 10 porutham scores and total
 */
export function calculateDashakoota(
  nakshatraIndex1: number,
  nakshatraIndex2: number,
  moonSign1: ZodiacSign,
  moonSign2: ZodiacSign,
  _charts?: { boy?: ChartData; girl?: ChartData },
): DashakootaResult {
  const poruthams = [
    { name: 'Dina', ...calculateDina(nakshatraIndex1, nakshatraIndex2) },
    { name: 'Gana', ...calculateGana(nakshatraIndex1, nakshatraIndex2) },
    { name: 'Mahendra', ...calculateMahendra(nakshatraIndex1, nakshatraIndex2) },
    { name: 'Stree Deergha', ...calculateStreeDeergha(nakshatraIndex1, nakshatraIndex2) },
    { name: 'Yoni', ...calculateYoni(nakshatraIndex1, nakshatraIndex2) },
    { name: 'Rashi', ...calculateRashi(moonSign1, moonSign2) },
    { name: 'Rasyadhipathi', ...calculateRasyadhipathi(moonSign1, moonSign2) },
    { name: 'Vasya', ...calculateVasya(moonSign1, moonSign2) },
    { name: 'Rajju', ...calculateRajju(nakshatraIndex1, nakshatraIndex2) },
    { name: 'Vedha', ...calculateVedha(nakshatraIndex1, nakshatraIndex2) },
  ];

  const totalScore = poruthams.reduce((sum, p) => sum + p.score, 0);
  const maxTotal = poruthams.reduce((sum, p) => sum + p.maxScore, 0);

  return {
    scores: poruthams.map((p) => ({
      name: p.name,
      maxScore: p.maxScore,
      score: p.score,
      description: p.description,
    })),
    totalScore,
    maxTotal,
    overallCompatibility: overallCompatibility(totalScore, maxTotal),
  };
}

