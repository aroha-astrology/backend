// =============================================================================
// Varshik Rashifal 2027 — every constant the scorer reads
// =============================================================================
// reports/varshik-2027.ts holds the logic and none of the numbers. Change a value here and the
// scores move; nothing else needs touching. The numbers are STARTING values from the design
// and are LOCKED only after the calibration run (scripts/varshik-calibrate.ts) has been shown
// to the owner. See VARSHIK_WEIGHTS_STATUS at the bottom.
//
// How a score is made. Each day, for each of 7 areas, the scorer adds signals in log-odds:
//
//   logit = base + scale x ( sum over components of  weight x signal x area relevance ) + gates
//   score = 100 x sigmoid(logit)
//
// A signal sits in [-1, +1]. `base` and `scale` are the two population-level knobs the
// calibration run sets, so the tier mix lands on the targets across the whole population and
// not per profile. The component weights decide how much each input matters relative to the
// others.
//
// No source verse is cited anywhere in this file. The favourable-house tables are the usual
// gochar rules and are tuning values, not quotations.
// =============================================================================

export const AREAS = ['love', 'career', 'money', 'health', 'family', 'growth', 'travel'] as const;
export type Area = (typeof AREAS)[number];

export type ScorePlanet =
  | 'Sun'
  | 'Moon'
  | 'Mars'
  | 'Mercury'
  | 'Jupiter'
  | 'Venus'
  | 'Saturn'
  | 'Rahu'
  | 'Ketu';

export const SCORE_PLANETS: ScorePlanet[] = [
  'Sun',
  'Moon',
  'Mars',
  'Mercury',
  'Jupiter',
  'Venus',
  'Saturn',
  'Rahu',
  'Ketu',
];

export type Tier = 'dark_green' | 'light_green' | 'amber' | 'rust';

/** Lower edge of each tier, on the 0-100 score (rounded to a whole number first). */
export const TIER_EDGES = { dark_green: 75, light_green: 60, amber: 45 } as const;

/** What the report calls each tier in prompts (S3 reads these). */
export const TIER_TOKENS: Record<Tier, string> = {
  dark_green: 'TIER_GO',
  light_green: 'TIER_STEADY',
  amber: 'TIER_WEIGH',
  rust: 'TIER_HOLD',
};

/** The population mix the calibration aims at, and how far it may sit from it. */
export const CALIBRATION_TARGETS = {
  mix: { dark_green: 0.15, light_green: 0.4, amber: 0.3, rust: 0.15 },
  mixTolerance: 0.05,
  /** Share of profiles allowed to have all 12 months in one tier (below this). */
  maxAllOneTierShare: 0.05,
  /** Median over profiles of (best month - worst month), overall score. */
  minMedianMonthRange: 22,
  /** A profile with a smaller month range is logged and inspected, not forced. */
  inspectBelowRange: 10,
} as const;

export const VARSHIK_WEIGHTS = {
  /** Log-odds of a day with no signals (0 = a score of 50). LOCKED 2026-11-09 by the owner after C3: fitted on 300 synthetic charts (3 seeds) with the star-family cap (was -0.1 / 0.65 before C3). */
  base: 0.2,
  /** Multiplier on the summed component signals; the second population-level knob. */
  scale: 0.4,

  /** Houses (from the Lagna, whole sign) that carry each area. */
  areaHouses: {
    love: [7, 5],
    career: [10, 6],
    money: [2, 11],
    health: [1, 6],
    family: [4, 2],
    growth: [9, 5],
    travel: [3, 9, 12],
  } as Record<Area, number[]>,

  /** Natural significators: a planet that signifies the area counts more for it. */
  karakas: {
    love: ['Venus', 'Jupiter'],
    career: ['Saturn', 'Sun', 'Mercury'],
    money: ['Jupiter', 'Venus'],
    health: ['Sun', 'Mars'],
    family: ['Moon', 'Jupiter'],
    growth: ['Jupiter', 'Mercury'],
    travel: ['Rahu', 'Mercury', 'Moon'],
  } as Record<Area, ScorePlanet[]>,
  karakaBoost: 1.3,

  /** How much each area counts towards the overall score. */
  areaWeights: {
    love: 1,
    career: 1,
    money: 1,
    health: 1,
    family: 1,
    growth: 1,
    travel: 1,
  } as Record<Area, number>,

  /** Relevance of a signal to an area when its house is, or is not, one of the area's houses. */
  relevance: { onArea: 1.6, offArea: 0.6 },

  /** House quality in a chart: how the three readings of one house are mixed. */
  houseQuality: {
    lord: 0.5,
    placement: 0.3,
    occupants: 0.2,
    /** Panchavargi vimsopaka (out of 20): the centre and half-width that map to -1..+1. */
    vimCenter: 10,
    vimHalfWidth: 6,
    beneficOccupant: 0.3,
    maleficOccupant: -0.3,
    /** A malefic in these houses is welcome (upachaya), so it scores this instead. */
    maleficWelcomeHouses: [3, 6, 11],
    maleficWelcome: 0.2,
  },

  /** How good it is for a lord (or the Muntha) to stand in each house from the Lagna. */
  placement: {
    1: 0.8,
    2: 0.4,
    3: 0.1,
    4: 0.7,
    5: 0.9,
    6: -0.6,
    7: 0.5,
    8: -0.9,
    9: 1.0,
    10: 0.8,
    11: 0.8,
    12: -0.7,
  } as Record<number, number>,

  /** Weights of the components, in log-odds per full signal. */
  components: {
    varshaChart: 0.9,
    yearLord: 0.5,
    muntha: 0.4,
    mudda: 0.9,
    transit: 1.0,
    natalDasha: 0.7,
    saham: 0.6,
  },

  yearLord: {
    /** Of the Year Lord signal: strength vs aspect on the Varsha Lagna. */
    strengthShare: 0.7,
    aspectShare: 0.3,
    /** Extra weight for an area when the Year Lord rules or sits in one of its houses. */
    areaTouchBoost: 0.5,
  },

  muntha: {
    /** Of the Muntha signal: the house it falls in vs its lord's strength. */
    houseShare: 0.6,
    lordShare: 0.4,
    areaTouchBoost: 0.5,
  },

  /** Mudda dasha: main lord, sub lord, and how a lord's own signal is built. */
  mudda: {
    mainShare: 0.65,
    subShare: 0.35,
    strengthShare: 0.5,
    placementShare: 0.3,
    natureShare: 0.2,
    nodeStrength: 0,
    /** Rahu and Ketu have no Panchavargi; this nature value stands in. */
    nodeNature: -0.15,
    maleficNature: -0.2,
    beneficNature: 0.3,
    areaTouchBoost: 0.6,
  },

  /** The natal Maha, Antar and Pratyantar lords, read from the natal chart. */
  natalDasha: {
    mahaShare: 0.5,
    antarShare: 0.35,
    pratyantarShare: 0.15,
    strengthShare: 0.5,
    placementShare: 0.3,
    natureShare: 0.2,
    /** Natal dignity 0-5 maps to -1..+1 around this centre. */
    dignityCenter: 2.5,
    areaTouchBoost: 0.6,
  },

  /** Transit: who moves, how much each counts, and the favourable-house tables (house from the Lagna). */
  transit: {
    planetWeight: {
      Jupiter: 1.0,
      Saturn: 1.0,
      Rahu: 0.55,
      Ketu: 0.45,
      Mars: 0.5,
      Sun: 0.35,
      Venus: 0.4,
      Mercury: 0.3,
    } as Partial<Record<ScorePlanet, number>>,
    /** Share of the house reading taken from the natal Lagna (the rest from the Varsha Lagna). */
    natalLagnaShare: 0.6,
    /** Of one planet's signal: the house table, Ashtakavarga bindus, and exact aspects. */
    houseShare: 0.6,
    bindusShare: 0.3,
    aspectShare: 0.1,
    /** BAV bindus of the planet in the sign: centre and half-width that map to -1..+1. */
    bavCenter: 4,
    bavHalfWidth: 3,
    /** SAV of the sign (for Rahu and Ketu, which have no BAV). */
    savCenter: 28,
    savHalfWidth: 8,
    /** A transiting planet within this many degrees of the natal Lagna point or its lord. */
    aspectOrbDeg: 3,
    beneficTable: {
      1: 0.5,
      2: 0.8,
      3: -0.2,
      4: 0.5,
      5: 1.0,
      6: -0.6,
      7: 0.8,
      8: -0.8,
      9: 1.0,
      10: 0.5,
      11: 1.0,
      12: -0.6,
    } as Record<number, number>,
    maleficTable: {
      1: -0.4,
      2: -0.4,
      3: 0.8,
      4: -0.5,
      5: -0.5,
      6: 1.0,
      7: -0.4,
      8: -0.9,
      9: -0.5,
      10: 0.6,
      11: 1.0,
      12: -0.7,
    } as Record<number, number>,
    beneficPlanets: ['Jupiter', 'Venus', 'Mercury', 'Moon'] as ScorePlanet[],
    nodeFactor: 0.8,
  },

  /** Sade Sati and Dhaiya, counted from the natal Moon: ONE damper, the larger of the two, never both. */
  sadeSati: {
    rising: 0.35,
    peak: 0.6,
    setting: 0.4,
    dhaiya4: 0.25,
    dhaiya8: 0.35,
    /** How strongly each area feels it. */
    areaSensitivity: {
      love: 0.7,
      career: 0.8,
      money: 0.8,
      health: 1.0,
      family: 0.9,
      growth: 0.7,
      travel: 0.6,
    } as Record<Area, number>,
  },

  /** Saham activation windows (saham-windows.ts supplies the windows). */
  saham: {
    /** Window strength (integral days x lord bonus) at which the activity reaches its full height. */
    strengthRef: 2.5,
    /** Saham -> the area it speaks for. */
    areaOf: {
      Vivaha: 'love',
      Punya: 'growth',
      Vidya: 'growth',
      Rajya: 'career',
      Artha: 'money',
      Karyasiddhi: 'career',
      Pardesh: 'travel',
      Putra: 'family',
    } as Record<string, Area>,
    /** How much of its signal a Saham gives to the areas it does not speak for. */
    otherAreaShare: 0.15,
    /** Of the Saham quality: its lord's strength, the house it falls in, and benefic support. */
    lordShare: 0.5,
    houseShare: 0.3,
    supportShare: 0.2,
    supportedValue: 1,
    unsupportedValue: -0.2,
  },

  /** Vetoes (cap the score and pull it down) and dominance boosts (push it up and floor it). */
  gates: {
    /** Year Lord Panchavargi below this, with a Radda on the Year Lord. */
    yearLordWeakBelow: 5,
    vetoYearLord: { offset: -0.5, ceiling: 70 },
    /** Muntha in the 6th, 8th or 12th, with a malefic Ithasala on the Muntha lord. */
    vetoMuntha: { offset: -0.4, ceiling: 72 },
    maleficPlanets: ['Sun', 'Mars', 'Saturn', 'Rahu', 'Ketu'] as ScorePlanet[],
    /** A Kamboola in the Varsha chart that is not spoiled by a Radda on the same planets. */
    dominanceKamboola: { offset: 0.35, floor: 40 },
    /** A strong, well-supported Saham window for the area, on the days it peaks. */
    dominanceSaham: { activityAtLeast: 0.6, qualityAtLeast: 0.2, offset: 0.3, floor: 50 },
  },

  /** The 5-day cross-fade at the solar return, so the birthday is not a cliff. */
  crossfadeDays: 5,

  /** Savitzky-Golay smoothing of the daily series (odd window, polynomial order). */
  smoothing: { window: 21, order: 3 },

  /**
   * The decision table. Each row blends areas (weights); `requires` rows show only when the
   * reader gave one of the listed answers, `excludes` rows hide when they gave one. An unanswered
   * question never unlocks a row that needs it, so nothing is assumed about the reader's life.
   */
  decisions: [
    { key: 'new_work', areas: { career: 0.6, money: 0.2, growth: 0.2 }, excludes: { occupation: ['retired'] } },
    {
      key: 'business_launch',
      areas: { career: 0.5, money: 0.4, growth: 0.1 },
      requires: { occupation: ['business', 'working', 'seeking_work'] },
    },
    { key: 'money_move', areas: { money: 0.8, career: 0.2 } },
    {
      key: 'commit_relationship',
      areas: { love: 0.8, family: 0.2 },
      requires: { relationship: ['single', 'partnered'] },
    },
    {
      key: 'marriage',
      areas: { love: 0.6, family: 0.3, growth: 0.1 },
      requires: { relationship: ['single', 'partnered'] },
      // S3 open item, fixed in C3: a single student is not shown a marriage row (a partnered student still is).
      excludesWhen: [{ relationship: ['single'], occupation: ['student'] }],
    },
    {
      key: 'family_planning',
      areas: { family: 0.5, love: 0.3, health: 0.2 },
      requires: { children: ['planning'] },
    },
    { key: 'move_home', areas: { family: 0.5, money: 0.3, travel: 0.2 } },
    /** Owner 2026-11-09: buying property is its own row, apart from moving in; no no-muhurat period closes it. */
    { key: 'buy_property', areas: { money: 0.6, family: 0.25, career: 0.15 } },
    { key: 'travel_abroad', areas: { travel: 0.7, money: 0.15, health: 0.15 } },
    {
      key: 'study_exam',
      areas: { growth: 0.6, career: 0.2, health: 0.2 },
      requires: { occupation: ['student', 'working', 'seeking_work'] },
    },
    { key: 'health_routine', areas: { health: 0.8, growth: 0.2 } },
    { key: 'family_time', areas: { family: 0.8, love: 0.2 } },
  ] as ReadonlyArray<{
    key: string;
    areas: Partial<Record<Area, number>>;
    requires?: Partial<Record<'relationship' | 'occupation' | 'children' | 'mainDecision', readonly string[]>>;
    excludes?: Partial<Record<'relationship' | 'occupation' | 'children' | 'mainDecision', readonly string[]>>;
    /** The row hides when ALL the fields of any one entry match (a combination, where `excludes` hides on any single answer). */
    excludesWhen?: ReadonlyArray<Partial<Record<'relationship' | 'occupation' | 'children' | 'mainDecision', readonly string[]>>>;
  }>,
  /** The reader's "big decision in 2027" answer -> the rows it marks as theirs. */
  mainDecisionKeys: {
    job_change: ['new_work'],
    start_business: ['business_launch'],
    relationship: ['commit_relationship', 'marriage'],
    move_or_travel: ['move_home', 'travel_abroad'],
    money: ['money_move'],
    health: ['health_routine'],
    study: ['study_exam'],
  } as Record<string, string[]>,
  mainDecisionBoost: 2,
  /** Other answers that point at a decision row: they raise it in the list (focusBoost) without marking it the main one. */
  focusKeys: {
    home: { buying_or_building: ['buy_property', 'move_home'], rented: [] },
    travelPlan: { abroad: ['travel_abroad'] },
    studyPlan: { exam: ['study_exam'], course: ['study_exam'] },
    moneyFocus: {
      saving: ['money_move'],
      investing: ['money_move'],
      clearing_debt: ['money_move'],
      earning_more: ['money_move', 'new_work'],
      big_purchase: ['money_move'],
    },
  } as Record<string, Record<string, string[]>>,
  focusBoost: 1.5,

  /** Dosha activity by month: which planets make each dosha and what wakes it up. */
  dosha: {
    planetsOf: {
      mangal: ['Mars'],
      kaalSarp: ['Rahu', 'Ketu'],
      pitra: ['Sun', 'Rahu'],
      guruChandal: ['Jupiter', 'Rahu'],
      grahan: ['Sun', 'Moon', 'Rahu', 'Ketu'],
      kemadruma: ['Moon'],
      // Gandanta of the Moon, the Lagna or any planet is a birth-point matter; its planets are the Moon
      // (the point the BPHS Gandanta rule is about) and the Lagna lord is not tracked here.
      gandanta: ['Moon'],
    } as Record<string, ScorePlanet[]>,
    /** A slow planet standing in the sign of one of the dosha's natal planets wakes it up. */
    transitTriggers: {
      mangal: ['Mars', 'Saturn'],
      kaalSarp: ['Rahu', 'Ketu', 'Saturn'],
      pitra: ['Saturn', 'Rahu', 'Ketu'],
      guruChandal: ['Jupiter', 'Rahu', 'Saturn'],
      grahan: ['Rahu', 'Ketu'],
      kemadruma: ['Saturn', 'Jupiter'],
      gandanta: ['Saturn', 'Rahu', 'Ketu'],
    } as Record<string, ScorePlanet[]>,
    /** A trigger counts for a month when it holds on at least this share of its days. */
    minDaysShare: 0.33,
  },

  /**
   * answerWindow: the shortest stretch worth calling a window, gaps that do not split one, and the
   * longest a window may be. A good chart can sit above the Light Green edge for most of the year;
   * "it eases between 1 January and 31 December" tells the reader nothing, so a longer run is cut
   * to its best `maxDays` days (the stretch with the highest mean score).
   */
  answerWindow: { minRunDays: 7, mergeGapDays: 3, maxDays: 42 },

  /** reliefTimeline: how far back it reads, how far ahead, and what counts as a real change. */
  relief: {
    lookbackMonths: 18,
    /** Calendar year the look-ahead runs to (inclusive). */
    aheadUntilYear: 2029,
    /** A slow planet's move between houses (change in its house-table value) that counts. */
    transitDelta: 0.6,
    /** A natal Antar or Maha change (change in the lord's signal) that counts. */
    dashaDelta: 0.25,
    /** Hard events in the look-back (Sade Sati/Dhaiya days included as one) for "a hard stretch". */
    hardStretchMinEvents: 2,
  },

  /** Planet impact: the share of a planet's net log-odds that counts as "helping" or "weighing". */
  planetImpact: { neutralBand: 0.04 },
} as const;


// =============================================================================
// C1: nakshatra transits, birth stars, gochar from the natal Moon (Varshik classical completeness)
// =============================================================================
// Owner decisions 2026-11-07/08: transits are read from the Lagna AND from the natal Moon; Sarvatobhadra
// was offered and declined (not built); no death wording anywhere in output. Sources were read on 2026-11-08:
//   [PD]  Phaladeepika ch. 26, v. 3-8 (Mantreswara), English text at siva.sh/phaladeepika/26 : good houses and vedha points
//   [VB]  Gochara and Vedha, Vedic Astrology Blog (blog.indianastrologysoftware.com/?p=210) : vipreet vedha, Rahu/Ketu like Mars
//   [VJ1] vijayalur.com/2011/10/02/tarabala/ : Tara count and which remainders are good
//   [VJ2] vijayalur.com/2011/04/22/moorti-nirnaya/ : Moorti table
//   [SF]  shrifreedom.org/vedic-astrology/navatara-chakra/ : Navatara and the special taras
//   [KK]  Kakshya order and 3d45m span: astro-tools/kakshya.ts, whose 8 lords and span match the usual statement
//         (no written source opened by this sprint; the compartments are the engine's existing code)
// =============================================================================

/** Sarvatobhadra Chakra: offered to the owner on 2026-11-08 and declined. Not built. */
export const SBC_ENABLED = false;

export const VARSHIK_NAKSHATRA = {
  /**
   * Tara from the birth star [VJ1]: count both stars inclusive, divide by 9; remainder 2, 4, 6, 8, 9 (or 0)
   * is good, 1, 3, 5, 7 is not. Names after [SF]/[VJ1]: 7 is written "Vadha" (the sources' other name for it);
   * the plain lines never use the sources' harsher glosses (no death wording).
   */
  tara: {
    1: { name: 'Janma', good: false, plain: 'your own star, a day to go gently' },
    2: { name: 'Sampat', good: true, plain: 'a star of wealth and gain' },
    3: { name: 'Vipat', good: false, plain: 'a star of setbacks, so go carefully' },
    4: { name: 'Kshema', good: true, plain: 'a star of well-being and comfort' },
    5: { name: 'Pratyari', good: false, plain: 'a star of obstacles and push-back' },
    6: { name: 'Sadhaka', good: true, plain: 'a star of achievement' },
    7: { name: 'Vadha', good: false, plain: 'a hard, draining star' },
    8: { name: 'Mitra', good: true, plain: 'a star of friends and support' },
    9: { name: 'Parama Mitra', good: true, plain: 'a star of close friends and good company' },
  } as Record<number, { name: string; good: boolean; plain: string }>,

  /**
   * The special taras counted over 28 stars (Abhijit between Uttara Ashadha and Shravana) [SF], limited to
   * the owner's list 1, 4, 10, 12, 16, 18, 22, 25, 28. [SF] also lists 7 (its death-named tara) and 19, which the
   * owner left out. [SF] gives Manasa as the 25th "or the 11th depending on tradition"; the owner chose 25.
   * Vainashika (22) is "a hard, draining stretch" in output, never the word the source uses.
   */
  specialTaras: {
    1: { name: 'Janma', plain: 'your birth star, the reference point of the chart' },
    4: { name: 'Jati', plain: 'your community and social circle' },
    10: { name: 'Karma', plain: 'your work and profession' },
    12: { name: 'Desha', plain: 'your country, place and culture' },
    16: { name: 'Sanghatika', plain: 'your close group and inner circle' },
    18: { name: 'Samudaya', plain: 'crowds, the wider group' },
    22: { name: 'Vainashika', plain: 'a hard, draining stretch' },
    25: { name: 'Manasa', plain: 'your mind and what it dwells on' },
    28: { name: 'Abhisheka', plain: 'recognition, a coronation of effort' },
  } as Record<number, { name: string; plain: string }>,

  /** Natal Navatara: a planet in these taras from the birth star is weakened for its themes; in these it is emphasised. */
  natalNavatara: {
    weakened: [3, 5, 7] as number[],
    /** Special-tara numbers (28-star count) that emphasise a natal planet: Janma 1, Karma 10, Sanghatika 16. */
    emphasisedSpecial: [1, 10, 16] as number[],
  },

  /** Moorti nirnaya [VJ2]: the transit Moon's house from the natal Moon when a planet changes sign. */
  moorti: {
    swarna: { houses: [1, 6, 11], metal: 'gold', quality: 'very good' },
    rajata: { houses: [2, 5, 9], metal: 'silver', quality: 'good' },
    tamra: { houses: [3, 7, 10], metal: 'copper', quality: 'middling' },
    loha: { houses: [4, 8, 12], metal: 'iron', quality: 'hard' },
  } as Record<'swarna' | 'rajata' | 'tamra' | 'loha', { houses: number[]; metal: string; quality: string }>,

  /**
   * Rahu and Ketu do not cause vedha (owner decision 2026-11-07, which names ashtakvargajyoti.wordpress.com
   * as its source). That page, as read on 2026-11-08, shows the vedha table and the Sun/Saturn and
   * Moon/Mercury exemptions but does NOT say the nodes cannot cause vedha. The owner's rule is applied;
   * the source line is unconfirmed. [PD] says "planets" without naming the nodes either way.
   */
  nodesCauseVedha: false,

  /** Rahu and Ketu take Mars's good houses and vedha points [VB]. */
  nodeGoodHousesLikeMars: true,

  /** Planets whose daily star, tara and house are written down (Moon is handled by its own change list). */
  starPlanets: ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Rahu', 'Ketu'] as ScorePlanet[],
  /** The natal points whose stars a crossing is a trigger for. */
  natalStarPoints: ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu', 'Lagna'] as string[],
} as const;

/**
 * LOCKED 2026-11-06 on the calibration of scripts/varshik-calibrate.ts: base and scale fitted on
 * 300 synthetic charts (3 seeds) and confirmed on 200 more the fit never saw (cell mix 18/40/30/13,
 * 2% of profiles all in one tier, median month range 26). The component weights above were not
 * tuned. Locked means the calibration is done, not that the engine is verified: the Sprint 1
 * engine is still unchecked against JHora, so if any Sprint 1 formula changes, re-run
 * `tsx scripts/varshik-calibrate.ts --n 100 --seeds 20270101,777,4242 --cache <file> --fit`
 * and update base and scale before shipping.
 */
export const VARSHIK_WEIGHTS_STATUS: 'provisional' | 'locked' = 'locked';
// C3 (2026-11-09): re-locked by the owner at base 0.20 / scale 0.40 after the star-family cap (C3.familyCap): cell mix
// 18.6/38.9/29.4/13.1, median month range 31, 0% of profiles in one tier, one profile (s777-c064) at a range of 9.
// A first fit without the cap (0.30 / 0.33) let the Moon-gochar family alone turn three Light Green months into Rust.

/**
 * C2: the natal-promise cap. M.S. Mehta, Annual Horoscope (Varshaphala), ch. XI: "The annual chart
 * cannot give what is not promised in the birth chart" (the book states the rule; the numbers below
 * are ours and are NOT calibrated: C3 recalibrates and the owner agrees before they are locked).
 * A house's promise runs -1 (weak) to +1 (strong) from the natal chart. A good annual signal for
 * that area is held to a ceiling that rises from `floorCeiling` at promise -1 to 1 at promise
 * `fullAt` and above; a bad annual signal is never lifted.
 */
export const NATAL_PROMISE = {
  floorCeiling: 0.4,
  fullAt: 0.3,
  /** Weight of each part of the promise (they are summed, then clamped to -1..+1). */
  lordDignity: 0.6,
  lordInDusthana: -0.35,
  beneficPresence: 0.2,
  maleficPresence: -0.15,
  benefics: ['Jupiter', 'Venus', 'Mercury'] as string[],
  malefics: ['Saturn', 'Mars', 'Rahu', 'Ketu'] as string[],
  dusthana: [6, 8, 12] as number[],
} as const;


// =============================================================================
// C3: the C1 + C2 inputs in the score (Varshik classical completeness, 2026-11-09)
// =============================================================================
// Every number here is OURS (a tuning value), not a quotation. The sources say which rule exists
// (Phaladeepika ch. 26 for good houses and vedha, the Tara and Moorti pages named above, Mehta for
// the Tajika items); none of them gives a weight. They are PROVISIONAL until the owner has seen the
// before/after tier mix and agreed (VARSHIK_WEIGHTS_STATUS above).
//
// All of these are signals in -1..+1, added to the log-odds like the older components:
//   moonGochar  each transiting planet's house from the NATAL MOON (good / blocked by vedha / relieved / hard)
//   moorti      the metal of the planet's last sign change, from the Moon's house then (slow planets)
//   tara        the Navatara of the planet's star from the birth star
//   sensitive   a planet standing in a special tara (Janma, Karma, ...) or in a natal planet's star
//   starLord    the natal role of the lord of the star the planet stands in
//   kakshya     whether the kakshya lord gave the planet a bindu where it stands
//   muddaYogini / patyayini   run alongside Mudda, with the same lord reading
//   annualBala  Harsha + Dwadashavargiya bala, folded into the Year Lord and the three annual dasha lords
//   extraYogas  the 10 further Tajika yogas; lifeSahams the life Sahams, as a steady quiet part
//   natalCap    the C2 natal-promise cap on the annual (Varsha-side) part
// Tri-Pataki is NOT scored: Mehta gives no combined verdict (owner decision 2026-11-08), so it is words only.
// =============================================================================
export const VARSHIK_C3 = {
  components: {
    moonGochar: 0.9,
    moorti: 0.35,
    tara: 0.5,
    sensitive: 0.5,
    starLord: 0.4,
    kakshya: 0.3,
    muddaYogini: 0.5,
    patyayini: 0.35,
    extraYogas: 0.45,
    lifeSahams: 0.4,
  },
  /**
   * No single star family may move an area's log-odds (before `scale`) by more than this, in either direction. Found in C3
   * (2026-11-09): for one test profile the Moon-gochar family alone summed to -2.4 raw (Jupiter and Saturn both in hard houses
   * from the natal Moon), three to four times the next term, and by itself turned three Light Green months into Rust.
   */
  familyCap: { families: ['gochar', 'tara', 'moorti', 'sensitive', 'starLord', 'kakshya'] as string[], raw: 1.2 },
  /** Moon-gochar verdict -> signal. */
  gochar: { good: 1, relieved: 0.4, blocked: -0.2, hard: -0.8, none: 0 } as Record<string, number>,
  /** Moorti metal -> signal; planets it is read for. */
  moortiValue: { swarna: 1, rajata: 0.5, tamra: 0, loha: -0.7 } as Record<string, number>,
  moortiPlanets: ['Saturn', 'Jupiter', 'Rahu', 'Ketu', 'Mars'] as ScorePlanet[],
  /** Tara number (1-9) -> signal. */
  taraValue: { 1: -0.2, 2: 0.7, 3: -0.7, 4: 0.7, 5: -0.5, 6: 0.8, 7: -0.8, 8: 0.6, 9: 0.9 } as Record<number, number>,
  sensitive: {
    /** A special tara or a natal planet's star amplifies the planet's own reading of the day by this much. */
    emphasisGain: 0.8,
    natalStarGain: 0.5,
    /** Fixed signals: Vainashika is a hard, draining stretch; Abhisheka is recognition. */
    vainashika: -0.7,
    abhisheka: 0.5,
    /** The areas each special tara speaks for (full strength); other areas get `otherShare`. */
    areaOf: {
      1: ['health', 'growth'],
      4: ['family', 'love'],
      10: ['career'],
      12: ['travel', 'family'],
      16: ['family', 'love'],
      18: ['growth', 'money'],
      22: ['love', 'career', 'money', 'health', 'family', 'growth', 'travel'],
      25: ['growth', 'health'],
      28: ['career', 'growth'],
    } as Record<number, string[]>,
    otherShare: 0.3,
  },
  /** Planets read through the star-related components (the eight that move in the daily sky; the Moon changes star every day). */
  starPlanets: ['Sun', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Rahu', 'Ketu'] as ScorePlanet[],
  kakshyaPlanets: ['Sun', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'] as ScorePlanet[],

  /** Annual bala: Harsha total is 0-20, Dwadashavargiya 0-12. Share of the lord signal taken from the bala. */
  annualBala: {
    share: 0.25,
    harshaCenter: 10,
    harshaHalfWidth: 10,
    dwadashaCenter: 6,
    dwadashaHalfWidth: 6,
    /** Dwadashavargiya differs from JHora on the Moon and Mercury (fitted friend table), so only these count. */
    dwadashaVerified: ['Sun', 'Mars', 'Jupiter', 'Venus', 'Saturn'] as string[],
  },

  /** The 10 extra Tajika yogas -> signal (ours). Iqbal counts in full only with a strong Lagna lord. */
  extraYogaValue: {
    iqbal: 1,
    'gairi-kamboola': 0.5,
    kuttha: 0.5,
    'duhphali-kuttha': -0.3,
    induvara: -0.4,
    manau: -0.6,
    khallasara: -0.5,
    'dutthottha-davira': -0.4,
    tambira: -0.4,
    durupha: -0.7,
  } as Record<string, number>,
  iqbalWeakLagnesh: 0.3,

  /** Life Sahams -> the area each speaks for. Shatru (rivals) and Jalapatha (crossing water) are left out: their good side is ambiguous. */
  lifeSahamArea: {
    'Yasha (Fame)': 'career',
    'Mitra (Friends)': 'family',
    'Mahatmya (Greatness)': 'growth',
    'Asha (Desires)': 'growth',
    'Samartha (Ability)': 'career',
    'Bhratri (Brothers and sisters)': 'family',
    'Gaurava (Respect)': 'career',
    'Pitru (Father)': 'family',
    'Matru (Mother)': 'family',
    'Jeeva (Vitality)': 'health',
    'Karma (Work)': 'career',
    'Shastra (Learning)': 'growth',
    'Bandhu (Relatives)': 'family',
    'Vanik (Trade)': 'money',
    'Shraddha (Devotion)': 'growth',
    'Preeti (Affection)': 'love',
    'Vyapara (Business)': 'money',
    'Labha (Gain)': 'money',
    'Roga (Health)': 'health',
  } as Record<string, Area>,

  /**
   * The natal-promise cap (natal-promise.ts) is applied to the annual part (Varsha chart, Year Lord, Muntha,
   * the three annual dashas, annual yogas and life Sahams) of each area: its sum, divided by `annualRef`,
   * is held under the ceiling the natal promise of the area's houses allows.
   */
  natalCap: { annualRef: 2.0 },

  /** Patyayini is read by the week (its cut points wander up to 4 days from JHora): days are grouped in blocks of this many. */
  patyayiniBlockDays: 7,
} as const;
