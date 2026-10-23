// =============================================================================
// Daily-return hooks — score weights, in ONE place the owner can tune
// =============================================================================
// These are product choices, not rules from a classical text. The pages that show a score say
// "Aroha score built from ..." and never claim a classical authority for the numbers. Changing a
// weight changes every score at once; the unit tests pin the current values so a change is deliberate.
// =============================================================================

/** Shubh-Labh: how much each ingredient of a stretch of the day counts (they add up to 100). */
export const SHUBH_LABH_WEIGHTS = {
  hora: 25,
  choghadiya: 25,
  tara: 20,
  chandra: 15,
  tithi: 15,
} as const;

/** Added to the score while the stretch sits inside these windows. */
export const SHUBH_LABH_ADJUST = {
  rahuKaal: -45,
  gulikaKaal: -30,
  yamagandaKaal: -30,
  abhijit: 20,
} as const;

/** The score bands of the strip: green from GREEN_MIN, amber from AMBER_MIN, red below. */
export const GREEN_MIN = 70;
export const AMBER_MIN = 45;

/** How well each planetary hour suits money matters (0 to 1). */
export const HORA_FOR_WEALTH: Record<string, number> = {
  Jupiter: 1,
  Venus: 1,
  Mercury: 0.9,
  Moon: 0.7,
  Sun: 0.5,
  Mars: 0.3,
  Saturn: 0.3,
  Rahu: 0.2,
  Ketu: 0.2,
};

/** How well each choghadiya suits money matters (0 to 1). */
export const CHOGHADIYA_FOR_WEALTH: Record<string, number> = {
  Amrit: 1,
  Labh: 1,
  Shubh: 0.9,
  Char: 0.6,
  Udveg: 0.3,
  Kaal: 0.2,
  Rog: 0.2,
};

/** Tithi groups (nanda, bhadra, jaya, rikta, purna) read as how well a day suits starting money matters. */
export const TITHI_GROUP_SCORE: Record<string, number> = {
  nanda: 0.6,
  bhadra: 0.8,
  jaya: 1,
  rikta: 0.1,
  purna: 1,
};

/** Cosmic Receipts: how much each timed card leans on the Moon's aspects by the part of the day. */
export const RECEIPT_ASPECT_ORB_DEG = 3;
export const RECEIPT_ASPECTS = [
  { name: 'conjunction', angle: 0, tone: 'intense' },
  { name: 'sextile', angle: 60, tone: 'easy' },
  { name: 'square', angle: 90, tone: 'friction' },
  { name: 'trine', angle: 120, tone: 'easy' },
  { name: 'opposition', angle: 180, tone: 'friction' },
] as const;

/** Text timing: how much of the score is the Moon's contact with the other person's chart. */
export const TEXT_TIMING_WEIGHTS = { moonToMoon: 40, moonToVenus: 25, moonToMercury: 20, ownMoon: 15 } as const;
export const TEXT_GREEN_MIN = 65;
export const TEXT_AMBER_MIN = 40;

/** Ghar Ka Kavach: beads chanted for the member who needs the most care. */
export const KAVACH_BEADS = 11;
/** Days in a row for the Kalash to be full, and the family week that unlocks the free summary. */
export const KAVACH_FULL_DAYS = 7;

/** Sleep Sync: nights needed before the top and bottom nakshatras are shown, and the report window. */
export const SLEEP_NIGHTS_FOR_PATTERN = 7;
export const SLEEP_REPORT_DAYS = 30;
