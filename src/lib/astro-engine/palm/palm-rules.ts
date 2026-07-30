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

import type { PalmHandObservations, PalmMounts, PalmSpecialMarking } from './palm-types.js';

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
