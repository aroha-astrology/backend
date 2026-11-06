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
  /** Log-odds of a day with no signals (0 = a score of 50). Fitted on 300 synthetic charts (3 seeds), 2026-11-06. */
  base: -0.1,
  /** Multiplier on the summed component signals; the second population-level knob. */
  scale: 0.65,

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
    },
    {
      key: 'family_planning',
      areas: { family: 0.5, love: 0.3, health: 0.2 },
      requires: { children: ['planning'] },
    },
    { key: 'move_home', areas: { family: 0.5, money: 0.3, travel: 0.2 } },
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

  /** Dosha activity by month: which planets make each dosha and what wakes it up. */
  dosha: {
    planetsOf: {
      mangal: ['Mars'],
      kaalSarp: ['Rahu', 'Ketu'],
      pitra: ['Sun', 'Rahu'],
      guruChandal: ['Jupiter', 'Rahu'],
      grahan: ['Sun', 'Moon', 'Rahu', 'Ketu'],
      kemadruma: ['Moon'],
    } as Record<string, ScorePlanet[]>,
    /** A slow planet standing in the sign of one of the dosha's natal planets wakes it up. */
    transitTriggers: {
      mangal: ['Mars', 'Saturn'],
      kaalSarp: ['Rahu', 'Ketu', 'Saturn'],
      pitra: ['Saturn', 'Rahu', 'Ketu'],
      guruChandal: ['Jupiter', 'Rahu', 'Saturn'],
      grahan: ['Rahu', 'Ketu'],
      kemadruma: ['Saturn', 'Jupiter'],
    } as Record<string, ScorePlanet[]>,
    /** A trigger counts for a month when it holds on at least this share of its days. */
    minDaysShare: 0.33,
  },

  /** answerWindow: the shortest stretch worth calling a window, and gaps that do not split one. */
  answerWindow: { minRunDays: 7, mergeGapDays: 3 },

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
