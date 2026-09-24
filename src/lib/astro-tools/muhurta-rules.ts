// =============================================================================
// Muhurta rule tables — Decision Astrology and Find My Date
// =============================================================================
// Classical, category-specific day rules (Muhurta Chintamani-derived panchang
// conventions): which nakshatras, tithis and weekdays favour or spoil a kind
// of beginning, and which sky conditions to avoid outright. The first seven
// tables started life in the frontend's "Check Auspicious Days"
// (frontend/lib/panchang/muhurta-categories.ts, which stays as it is); this
// is the server-side, extended copy the decision engine scores with.
//
// Nakshatra names use the engine's spelling (@aroha-astrology/shared
// NAKSHATRAS, e.g. "PurvaPhalguni"). Tithis are the app's absolute 1-30
// numbering (1-15 Shukla, 16-30 Krishna; 15 Purnima, 30 Amavasya). Weekdays
// are 0 = Sunday … 6 = Saturday.
// =============================================================================

import type { LifeArea } from '../intelligence/areas.js';

export const DECISION_CATEGORIES = [
  'careerChange',
  'property',
  'marriage',
  'businessLaunch',
  'relocation',
  'education',
] as const;
export type DecisionCategory = (typeof DECISION_CATEGORIES)[number];

export const MUHURTA_CATEGORIES = [
  'house',
  'vehicle',
  'marriage',
  'businessLaunch',
  'agreement',
  'travel',
  'productLaunch',
  'puja',
] as const;
export type MuhurtaCategory = (typeof MUHURTA_CATEGORIES)[number];

/** Sky conditions a category should steer clear of. Eclipses apply to every category. */
export type AvoidRule = 'mercuryRetro' | 'kharmas' | 'combust';

export interface MuhurtaRule {
  favorableNakshatras: readonly string[];
  unfavorableNakshatras: readonly string[];
  favorableTithis: readonly number[];
  unfavorableTithis: readonly number[];
  favorableWeekdays: readonly number[];
  unfavorableWeekdays: readonly number[];
}

/** Rikta ("empty") tithis — the 4th, 9th and 14th of each paksha — avoided for any new start. */
const RIKTA = [4, 9, 14, 19, 24, 29];
const AMAVASYA = 30;
/** 2, 3, 5, 7, 10, 11, 12, 13 of each paksha plus Purnima; Amavasya excluded. */
const GENERAL_TITHIS = [2, 3, 5, 7, 10, 11, 12, 13, 15, 17, 18, 20, 22, 25, 26, 27, 28];

const SUN = 0;
const MON = 1;
const TUE = 2;
const WED = 3;
const THU = 4;
const FRI = 5;
const SAT = 6;

/** New ventures: Pushya ("Raja Nakshatra"), Hasta/Chitra for trade, the Uttara trio for durability. */
const BUSINESS: MuhurtaRule = {
  favorableNakshatras: [
    'Pushya',
    'Hasta',
    'Chitra',
    'UttaraPhalguni',
    'UttaraAshadha',
    'UttaraBhadrapada',
    'Anuradha',
    'Revati',
  ],
  unfavorableNakshatras: ['Bharani', 'Krittika', 'Ashlesha', 'Jyeshtha', 'Moola'],
  favorableTithis: GENERAL_TITHIS,
  unfavorableTithis: [...RIKTA, AMAVASYA],
  favorableWeekdays: [WED, THU, FRI],
  unfavorableWeekdays: [TUE, SAT],
};

/** Going public with something new: the swift stars (Ashwini, Pushya, Hasta) plus the gentle ones. */
const PRODUCT_LAUNCH: MuhurtaRule = {
  favorableNakshatras: [
    'Ashwini',
    'Pushya',
    'Hasta',
    'Chitra',
    'Anuradha',
    'Revati',
    'Rohini',
    'Mrigashira',
    'Shravana',
  ],
  unfavorableNakshatras: ['Bharani', 'Krittika', 'Ardra', 'Ashlesha', 'Jyeshtha', 'Moola'],
  favorableTithis: GENERAL_TITHIS,
  unfavorableTithis: [...RIKTA, AMAVASYA],
  favorableWeekdays: [WED, THU, FRI],
  unfavorableWeekdays: [TUE, SAT],
};

/** Learning: Punarvasu/Shravana (listening), Mercury's and Jupiter's days. */
const EDUCATION: MuhurtaRule = {
  favorableNakshatras: ['Pushya', 'Hasta', 'Chitra', 'Swati', 'Anuradha', 'Shravana', 'Punarvasu'],
  unfavorableNakshatras: ['Ashlesha', 'Jyeshtha', 'Moola', 'Bharani'],
  favorableTithis: GENERAL_TITHIS,
  unfavorableTithis: [...RIKTA, AMAVASYA],
  favorableWeekdays: [WED, THU],
  unfavorableWeekdays: [],
};

/** Setting out: Ashwini (speed), Revati (safe arrival), Pushya, Hasta; Tuesday and Saturday avoided. */
const TRAVEL: MuhurtaRule = {
  favorableNakshatras: [
    'Ashwini',
    'Pushya',
    'Hasta',
    'Revati',
    'Shravana',
    'Dhanishta',
    'Punarvasu',
  ],
  unfavorableNakshatras: ['Bharani', 'Krittika', 'Ashlesha', 'Moola', 'Jyeshtha'],
  favorableTithis: GENERAL_TITHIS,
  unfavorableTithis: [...RIKTA, AMAVASYA],
  favorableWeekdays: [MON, WED, THU, FRI],
  unfavorableWeekdays: [TUE, SAT],
};

/** Griha Pravesh / property: Rohini, Mrigashira, the Uttara trio, Revati, Pushya; never Tuesday. */
const PROPERTY: MuhurtaRule = {
  favorableNakshatras: [
    'Rohini',
    'Mrigashira',
    'UttaraPhalguni',
    'UttaraAshadha',
    'UttaraBhadrapada',
    'Revati',
    'Pushya',
  ],
  unfavorableNakshatras: ['Bharani', 'Krittika', 'Ashlesha', 'Jyeshtha', 'Moola', 'Ardra'],
  favorableTithis: GENERAL_TITHIS,
  unfavorableTithis: [...RIKTA, AMAVASYA],
  favorableWeekdays: [MON, WED, THU, FRI],
  unfavorableWeekdays: [TUE, SAT],
};

/** Vivah nakshatras; the three Purvas and the fierce stars avoided, as are Ashtami and Navami. */
const MARRIAGE: MuhurtaRule = {
  favorableNakshatras: [
    'Rohini',
    'Mrigashira',
    'Magha',
    'UttaraPhalguni',
    'Hasta',
    'Swati',
    'Anuradha',
    'UttaraAshadha',
    'UttaraBhadrapada',
    'Revati',
  ],
  unfavorableNakshatras: [
    'Bharani',
    'Krittika',
    'Ardra',
    'Ashlesha',
    'Jyeshtha',
    'Moola',
    'PurvaPhalguni',
    'PurvaAshadha',
    'PurvaBhadrapada',
  ],
  favorableTithis: GENERAL_TITHIS,
  unfavorableTithis: [...RIKTA, 8, 9, 23, 24, AMAVASYA],
  favorableWeekdays: [MON, WED, THU, FRI],
  unfavorableWeekdays: [TUE, SAT],
};

/** Buying a vehicle: the movable and light stars; Ashtami and the fierce stars avoided. */
const VEHICLE: MuhurtaRule = {
  favorableNakshatras: [
    'Ashwini',
    'Rohini',
    'Mrigashira',
    'Punarvasu',
    'Pushya',
    'Hasta',
    'Chitra',
    'Swati',
    'Anuradha',
    'Shravana',
    'Dhanishta',
    'Shatabhisha',
    'Revati',
  ],
  unfavorableNakshatras: ['Bharani', 'Krittika', 'Ardra', 'Ashlesha', 'Magha', 'Jyeshtha', 'Moola'],
  favorableTithis: GENERAL_TITHIS,
  unfavorableTithis: [...RIKTA, 8, 23, AMAVASYA],
  favorableWeekdays: [MON, WED, THU, FRI],
  unfavorableWeekdays: [TUE, SAT],
};

/** Signing: fixed and gentle stars, Mercury's/Jupiter's/Venus's days; Mercury retrograde avoided. */
const AGREEMENT: MuhurtaRule = {
  favorableNakshatras: [
    'Ashwini',
    'Rohini',
    'Punarvasu',
    'Pushya',
    'Hasta',
    'Chitra',
    'Swati',
    'Anuradha',
    'Shravana',
    'Dhanishta',
    'UttaraPhalguni',
    'UttaraAshadha',
    'UttaraBhadrapada',
    'Revati',
  ],
  unfavorableNakshatras: ['Bharani', 'Krittika', 'Ardra', 'Ashlesha', 'Jyeshtha', 'Moola'],
  favorableTithis: GENERAL_TITHIS,
  unfavorableTithis: [...RIKTA, AMAVASYA],
  favorableWeekdays: [WED, THU, FRI],
  unfavorableWeekdays: [TUE, SAT],
};

/** Worship: Pushya, Rohini, Shravana and the Uttaras; any weekday; only the Rikta tithis avoided. */
const PUJA: MuhurtaRule = {
  favorableNakshatras: [
    'Pushya',
    'Rohini',
    'Shravana',
    'Punarvasu',
    'Revati',
    'Anuradha',
    'Hasta',
    'Ashwini',
    'UttaraPhalguni',
    'UttaraAshadha',
    'UttaraBhadrapada',
  ],
  unfavorableNakshatras: ['Bharani', 'Ashlesha'],
  favorableTithis: GENERAL_TITHIS,
  unfavorableTithis: RIKTA,
  favorableWeekdays: [SUN, MON, THU],
  unfavorableWeekdays: [],
};

export interface CategorySpec {
  rule: MuhurtaRule;
  /** The life area whose houses and dasha lords matter for this choice. */
  area: LifeArea;
  avoid: readonly AvoidRule[];
}

export const DECISION_SPECS: Record<DecisionCategory, CategorySpec> = {
  careerChange: { rule: BUSINESS, area: 'career', avoid: ['mercuryRetro'] },
  property: { rule: PROPERTY, area: 'family', avoid: ['mercuryRetro', 'kharmas'] },
  marriage: { rule: MARRIAGE, area: 'relationships', avoid: ['kharmas', 'combust'] },
  businessLaunch: { rule: BUSINESS, area: 'business', avoid: ['mercuryRetro'] },
  relocation: { rule: TRAVEL, area: 'relocation', avoid: [] },
  education: { rule: EDUCATION, area: 'education', avoid: [] },
};

export const MUHURTA_SPECS: Record<MuhurtaCategory, CategorySpec> = {
  house: { rule: PROPERTY, area: 'family', avoid: ['mercuryRetro', 'kharmas'] },
  vehicle: { rule: VEHICLE, area: 'overall', avoid: [] },
  marriage: { rule: MARRIAGE, area: 'relationships', avoid: ['kharmas', 'combust'] },
  businessLaunch: { rule: BUSINESS, area: 'business', avoid: ['mercuryRetro'] },
  agreement: { rule: AGREEMENT, area: 'business', avoid: ['mercuryRetro'] },
  travel: { rule: TRAVEL, area: 'overall', avoid: [] },
  productLaunch: { rule: PRODUCT_LAUNCH, area: 'business', avoid: ['mercuryRetro'] },
  puja: { rule: PUJA, area: 'overall', avoid: [] },
};
