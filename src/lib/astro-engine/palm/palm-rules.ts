// =============================================================================
// Palm rules — deterministic feature -> meaning corpus (Hasta Samudrika +
// Western chiromancy)
// =============================================================================
// Stage B (the interpreting LLM) never sees a palm image — it only sees the
// facts this module derives from Stage A's measurements. That split is the
// whole point: a wrong reading here is a fixable bug with a test, not an
// unfixable model quirk (same discipline as match-risks.ts's GROUNDING_RULE
// for the LLM narrative layer — it may only cite facts handed to it).
//
// ANTI-MYTH RULE: life-line LENGTH is never treated as lifespan anywhere in
// this module. Only DEPTH maps to vitality. This is deliberate and tested —
// see palm-rules.test.ts.
// =============================================================================

import type {
  PalmFingerprint,
  PalmHandObservations,
  PalmMounts,
  PalmSpecialMarking,
} from './palm-types.js';

type PalmFingerprintPattern = PalmFingerprint['pattern'];

const FINGERPRINT_MEANING: Record<PalmFingerprintPattern, string> = {
  loop: 'adaptable and people-attuned, taking the shape of the room without losing itself',
  whorl: 'individualistic and self-directed, needing to reach conclusions personally',
  arch: 'grounded, practical and steady, trusting what can be tested',
};

/** Which life domain each finger governs — used only to say WHERE a fingerprint pattern
 * expresses itself, never to invent a second meaning for the pattern. */
const FINGER_DOMAIN: Record<PalmFingerprint['finger'], string> = {
  thumb: 'will and drive',
  index: 'leadership and ambition',
  middle: 'duty and discipline',
  ring: 'creativity and self-expression',
  little: 'communication and commerce',
};

const PHALANGE_MEANING: Record<'top' | 'middle' | 'base', string> = {
  top: 'a mind led by ideas and principle before practicalities',
  middle: 'a temperament led by planning, order and getting the method right',
  base: 'a temperament led by physical, material and sensory reality',
};

export interface PalmRuleFact {
  key: string;
  /** Short factual observation, safe to quote verbatim in the LLM grounding block. */
  evidence: string;
  /** The canonical meaning this observation carries. */
  meaning: string;
  /** Classical citation, e.g. "Hasta Samudrika Shastra" or "Cheiro". */
  source: string;
}

const MOUNT_LABELS: Record<keyof PalmMounts, string> = {
  jupiter: 'Jupiter (Guru)',
  saturn: 'Saturn (Shani)',
  apollo: 'Apollo/Sun (Surya)',
  mercury: 'Mercury (Budha)',
  venus: 'Venus (Shukra)',
  luna: 'Luna/Moon (Chandra)',
  marsUpper: 'Upper Mars',
  marsLower: 'Lower Mars',
  rahuPlain: 'Plain of Mars (Rahu)',
};

const MOUNT_PROMINENT_MEANING: Record<keyof PalmMounts, string> = {
  jupiter: 'strong leadership drive, ambition, and a pull toward dharmic recognition',
  saturn: 'discipline, seriousness, and a strong sense of responsibility',
  apollo: 'creative confidence and a desire for recognition through one’s craft',
  mercury: 'sharp communication and commercial instinct',
  venus: 'strong vitality, warmth, and capacity for physical/emotional connection',
  luna: 'strong intuition and imaginative depth',
  marsUpper: 'moral courage and the ability to hold a position under pressure',
  marsLower: 'physical courage and an assertive, combative streak',
  rahuPlain: 'a restless, unconventional drive that resists the ordinary path',
};

const MOUNT_FLAT_MEANING: Record<keyof PalmMounts, string> = {
  jupiter: 'a quieter relationship to ambition and public recognition',
  saturn: 'a lighter relationship to duty and self-imposed limits',
  apollo: 'creative expression that stays private rather than seeking an audience',
  mercury: 'a more reserved, indirect communication style',
  venus: 'lower baseline vitality or a more guarded approach to closeness',
  luna: 'a more literal, less imagination-led mind',
  marsUpper: 'a tendency to avoid confrontation rather than hold ground',
  marsLower: 'a gentler, less combative temperament',
  rahuPlain: 'a settled, conventional temperament',
};

const HEART_LINE_ENDING_MEANING: Record<string, string> = {
  jupiter: 'idealistic in love, with high standards for a partner',
  saturn: 'practical and cautious in matters of the heart',
  mercury: 'communicative and expressive in relationships',
  percussion: 'guarded emotionally, slow to open up',
};

function pushIfMeaningful(
  facts: PalmRuleFact[],
  key: string,
  evidence: string,
  meaning: string,
  source: string,
): void {
  facts.push({ key, evidence, meaning, source });
}

// CV relief score (0-1, normalized per-hand — see the frontend's mountRelief.ts) buckets:
// below this = the CV pass independently reads the mount as flat; above this = prominent.
// Anything in between is a neutral middle band that neither corroborates nor contradicts the
// vision model's own categorical rating — only a clear disagreement between the two
// independent measurements is worth surfacing (see the "neutral middle band" test).
const CV_FLAT_THRESHOLD = 0.35;
const CV_PROMINENT_THRESHOLD = 0.65;

/**
 * Derive grounding facts from ONE hand's Stage-A observations, optionally cross-checked
 * against client-computed CV mount-relief scores (see the frontend's
 * lib/palm/computeMountRelief.ts: MediaPipe hand-landmark detection anchors each mount's
 * pixel region, then a luminance-variance pass scores it). This is the accuracy improvement
 * discussed with the user: a SECOND, independent, deterministic measurement of mount
 * development to check the vision model's own holistic judgment against — never a
 * replacement for it, and entirely optional (omitting `mountRelief` reproduces the exact
 * facts this function has always produced, see the "backward compatible" test).
 *
 * Deterministic, pure, no I/O. Returns [] for a featureless/all-"normal" hand rather than
 * inventing signal — see the "featureless hand" test.
 */
export function matchPalmRules(
  hand: PalmHandObservations,
  mountRelief?: Record<string, number>,
): PalmRuleFact[] {
  const facts: PalmRuleFact[] = [];

  // --- Mounts -----------------------------------------------------------
  for (const key of Object.keys(hand.mounts) as Array<keyof PalmMounts>) {
    const development = hand.mounts[key];
    const label = MOUNT_LABELS[key];
    if (development === 'prominent') {
      pushIfMeaningful(
        facts,
        `mount.${key}.prominent`,
        `Mount of ${label} is prominent.`,
        MOUNT_PROMINENT_MEANING[key],
        'Hasta Samudrika Shastra',
      );
    } else if (development === 'flat') {
      pushIfMeaningful(
        facts,
        `mount.${key}.flat`,
        `Mount of ${label} is flat.`,
        MOUNT_FLAT_MEANING[key],
        'Hasta Samudrika Shastra',
      );
    }

    // Cross-check against the independent CV relief measurement, if one was captured for
    // this mount. Only meaningful when the vision model committed to flat or prominent —
    // there's nothing to corroborate or contradict against a "normal" rating.
    const relief = mountRelief?.[key];
    if (relief === undefined || development === 'normal') continue;
    const cvSaysFlat = relief < CV_FLAT_THRESHOLD;
    const cvSaysProminent = relief > CV_PROMINENT_THRESHOLD;
    const agrees =
      (development === 'prominent' && cvSaysProminent) || (development === 'flat' && cvSaysFlat);
    const disagrees =
      (development === 'prominent' && cvSaysFlat) || (development === 'flat' && cvSaysProminent);

    if (agrees) {
      pushIfMeaningful(
        facts,
        `mount.${key}.corroborated`,
        `Mount of ${label}'s ${development} development is independently corroborated by computer-vision image analysis of the same photograph.`,
        'This is a strong signal — two independent measurements (the vision reading and a separate pixel-level relief analysis) confirm each other, so this observation can be treated with high confidence.',
        'CV cross-validation (MediaPipe landmark-anchored relief analysis)',
      );
    } else if (disagrees) {
      pushIfMeaningful(
        facts,
        `mount.${key}.disagreement`,
        `Mount of ${label} was read as ${development} by the vision model, but independent computer-vision relief analysis of the same photograph disagrees.`,
        'Treat this specific mount reading with caution — the two measurements are mixed, so this observation is less certain than the others.',
        'CV cross-validation (MediaPipe landmark-anchored relief analysis)',
      );
    }
  }

  // --- Heart line ---------------------------------------------------------
  const heart = hand.majorLines.heartLine;
  if (heart.present && heart.endingPosition && HEART_LINE_ENDING_MEANING[heart.endingPosition]) {
    pushIfMeaningful(
      facts,
      `heartLine.endingPosition.${heart.endingPosition}`,
      `Heart line ends under the Mount of ${MOUNT_LABELS[heart.endingPosition as keyof PalmMounts] ?? heart.endingPosition}.`,
      HEART_LINE_ENDING_MEANING[heart.endingPosition]!,
      'Cheiro / Western chiromancy',
    );
  }
  if (heart.present && heart.chains) {
    pushIfMeaningful(
      facts,
      'heartLine.chains',
      'Heart line shows chaining.',
      'periods of emotional turbulence or indecision in relationships',
      'Hasta Samudrika Shastra',
    );
  }

  if (heart.present && heart.depth === 'deep') {
    pushIfMeaningful(
      facts,
      'heartLine.depth.deep',
      'Heart line is deeply etched.',
      'feelings run strong and are held a long time; loyalty is intense, and so is hurt',
      'Cheiro / Western chiromancy',
    );
  } else if (heart.present && heart.depth === 'faint') {
    pushIfMeaningful(
      facts,
      'heartLine.depth.faint',
      'Heart line is faintly etched.',
      'a cooler, more private emotional register — affection shown through action rather than words',
      'Cheiro / Western chiromancy',
    );
  }
  if (heart.present && heart.length === 'long') {
    pushIfMeaningful(
      facts,
      'heartLine.length.long',
      'Heart line runs long across the palm.',
      'a generous, other-centred way of loving, sometimes at the cost of the self',
      'Cheiro / Western chiromancy',
    );
  } else if (heart.present && heart.length === 'short') {
    pushIfMeaningful(
      facts,
      'heartLine.length.short',
      'Heart line is short.',
      'a self-contained emotional life with a small, deliberately chosen inner circle',
      'Cheiro / Western chiromancy',
    );
  }
  if (heart.present && (heart.breaks ?? 0) > 0) {
    pushIfMeaningful(
      facts,
      'heartLine.breaks',
      `Heart line shows ${heart.breaks} break(s).`,
      'a decisive emotional turning point that reshapes how this person attaches — not a verdict on any one relationship',
      'Hasta Samudrika Shastra',
    );
  }
  if (heart.present && heart.forks) {
    pushIfMeaningful(
      facts,
      'heartLine.forked',
      'Heart line forks at its end.',
      'the classical balance of head and heart in love — able to feel deeply without losing judgement',
      'Cheiro / Western chiromancy',
    );
  }

  // --- Head line ------------------------------------------------------
  const head = hand.majorLines.headLine;
  if (head.present && head.separation === 'very separated') {
    pushIfMeaningful(
      facts,
      'headLine.separation.verySeparated',
      'Head line is widely separated from the life line at its origin.',
      'early independence of thought, and a tendency toward impulsive decisions',
      'Cheiro / Hasta Samudrika Shastra',
    );
  }

  if (head.present && head.length === 'long') {
    pushIfMeaningful(
      facts,
      'headLine.length.long',
      'Head line runs long across the palm.',
      'a thorough, analytical mind that likes to follow a thought all the way down',
      'Cheiro / Hasta Samudrika Shastra',
    );
  } else if (head.present && head.length === 'short') {
    pushIfMeaningful(
      facts,
      'headLine.length.short',
      'Head line is short.',
      'a decisive, practical mind that prefers acting to deliberating — this is about style of thought, never about intelligence',
      'Cheiro / Hasta Samudrika Shastra',
    );
  }
  if (head.present && head.depth === 'deep') {
    pushIfMeaningful(
      facts,
      'headLine.depth.deep',
      'Head line is deeply etched.',
      'sustained concentration and a retentive memory',
      'Hasta Samudrika Shastra',
    );
  }
  if (head.present && (head.islands ?? 0) > 0) {
    pushIfMeaningful(
      facts,
      'headLine.islands',
      `Head line shows ${head.islands} island(s).`,
      'a stretch of mental strain or scattered focus to manage deliberately — rest and routine matter more than usual through it',
      'Hasta Samudrika Shastra',
    );
  }
  if (head.present && head.separation === 'attached to life') {
    pushIfMeaningful(
      facts,
      'headLine.separation.attached',
      'Head line begins joined to the life line.',
      'a cautious start closely tied to family expectation, with independence arriving later and deliberately',
      'Cheiro / Hasta Samudrika Shastra',
    );
  }

  // --- Life line — vitality from DEPTH only. Length is deliberately never
  // read here; see the anti-myth rule in the module header. -----------------
  const life = hand.majorLines.lifeLine;
  if (life.present && life.depth === 'deep') {
    pushIfMeaningful(
      facts,
      'lifeLine.depth.deep',
      'Life line is deeply and clearly etched.',
      'strong baseline vitality and physical constitution',
      'Hasta Samudrika Shastra',
    );
  } else if (life.present && life.depth === 'faint') {
    pushIfMeaningful(
      facts,
      'lifeLine.depth.faint',
      'Life line is faintly etched.',
      'more delicate energy reserves — not a statement about lifespan, only about day-to-day vitality',
      'Hasta Samudrika Shastra',
    );
  }
  if (life.present && (life.islands ?? 0) > 0) {
    pushIfMeaningful(
      facts,
      'lifeLine.islands',
      `Life line shows ${life.islands} island(s).`,
      'a period of depleted energy or a health event to watch, not a fixed outcome',
      'Hasta Samudrika Shastra',
    );
  }

  // --- Fate line ------------------------------------------------------
  const fate = hand.majorLines.fateLine;
  if (!fate.present) {
    pushIfMeaningful(
      facts,
      'fateLine.absent',
      'No clear fate line is visible.',
      'a self-directed, free-form path rather than one shaped by external structure',
      'Hasta Samudrika Shastra',
    );
  }

  if (fate.present && fate.depth === 'deep') {
    pushIfMeaningful(
      facts,
      'fateLine.depth.deep',
      'Fate line is deeply and clearly etched.',
      'a strong sense of vocation — work and identity are closely bound together',
      'Hasta Samudrika Shastra',
    );
  }
  if (fate.present && (fate.breaks ?? 0) > 0) {
    pushIfMeaningful(
      facts,
      'fateLine.breaks',
      `Fate line shows ${fate.breaks} break(s).`,
      'one or more deliberate changes of direction in working life — classically a redirection, not a failure',
      'Hasta Samudrika Shastra',
    );
  }

  // --- Sun/health lines and the ring lines --------------------------------
  const sun = hand.majorLines.sunLine;
  if (sun?.present) {
    pushIfMeaningful(
      facts,
      'sunLine.present',
      'A sun (Apollo) line is visible.',
      'recognition earned through the work itself rather than through position — reputation that follows the craft',
      'Hasta Samudrika Shastra',
    );
  }
  const health = hand.majorLines.healthLine;
  if (health?.present) {
    pushIfMeaningful(
      facts,
      'healthLine.present',
      'A health (Mercury) line is visible.',
      'a constitution that registers stress physically first — classically a prompt toward routine and digestion care, never a statement of illness',
      'Hasta Samudrika Shastra',
    );
  } else if (health && health.present === false) {
    pushIfMeaningful(
      facts,
      'healthLine.absent',
      'No health (Mercury) line is visible.',
      'classically the more fortunate reading — a robust constitution that does not carry stress in the body',
      'Hasta Samudrika Shastra',
    );
  }
  if (hand.majorLines.girdleOfVenus?.present) {
    pushIfMeaningful(
      facts,
      'girdleOfVenus.present',
      'A girdle of Venus is visible above the heart line.',
      'heightened sensitivity and aesthetic responsiveness; strong feeling that needs a creative outlet to sit comfortably',
      'Cheiro / Western chiromancy',
    );
  }
  if (hand.majorLines.ringOfSolomon?.present) {
    pushIfMeaningful(
      facts,
      'ringOfSolomon.present',
      'A ring of Solomon is visible at the base of the index finger.',
      'a natural aptitude for understanding people — the classical teacher and counsellor mark',
      'Hasta Samudrika Shastra',
    );
  }
  if (hand.majorLines.simianLine?.present) {
    pushIfMeaningful(
      facts,
      'simianLine.present',
      'Heart and head lines run together as a single simian crease.',
      'unusual singleness of purpose — thought and feeling pull one way at a time, which brings great focus and little middle ground. An ordinary hand variation, not a defect and not a medical finding.',
      'Hasta Samudrika Shastra',
    );
  }

  // --- Minor lines — the percussion-edge features ---------------------
  const marriage = hand.minorLines.marriageLines;
  if (marriage.count >= 2) {
    pushIfMeaningful(
      facts,
      'marriageLines.multipleCount',
      `${marriage.count} marriage/union lines visible on the percussion edge.`,
      'more than one deeply significant partnership across the lifetime',
      'Hasta Samudrika Shastra',
    );
  }
  if (marriage.forked) {
    pushIfMeaningful(
      facts,
      'marriageLines.forked',
      'A marriage line forks at its end.',
      'a risk of separation or a significant turning point within that union',
      'Hasta Samudrika Shastra',
    );
  }
  if (hand.minorLines.intuitionLine.present) {
    pushIfMeaningful(
      facts,
      'intuitionLine.present',
      'An intuition line is visible on the percussion edge (Mount of Luna).',
      'above-average intuitive or empathic sensitivity',
      'Hasta Samudrika Shastra',
    );
  }

  if (hand.minorLines.travelLines.count >= 2) {
    pushIfMeaningful(
      facts,
      'travelLines.multiple',
      `${hand.minorLines.travelLines.count} travel lines visible on the percussion edge.`,
      'a life that moves — relocation, or work that repeatedly takes this person away from where they started',
      'Hasta Samudrika Shastra',
    );
  }
  if (hand.minorLines.childrenLines.count > 0) {
    pushIfMeaningful(
      facts,
      'childrenLines.count',
      `${hand.minorLines.childrenLines.count} children line(s) visible.`,
      'classically read as significant nurturing bonds rather than a literal count of births — care given, never a prediction of how many',
      'Hasta Samudrika Shastra',
    );
  }
  const bracelets = hand.minorLines.bracelets;
  if (bracelets && bracelets.count >= 3) {
    pushIfMeaningful(
      facts,
      'bracelets.three',
      `${bracelets.count} wrist bracelets (rascettes) are visible.`,
      'the classical auspicious count — a settled, well-supported foundation to build on',
      'Hasta Samudrika Shastra',
    );
  } else if (bracelets && bracelets.count > 0 && bracelets.firstClear === false) {
    pushIfMeaningful(
      facts,
      'bracelets.firstUnclear',
      'The first wrist bracelet is broken or unclear.',
      'a prompt toward steady routine and rest in the early years — guidance on habit, never a health verdict',
      'Hasta Samudrika Shastra',
    );
  }

  // --- Thumb ------------------------------------------------------------
  if (hand.thumb.flexibility === 'hypermobile' || hand.thumb.flexibility === 'flexible') {
    pushIfMeaningful(
      facts,
      'thumb.flexible',
      `Thumb flexibility is ${hand.thumb.flexibility}.`,
      'adaptable, open to persuasion, comfortable improvising',
      'Hasta Samudrika Shastra',
    );
  } else if (hand.thumb.flexibility === 'stiff') {
    pushIfMeaningful(
      facts,
      'thumb.stiff',
      'Thumb flexibility is stiff.',
      'strong-willed, disciplined, resistant to changing course once decided',
      'Hasta Samudrika Shastra',
    );
  }

  if (hand.thumb.setAngle === 'low') {
    pushIfMeaningful(
      facts,
      'thumb.setAngle.low',
      'The thumb is set low on the hand, opening wide from the palm.',
      'generosity and an open, unguarded manner — gives easily, sometimes before checking',
      'Hasta Samudrika Shastra',
    );
  } else if (hand.thumb.setAngle === 'high') {
    pushIfMeaningful(
      facts,
      'thumb.setAngle.high',
      'The thumb is set high and close to the palm.',
      'a careful, self-protective streak — commitments are weighed before they are given',
      'Hasta Samudrika Shastra',
    );
  }

  // --- Fingers ------------------------------------------------------------
  const fingers = hand.fingers;
  if (fingers?.indexVsRing === 'indexLonger') {
    pushIfMeaningful(
      facts,
      'fingers.indexLonger',
      'The index (Jupiter) finger is longer than the ring (Apollo) finger.',
      'a natural pull toward leading, teaching and taking responsibility for others',
      'Hasta Samudrika Shastra',
    );
  } else if (fingers?.indexVsRing === 'ringLonger') {
    pushIfMeaningful(
      facts,
      'fingers.ringLonger',
      'The ring (Apollo) finger is longer than the index (Jupiter) finger.',
      'a pull toward expression, performance and risk over formal authority',
      'Hasta Samudrika Shastra',
    );
  }
  if (fingers?.littleFingerSet === 'low') {
    pushIfMeaningful(
      facts,
      'fingers.littleFingerLowSet',
      'The little (Mercury) finger is set low on the hand.',
      'a slower start in making oneself heard — communication and confidence that arrive with experience rather than early',
      'Cheiro / Western chiromancy',
    );
  }
  if (fingers?.spacing === 'wide') {
    pushIfMeaningful(
      facts,
      'fingers.spacingWide',
      'The fingers spread widely apart when the hand is open.',
      'an independent, unconstrained temperament that resists being managed',
      'Hasta Samudrika Shastra',
    );
  } else if (fingers?.spacing === 'tight') {
    pushIfMeaningful(
      facts,
      'fingers.spacingTight',
      'The fingers stay close together when the hand is open.',
      'caution and a preference for security over exposure',
      'Hasta Samudrika Shastra',
    );
  }
  if (fingers?.dominantPhalange && fingers.dominantPhalange !== 'even') {
    pushIfMeaningful(
      facts,
      `fingers.dominantPhalange.${fingers.dominantPhalange}`,
      `The ${fingers.dominantPhalange} phalanges are the most developed across the fingers.`,
      PHALANGE_MEANING[fingers.dominantPhalange],
      'Hasta Samudrika Shastra',
    );
  }

  // --- Fingerprints — measured by Stage A and, until now, never read ------
  for (const print of hand.fingerprints) {
    const meaning = FINGERPRINT_MEANING[print.pattern];
    if (!meaning) continue;
    pushIfMeaningful(
      facts,
      `fingerprint.${print.finger}.${print.pattern}`,
      `The ${print.finger} carries a ${print.pattern} fingerprint pattern.`,
      `${meaning} — read through the ${FINGER_DOMAIN[print.finger] ?? 'general'} domain that finger governs`,
      'Hasta Samudrika Shastra',
    );
  }

  // --- Special markings ---------------------------------------------------
  for (const marking of hand.specialMarkings) {
    pushIfMeaningful(
      facts,
      `marking.${marking.symbol}`,
      `A ${marking.symbol} marking is visible at ${marking.location}.`,
      SPECIAL_MARKING_MEANING[marking.symbol],
      'Hasta Samudrika Shastra',
    );
  }

  return facts;
}

const SPECIAL_MARKING_MEANING: Record<PalmSpecialMarking['symbol'], string> = {
  star: 'a sudden, notable event of fortune or fame tied to that mount’s domain',
  triangle: 'a protected, well-channeled talent in that area of the hand',
  square: 'a period of protection during hardship in that domain',
  cross: 'an obstacle or karmic lesson to work through in that domain',
  fish: 'spiritual prosperity and good fortune (classically read at the life line’s end)',
  trident: 'a marked, almost providential blessing in that domain',
  mysticCross: 'an inclination toward the mystical or metaphysical',
  yava: 'a mark classically associated with unusually good fortune',
  shankh: 'devotion and scholarly inclination',
};
