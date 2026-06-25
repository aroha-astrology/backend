/**
 * Lucky factor detail content + chart-aware gemstone suitability scoring.
 *
 * The kundli page surfaces six "lucky factors" (numbers, colors, days, directions,
 * gemstone, metal). When the user clicks a card we open a modal explaining the
 * planetary basis and benefits. For gemstones specifically we rank all nine
 * primary stones by a chart-aware suitability percentage so the user can see why
 * the top suggestion was chosen and what wearing alternatives would do.
 *
 * Functional-nature data per ascendant follows classical Parashari rulership rules:
 *  - Yogakaraka: rules both a kendra (1/4/7/10) and a trikona (1/5/9)
 *  - Best: rules a trine (5/9) — strongest trine is the 9th
 *  - Good: lagnesh, kendra-only owners that aren't malefic-by-naisargika
 *  - Caution: kendra-malefic mixes, yogadhipati of mixed houses
 *  - Avoid: pure functional malefic (3/6/8/11 owners), maraka (2/7), dushthana 8L
 *
 * Scoring is intentionally clamped to [5, 99] so no stone reads as "perfect" or
 * "useless" — wearing instructions always require a qualified astrologer.
 */

import type { ZodiacSign, ChartData, Planet } from '@aroha-astrology/shared';

// ============================================================
// Planet → stone metadata
// ============================================================

export interface GemstoneEntry {
  planet: Planet;
  stone: string;          // English (Hindi)
  englishName: string;
  hindiName: string;
  finger: string;
  metal: string;
  day: string;            // Best day to first wear
  carats: string;         // Suggested weight range
  benefits: string[];     // What it does when suitable
  caution: string;        // Risk if worn while functionally malefic
}

export const GEMSTONES: Record<Planet, GemstoneEntry> = {
  Sun: {
    planet: 'Sun', englishName: 'Ruby', hindiName: 'Manik', stone: 'Ruby (Manik)',
    finger: 'Ring Finger', metal: 'Gold', day: 'Sunday',
    carats: '3–5 carat',
    benefits: [
      'Strengthens self-confidence, leadership and authority',
      'Improves bone health, vitality and digestion',
      'Aids government work, recognition and father-related matters',
    ],
    caution: 'A debilitated or malefic Sun amplified by Ruby can trigger ego clashes and heart strain.',
  },
  Moon: {
    planet: 'Moon', englishName: 'Pearl', hindiName: 'Moti', stone: 'Pearl (Moti)',
    finger: 'Little Finger', metal: 'Silver', day: 'Monday',
    carats: '5–7 carat',
    benefits: [
      'Calms the mind, reduces anxiety and emotional turbulence',
      'Supports mother, home, and emotional intelligence',
      'Improves sleep, intuition and creative flow',
    ],
    caution: 'When the Moon is functionally malefic, Pearl can amplify mood swings and water retention.',
  },
  Mars: {
    planet: 'Mars', englishName: 'Red Coral', hindiName: 'Moonga', stone: 'Red Coral (Moonga)',
    finger: 'Ring Finger', metal: 'Gold or Copper', day: 'Tuesday',
    carats: '6–10 carat',
    benefits: [
      'Boosts courage, energy and decisive action',
      'Helps with property, siblings and physical strength',
      'Mitigates Mangal Dosha when Mars is dignified',
    ],
    caution: 'A weak/afflicted Mars worn through Coral can sharpen anger, accidents and BP.',
  },
  Mercury: {
    planet: 'Mercury', englishName: 'Emerald', hindiName: 'Panna', stone: 'Emerald (Panna)',
    finger: 'Little Finger', metal: 'Gold', day: 'Wednesday',
    carats: '3–6 carat',
    benefits: [
      'Sharpens intellect, memory and learning speed',
      'Aids communication, business, trade and writing',
      'Smoothens nervous system and skin issues',
    ],
    caution: 'Worn against the chart it can muddle decisions and aggravate skin/nerves.',
  },
  Jupiter: {
    planet: 'Jupiter', englishName: 'Yellow Sapphire', hindiName: 'Pukhraj', stone: 'Yellow Sapphire (Pukhraj)',
    finger: 'Index Finger', metal: 'Gold', day: 'Thursday',
    carats: '4–7 carat',
    benefits: [
      'Brings wisdom, prosperity, and moral clarity',
      'Highly auspicious for marriage, children and dharma',
      'Strengthens liver, expansion and teaching abilities',
    ],
    caution: 'Rare to harm — but for charts where Jupiter rules dushthana, expect inflated optimism and weight gain.',
  },
  Venus: {
    planet: 'Venus', englishName: 'Diamond', hindiName: 'Heera', stone: 'Diamond (Heera)',
    finger: 'Middle Finger or Ring Finger', metal: 'Platinum or White Gold', day: 'Friday',
    carats: '0.5–1 carat (or White Sapphire 4–6 ct as substitute)',
    benefits: [
      'Enhances love life, beauty, luxury and artistic taste',
      'Supports vehicles, comforts and material refinement',
      'Improves reproductive health',
    ],
    caution: 'For unsuitable charts (Venus rules the 2nd or 7th house, or is a functional malefic), Diamond can add to overspending, indulgence and relationship friction.',
  },
  Saturn: {
    planet: 'Saturn', englishName: 'Blue Sapphire', hindiName: 'Neelam', stone: 'Blue Sapphire (Neelam)',
    finger: 'Middle Finger', metal: 'Silver or Panchdhatu', day: 'Saturday',
    carats: '4–6 carat',
    benefits: [
      'Fastest-acting stone — career rise, discipline and karmic protection',
      'Removes obstacles when Saturn is functionally good',
      'Strengthens resilience, structure and detachment',
    ],
    caution: 'Most dangerous if unsuitable: sudden losses, accidents, depression. Always test for 3 days before binding.',
  },
  Rahu: {
    planet: 'Rahu', englishName: 'Hessonite', hindiName: 'Gomed', stone: 'Hessonite (Gomed)',
    finger: 'Middle Finger', metal: 'Silver', day: 'Saturday',
    carats: '5–7 carat',
    benefits: [
      'Helps with foreign work, technology, sudden gains',
      'Mitigates Kaal Sarp Yoga effects when properly placed',
      'Supports recovery from confusion and addictions',
    ],
    caution: 'Always wear only after consultation — Rahu remedies are contextual and double-edged.',
  },
  Ketu: {
    planet: 'Ketu', englishName: "Cat's Eye", hindiName: 'Lahsuniya', stone: "Cat's Eye (Lahsuniya)",
    finger: 'Little Finger', metal: 'Silver', day: 'Tuesday',
    carats: '5–7 carat',
    benefits: [
      'Aids spiritual insight, intuition and moksha-orientation',
      'Helps with hidden enemies and unexpected setbacks',
      'Supports occult, research and detachment from material loss',
    ],
    caution: 'Like Rahu, contextual — wrong fit can trigger isolation or sudden upheaval.',
  },
};

// ============================================================
// Functional nature per ascendant
// ============================================================
//
// Roles:
//   YK    = Yogakaraka or strongest trine lord (best stone)
//   GOOD  = Functional benefic (lagnesh / 5L / 9L / pure kendra-trikona helper)
//   OK    = Mild benefic / mixed but tilts positive
//   MIX   = Mixed signals — wear only with chart-specific guidance
//   AVOID = Functional malefic / maraka / dushthana lord
//   BAD   = Strong malefic for the lagna
//
// Order of planets is fixed: Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, Ketu.

type Role = 'YK' | 'GOOD' | 'OK' | 'MIX' | 'AVOID' | 'BAD';

const ROLE_BASE_SCORE: Record<Role, number> = {
  YK: 90, GOOD: 78, OK: 62, MIX: 50, AVOID: 28, BAD: 18,
};

const ROLE_LABEL: Record<Role, string> = {
  YK: 'Yogakaraka — strongest planet for this lagna',
  GOOD: 'Functional benefic — generally favourable',
  OK: 'Mild benefic — supportive but not transformational',
  MIX: 'Mixed nature — outcome depends on placement',
  AVOID: 'Functional malefic — usually not advised',
  BAD: 'Strong malefic for this ascendant',
};

const PLANET_ORDER: readonly Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'] as const;

// Per-ascendant role table. Each row is in PLANET_ORDER.
// Sources cross-checked against standard Parashari functional-nature lists.
const ROLES: Record<ZodiacSign, [Role, Role, Role, Role, Role, Role, Role, Role, Role]> = {
  // Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, Ketu
  Aries:       ['GOOD',  'GOOD', 'GOOD',  'AVOID', 'GOOD', 'AVOID', 'BAD',   'BAD',   'OK'   ],
  Taurus:      ['MIX',   'MIX',  'AVOID', 'GOOD',  'AVOID','GOOD',  'YK',    'OK',    'AVOID'],
  Gemini:      ['AVOID', 'MIX',  'AVOID', 'GOOD',  'AVOID','GOOD',  'GOOD',  'AVOID', 'AVOID'],
  Cancer:      ['MIX',   'GOOD', 'YK',    'AVOID', 'GOOD', 'AVOID', 'BAD',   'AVOID', 'GOOD' ],
  Leo:         ['YK',    'AVOID','GOOD',  'AVOID', 'GOOD', 'AVOID', 'AVOID', 'AVOID', 'AVOID'],
  Virgo:       ['AVOID', 'AVOID','AVOID', 'GOOD',  'AVOID','GOOD',  'MIX',   'OK',    'AVOID'],
  Libra:       ['AVOID', 'GOOD', 'AVOID', 'GOOD',  'AVOID','GOOD',  'YK',    'GOOD',  'AVOID'],
  Scorpio:     ['GOOD',  'GOOD', 'GOOD',  'AVOID', 'GOOD', 'AVOID', 'AVOID', 'AVOID', 'GOOD' ],
  Sagittarius: ['GOOD',  'AVOID','GOOD',  'AVOID', 'GOOD', 'AVOID', 'AVOID', 'AVOID', 'AVOID'],
  Capricorn:   ['AVOID', 'AVOID','MIX',   'GOOD',  'AVOID','YK',    'GOOD',  'GOOD',  'AVOID'],
  Aquarius:    ['AVOID', 'AVOID','MIX',   'GOOD',  'AVOID','YK',    'GOOD',  'GOOD',  'OK'   ],
  Pisces:      ['AVOID', 'GOOD', 'YK',    'AVOID', 'GOOD', 'AVOID', 'AVOID', 'AVOID', 'GOOD' ],
};

function planetRole(asc: ZodiacSign, planet: Planet): Role {
  const row = ROLES[asc];
  if (!row) return 'MIX';
  const idx = PLANET_ORDER.indexOf(planet);
  return idx >= 0 ? row[idx] : 'MIX';
}

// ============================================================
// Chart-condition adjustments
// ============================================================

const KENDRA = new Set([1, 4, 7, 10]);
const TRIKONA = new Set([1, 5, 9]);
const DUSHTHANA = new Set([6, 8, 12]);

interface PlanetCondition {
  dignity?: 'Exalted' | 'Mooltrikona' | 'Own Sign' | 'Friendly' | 'Neutral' | 'Enemy Sign' | 'Debilitated';
  house?: number;
  isRetrograde?: boolean;
}

const DIGNITY_ADJUSTMENT: Record<NonNullable<PlanetCondition['dignity']>, number> = {
  Exalted: 14,
  Mooltrikona: 10,
  'Own Sign': 8,
  Friendly: 4,
  Neutral: 0,
  'Enemy Sign': -6,
  Debilitated: -14,
};

function houseAdjustment(house: number | undefined): number {
  if (!house) return 0;
  if (TRIKONA.has(house)) return 6;
  if (KENDRA.has(house)) return 4;
  if (DUSHTHANA.has(house)) return -8;
  return 0;
}

// ============================================================
// Public scoring API
// ============================================================

export interface GemstoneScore {
  planet: Planet;
  stone: GemstoneEntry;
  score: number;          // 5–99
  role: Role;
  roleLabel: string;
  reasons: string[];      // Why this score, in user-readable bullets
  recommended: boolean;   // Top 1–2 stones with score ≥ 70
}

export function computeGemstoneScores(chart: ChartData): GemstoneScore[] {
  const asc = chart.ascendant.sign as ZodiacSign;
  const planetMap = new Map<Planet, PlanetCondition>();
  for (const p of chart.planets) {
    planetMap.set(p.planet, {
      dignity: undefined, // dignity isn't on ChartData.planets — supplied by callers when available
      house: p.house,
      isRetrograde: p.isRetrograde,
    });
  }

  const scores: GemstoneScore[] = PLANET_ORDER.map((planet) => {
    const role = planetRole(asc, planet);
    const cond = planetMap.get(planet) ?? {};
    const base = ROLE_BASE_SCORE[role];
    const houseDelta = houseAdjustment(cond.house);
    const dignityDelta = (cond.dignity && DIGNITY_ADJUSTMENT[cond.dignity]) || 0;
    const final = clamp(base + houseDelta + dignityDelta, 5, 99);

    const reasons: string[] = [ROLE_LABEL[role]];
    if (cond.house) {
      if (TRIKONA.has(cond.house)) reasons.push(`Sits in the ${cond.house}th — a trikona, boosting blessings`);
      else if (KENDRA.has(cond.house)) reasons.push(`Sits in the ${cond.house}th — a kendra, lending strength`);
      else if (DUSHTHANA.has(cond.house)) reasons.push(`Sits in the ${cond.house}th (dushthana) — weakens results`);
    }
    if (cond.dignity && cond.dignity !== 'Neutral') {
      reasons.push(`Currently ${cond.dignity} in the rashi chart`);
    }

    return {
      planet,
      stone: GEMSTONES[planet],
      score: final,
      role,
      roleLabel: ROLE_LABEL[role],
      reasons,
      recommended: false,
    };
  });

  scores.sort((a, b) => b.score - a.score);
  // Mark top 1–2 as recommended if they actually scored high enough
  const top = scores.filter((s) => s.score >= 70).slice(0, 2);
  for (const s of top) s.recommended = true;
  return scores;
}

/** Variant that also accepts a dignity lookup so we can use insights data when available. */
export function computeGemstoneScoresWithDignity(
  chart: ChartData,
  dignities: Partial<Record<Planet, NonNullable<PlanetCondition['dignity']>>>,
): GemstoneScore[] {
  const asc = chart.ascendant.sign as ZodiacSign;
  return PLANET_ORDER.map((planet) => {
    const role = planetRole(asc, planet);
    const planetData = chart.planets.find((p) => p.planet === planet);
    const house = planetData?.house;
    const dignity = dignities[planet];
    const base = ROLE_BASE_SCORE[role];
    const houseDelta = houseAdjustment(house);
    const dignityDelta = (dignity && DIGNITY_ADJUSTMENT[dignity]) || 0;
    const final = clamp(base + houseDelta + dignityDelta, 5, 99);

    const reasons: string[] = [ROLE_LABEL[role]];
    if (house) {
      if (TRIKONA.has(house)) reasons.push(`Sits in the ${house}th — a trikona, boosting blessings`);
      else if (KENDRA.has(house)) reasons.push(`Sits in the ${house}th — a kendra, lending strength`);
      else if (DUSHTHANA.has(house)) reasons.push(`Sits in the ${house}th (dushthana) — weakens results`);
    }
    if (dignity && dignity !== 'Neutral') {
      reasons.push(`Currently ${dignity} in the rashi chart`);
    }
    return { planet, stone: GEMSTONES[planet], score: final, role, roleLabel: ROLE_LABEL[role], reasons, recommended: false };
  })
    .sort((a, b) => b.score - a.score)
    .map((s, i, arr) => ({ ...s, recommended: i < 2 && arr[i].score >= 70 }));
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// ============================================================
// Metal scoring — top-N metals with chart-aware suitability %
// ============================================================

export interface MetalEntry {
  planet: Planet;
  metal: string;          // English name shown to user
  altNames?: string;      // Alternative or Hindi names
  benefits: string[];
  notes?: string;
}

export const METALS: Record<Planet, MetalEntry> = {
  Sun: {
    planet: 'Sun', metal: 'Gold', altNames: 'Yellow gold (Sona)',
    benefits: [
      'Carries solar fire — boosts authority, confidence, vitality',
      'Worn on the upper body (rings, chains) for heart and digestion',
      'Universal setting for Ruby and Yellow Sapphire',
    ],
    notes: 'Default metal when no chart-specific match is needed.',
  },
  Moon: {
    planet: 'Moon', metal: 'Silver', altNames: 'Chandi',
    benefits: [
      'Cools the system — soothes mind, sleep and emotional balance',
      'Best on the lower body / waist for hormonal harmony',
      'Standard setting for Pearl and Moonstone',
    ],
  },
  Mars: {
    planet: 'Mars', metal: 'Copper', altNames: 'Tamba',
    benefits: [
      'Energising — improves blood circulation, immunity and courage',
      'Worn as a kada or talisman; drinking from a copper vessel is a classic remedy',
      'Sets Red Coral well',
    ],
  },
  Mercury: {
    planet: 'Mercury', metal: 'Bronze', altNames: 'Kansya / Brass',
    benefits: [
      'Sharpens nerves and intellect; supports communication-heavy careers',
      'Used as Panchaloha bowl for puja and skin-applied medicine',
      'Alternate setting for Emerald along with gold',
    ],
  },
  Jupiter: {
    planet: 'Jupiter', metal: 'Yellow Gold', altNames: '22-karat',
    benefits: [
      'Most auspicious metal — wisdom, prosperity, dharma',
      'Standard setting for Yellow Sapphire',
      'Index-finger ring or pendant strengthens Jupiter directly',
    ],
  },
  Venus: {
    planet: 'Venus', metal: 'Platinum', altNames: 'White gold / Silver alloy',
    benefits: [
      'Refines beauty, love and artistic refinement',
      'The classic setting for Diamond and White Sapphire',
      'Alternative: high-purity silver if platinum is unavailable',
    ],
  },
  Saturn: {
    planet: 'Saturn', metal: 'Iron', altNames: 'Steel / Black iron',
    benefits: [
      'Grounds Saturn — disciplines nervous system, supports endurance',
      'Horseshoe ring (Khoda) is a classical Saturn remedy',
      'Often substituted with Panchdhatu for safety',
    ],
    notes: 'Wear cautiously — only when Saturn is functionally favourable.',
  },
  Rahu: {
    planet: 'Rahu', metal: 'Lead', altNames: 'Ranga / Mixed alloy',
    benefits: [
      'Rare and contextual — used to neutralise Rahu effects',
      'Generally substituted with Ashtadhatu (8-metal alloy)',
    ],
    notes: 'Wear only after consultation; Rahu remedies are double-edged.',
  },
  Ketu: {
    planet: 'Ketu', metal: 'Panchdhatu', altNames: 'Five-metal alloy',
    benefits: [
      'Five-metal alloy of gold, silver, copper, zinc and iron',
      'Balances all nine grahas — favoured for spiritual and protective rings',
      'Safe default when chart shows mixed signals',
    ],
  },
};

export interface MetalScore {
  planet: Planet;
  metal: MetalEntry;
  score: number;
  role: Role;
  roleLabel: string;
  reasons: string[];
  recommended: boolean;
}

/** Compute suitability scores for every metal, sorted descending. Caller can `slice(0, 5)`. */
export function computeMetalScoresWithDignity(
  chart: ChartData,
  dignities: Partial<Record<Planet, NonNullable<PlanetCondition['dignity']>>>,
): MetalScore[] {
  const asc = chart.ascendant.sign as ZodiacSign;
  return PLANET_ORDER.map((planet) => {
    const role = planetRole(asc, planet);
    const planetData = chart.planets.find((p) => p.planet === planet);
    const house = planetData?.house;
    const dignity = dignities[planet];
    const base = ROLE_BASE_SCORE[role];
    const houseDelta = houseAdjustment(house);
    const dignityDelta = (dignity && DIGNITY_ADJUSTMENT[dignity]) || 0;
    const final = clamp(base + houseDelta + dignityDelta, 5, 99);

    const reasons: string[] = [ROLE_LABEL[role]];
    if (house) {
      if (TRIKONA.has(house)) reasons.push(`Sits in the ${house}th — a trikona, boosting blessings`);
      else if (KENDRA.has(house)) reasons.push(`Sits in the ${house}th — a kendra, lending strength`);
      else if (DUSHTHANA.has(house)) reasons.push(`Sits in the ${house}th (dushthana) — weakens results`);
    }
    if (dignity && dignity !== 'Neutral') {
      reasons.push(`Currently ${dignity} in the rashi chart`);
    }

    return { planet, metal: METALS[planet], score: final, role, roleLabel: ROLE_LABEL[role], reasons, recommended: false };
  })
    .sort((a, b) => b.score - a.score)
    .map((s, i, arr) => ({ ...s, recommended: i < 2 && arr[i].score >= 70 }));
}

// ============================================================
// Detail content for the other lucky factors
// ============================================================

export interface FactorDetail {
  title: string;
  intro: string;
  benefits: string[];
  notes?: string;
}

/** Number → planet rulership (Chaldean / Vedic numerology). */
const NUMBER_RULER: Record<number, { planet: Planet; meaning: string }> = {
  1: { planet: 'Sun',     meaning: 'Originality, leadership, will' },
  2: { planet: 'Moon',    meaning: 'Sensitivity, partnership, intuition' },
  3: { planet: 'Jupiter', meaning: 'Wisdom, growth, optimism' },
  4: { planet: 'Rahu',    meaning: 'Innovation, sudden change, foreign links' },
  5: { planet: 'Mercury', meaning: 'Communication, agility, learning' },
  6: { planet: 'Venus',   meaning: 'Love, beauty, luxury, harmony' },
  7: { planet: 'Ketu',    meaning: 'Spirituality, research, mysticism' },
  8: { planet: 'Saturn',  meaning: 'Discipline, karma, long-term gain' },
  9: { planet: 'Mars',    meaning: 'Action, courage, leadership in battle' },
};

export function describeNumbers(numbers: number[]): FactorDetail {
  const rulers = numbers.map((n) => {
    const r = NUMBER_RULER[n] ?? NUMBER_RULER[((n - 1) % 9) + 1];
    return `${n} (${r.planet}) — ${r.meaning}`;
  });
  return {
    title: 'Why these numbers',
    intro:
      'Vedic numerology assigns each digit to a planet. Numbers tied to planets that act as functional benefics for your ascendant tend to bring favourable outcomes for important dates, addresses and account numbers.',
    benefits: [
      ...rulers,
      'Use for: starting dates of new ventures, vehicle/phone/account numbers, signing major contracts.',
      'Combine multi-digit numbers to a single root (e.g. 27 → 2+7 = 9) when checking compatibility.',
    ],
    notes:
      'Numerology is a supportive layer — birth chart analysis remains the primary basis for major timing decisions.',
  };
}

const COLOR_PLANET: Record<string, { planet: Planet; vibe: string }> = {
  Red: { planet: 'Mars', vibe: 'Energising, action-driven' },
  'Bright Red': { planet: 'Mars', vibe: 'Energising, action-driven' },
  Orange: { planet: 'Sun', vibe: 'Vitality, recognition' },
  Saffron: { planet: 'Sun', vibe: 'Vitality, recognition' },
  Yellow: { planet: 'Jupiter', vibe: 'Wisdom, expansion, prosperity' },
  Gold: { planet: 'Jupiter', vibe: 'Wisdom, expansion, prosperity' },
  Green: { planet: 'Mercury', vibe: 'Calm focus, communication' },
  'Light Blue': { planet: 'Saturn', vibe: 'Stability, discipline' },
  'Sky Blue': { planet: 'Mercury', vibe: 'Calm focus, communication' },
  'Dark Blue': { planet: 'Saturn', vibe: 'Stability, discipline' },
  Blue: { planet: 'Saturn', vibe: 'Stability, discipline' },
  White: { planet: 'Moon', vibe: 'Peace, calm, intuition' },
  Cream: { planet: 'Moon', vibe: 'Peace, calm, intuition' },
  Silver: { planet: 'Moon', vibe: 'Peace, calm, intuition' },
  Pink: { planet: 'Venus', vibe: 'Love, harmony, art' },
  Magenta: { planet: 'Venus', vibe: 'Love, harmony, art' },
  Purple: { planet: 'Saturn', vibe: 'Stability, depth' },
  Violet: { planet: 'Saturn', vibe: 'Stability, depth' },
  Brown: { planet: 'Saturn', vibe: 'Grounding, structure' },
  Black: { planet: 'Saturn', vibe: 'Boundary, protection — use sparingly' },
};

export function describeColors(colors: string[]): FactorDetail {
  const lines = colors.map((c) => {
    const meta = COLOR_PLANET[c.trim()] ?? { planet: 'Mercury' as Planet, vibe: 'Supportive' };
    return `${c} (${meta.planet}) — ${meta.vibe}`;
  });
  return {
    title: 'Why these colours',
    intro:
      'Each colour resonates with a planet. Wearing or surrounding yourself with shades tied to your supportive planets reinforces those energies in your daily field.',
    benefits: [
      ...lines,
      'Use for: clothes during interviews, presentation slides, room palette, journal covers.',
      'A pop of the lucky colour on a critical day is enough — full outfit is not required.',
    ],
  };
}

const DAY_DETAILS: Record<string, { planet: Planet; do: string; avoid: string }> = {
  Sunday: { planet: 'Sun', do: 'Government work, applications, leadership tasks', avoid: 'Picking arguments with father-figures' },
  Monday: { planet: 'Moon', do: 'Travel, mother-related matters, public meetings', avoid: 'Confrontational decisions when emotions run high' },
  Tuesday: { planet: 'Mars', do: 'Property, sports, courageous moves', avoid: 'Surgery and arguments with siblings' },
  Wednesday: { planet: 'Mercury', do: 'Negotiations, study, signing contracts, communication', avoid: 'Heavy commitments without a written record' },
  Thursday: { planet: 'Jupiter', do: 'Wedding, education, religious work, financial planning', avoid: 'Cynical or impulsive purchases' },
  Friday: { planet: 'Venus', do: 'Romance, art, vehicle purchase, beauty, jewellery', avoid: 'Overspending on luxuries you cannot afford' },
  Saturday: { planet: 'Saturn', do: 'Long-term planning, hard service work, donations to elders', avoid: 'Starting risky ventures and travel after sunset' },
};

export function describeDays(days: string[]): FactorDetail {
  const lines = days.map((d) => {
    const meta = DAY_DETAILS[d];
    if (!meta) return d;
    return `${d} (${meta.planet}) — Do: ${meta.do}. Avoid: ${meta.avoid}.`;
  });
  return {
    title: 'Why these days',
    intro:
      'Each day of the week is ruled by a planet. Aligning important activities with your supportive planet-days amplifies success and lowers friction.',
    benefits: [
      ...lines,
      'Plan launches, signing, meetings on these days when possible.',
      'Hora chart can refine to the auspicious 1-hour window inside the day.',
    ],
  };
}

const DIRECTION_DETAILS: Record<string, { planet: Planet; benefit: string }> = {
  East: { planet: 'Sun', benefit: 'Authority, vitality, recognition — face East while studying or working.' },
  West: { planet: 'Saturn', benefit: 'Discipline, long-term gains — useful for service careers and bedroom orientation.' },
  North: { planet: 'Mercury', benefit: 'Wealth, intellect — face North while doing finance work or learning.' },
  South: { planet: 'Mars', benefit: 'Action, ancestral support — sleep with head to the South for deep rest.' },
  Northeast: { planet: 'Jupiter', benefit: 'Wisdom, spirituality — ideal for puja and meditation rooms.' },
  Northwest: { planet: 'Moon', benefit: 'Travel, networks — good for guest rooms.' },
  Southeast: { planet: 'Venus', benefit: 'Wealth, fire energy — kitchen direction.' },
  Southwest: { planet: 'Rahu', benefit: 'Stability, leadership — master bedroom direction.' },
};

export function describeDirections(dirs: string[]): FactorDetail {
  const lines = dirs.map((d) => {
    const meta = DIRECTION_DETAILS[d];
    if (!meta) return d;
    return `${d} (${meta.planet}) — ${meta.benefit}`;
  });
  return {
    title: 'Why these directions',
    intro:
      'Vastu Shastra ties every direction to a planetary deity. Facing or sleeping in your supportive directions aligns your ambient field with helpful energies.',
    benefits: [
      ...lines,
      'Use for: desk facing, sleeping head-direction, puja altar placement, building entrance.',
      'If you cannot face the ideal direction, place a symbolic image (sun, mountain, water) on that wall.',
    ],
  };
}

const METAL_DETAILS: Record<string, { planet: Planet; benefit: string }> = {
  Gold: { planet: 'Sun', benefit: 'Strengthens authority, confidence, heart and digestion. Worn on the upper body.' },
  Silver: { planet: 'Moon', benefit: 'Calms emotions, supports sleep, intuition and feminine vitality. Best on lower body / waist.' },
  Copper: { planet: 'Mars', benefit: 'Boosts energy, blood circulation and courage. Common in kada (bracelet).' },
  Platinum: { planet: 'Venus', benefit: 'Refines aesthetics, love and luxury. Used as setting for diamonds.' },
  Iron: { planet: 'Saturn', benefit: 'Grounds nervous system; horseshoe ring is a Saturn remedy.' },
  Panchdhatu: { planet: 'Jupiter', benefit: '5-metal alloy — a balanced, all-purpose remedy for navagraha protection.' },
};

export function describeMetal(metal: string): FactorDetail {
  const meta = METAL_DETAILS[metal];
  return {
    title: `Why ${metal}`,
    intro: meta
      ? `${metal} carries the vibration of ${meta.planet}, which works in harmony with your ascendant lord.`
      : `${metal} resonates with the planetary energies supportive for your ascendant.`,
    benefits: meta
      ? [
          meta.benefit,
          'Use as setting for your gemstone, or in a kada/bracelet without a stone.',
          'Wear during shubh-muhurta day; avoid contact with chemicals on first wear.',
        ]
      : ['Wear as setting for your gemstone or as plain ornament during your auspicious day.'],
  };
}
