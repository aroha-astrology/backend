/* -------------------------------------------------------------------------- */
/* palm-types.ts — the Stage A / observation contract                        */
/*                                                                             */
/* This is the shape Stage A (vision, temp 0.1) is instructed to return, and  */
/* the ONLY input palm-rules.ts and Stage B ever see. It carries measurements */
/* only — no interpretation, no prose. Ported/condensed from the legacy       */
/* JSON_SCHEMA in the dormant apps/api/src/lib/palm/bedrockAnalysis.ts.       */
/* -------------------------------------------------------------------------- */

export type Development = 'flat' | 'normal' | 'prominent';
export type LineDepth = 'faint' | 'medium' | 'deep';
export type LineLength = 'short' | 'medium' | 'long';

export interface PalmImageQuality {
  score: number; // 0-10 overall
  lineVisibility: number;
  lighting: number;
  focus: number;
  framing: number;
}

export interface PalmHandType {
  element: 'Earth' | 'Air' | 'Fire' | 'Water';
  palmShape: 'square' | 'rectangular' | 'narrow' | 'wide';
  skinTexture: 'coarse' | 'medium' | 'fine';
}

export interface PalmMounts {
  jupiter: Development;
  saturn: Development;
  apollo: Development;
  mercury: Development;
  venus: Development;
  luna: Development;
  marsUpper: Development;
  marsLower: Development;
  rahuPlain: Development;
}

export interface PalmMajorLine {
  present: boolean;
  length?: LineLength;
  depth?: LineDepth;
  breaks?: number;
  islands?: number;
  forks?: boolean;
  chains?: boolean;
  endingPosition?: string;
  separation?: string;
  polyline?: Array<[number, number]>;
  /** The vision model's own 0-1 confidence that its path follows the real crease. */
  confidence?: number;
  /** Crease-snap verdict on `polyline` (see lib/palm/crease-snap.ts). The overlay draws a line
   * only when `drawable` is true; a line without a verdict (older readings) is never drawn. */
  trace?: PalmLineTrace;
}

export interface PalmLineTrace {
  /** Share of the snapped path that sits on a visible crease (0-1). */
  support: number;
  /** Share of the path that looks like the hand's outline rather than a crease (0-1). */
  edgeFraction: number;
  drawable: boolean;
}

/** Lines the timing marks may sit on — the ones classical palmistry dates events along. */
export type PalmTimedLine = 'lifeLine' | 'headLine' | 'fateLine' | 'sunLine' | 'heartLine';

export type PalmMarkKind =
  | 'break'
  | 'branchUp'
  | 'branchDown'
  | 'fork'
  | 'lineStarts'
  | 'influenceJoins'
  | 'island'
  | 'star'
  | 'cross';

/** A measured feature at one point along a line — geometry only; what it means is decided in
 * palm-timing.ts, never by the vision model. `point` is 0-1 on the front photo. */
export interface PalmTimingMark {
  line: PalmTimedLine;
  mark: PalmMarkKind;
  point: [number, number];
  confidence: number;
}

/** One marriage (relationship) line on the percussion edge, as a position between the heart
 * line (0) and the base of the little finger (1) — read from the side view, where they show. */
export interface PalmMarriageLine {
  position: number;
  length: LineLength;
  depth: LineDepth;
}

export interface PalmMajorLines {
  lifeLine: PalmMajorLine;
  heartLine: PalmMajorLine;
  headLine: PalmMajorLine;
  fateLine: PalmMajorLine;
  sunLine?: PalmMajorLine;
  healthLine?: PalmMajorLine;
  girdleOfVenus?: PalmMajorLine;
  ringOfSolomon?: PalmMajorLine;
  simianLine?: PalmMajorLine;
}

/** Every traceable line key, in the order the annotated overlay draws them. Shared with the
 * frontend's PalmAnnotatedView colour map and Stage B's `lineNotes` keying — the ids are the
 * contract between the three, which is why the UI can key straight into lineNotes instead of
 * fuzzy-matching a section heading. */
export const PALM_LINE_KEYS = [
  'heartLine',
  'headLine',
  'lifeLine',
  'fateLine',
  'sunLine',
  'healthLine',
  'girdleOfVenus',
  'ringOfSolomon',
  'simianLine',
] as const;

export type PalmLineKey = (typeof PALM_LINE_KEYS)[number];

export interface PalmMinorLines {
  marriageLines: { count: number; forked?: boolean; islands?: boolean };
  childrenLines: { count: number };
  intuitionLine: { present: boolean };
  travelLines: { count: number };
  /** Rascettes — the wrist bracelets. Classically 3 well-formed bracelets is the auspicious
   * count; the first one's clarity is what carries meaning, not a promise about lifespan. */
  bracelets?: { count: number; firstClear?: boolean };
}

export interface PalmThumbAnalysis {
  flexibility: 'stiff' | 'normal' | 'flexible' | 'hypermobile';
  setAngle: 'high' | 'medium' | 'low';
}

export interface PalmFingerAnalysis {
  /** Index vs ring finger relative length — a classical temperament marker (Jupiter vs Apollo
   * dominance), and one of the few finger facts readable from a plain front-view photo. */
  indexVsRing: 'indexLonger' | 'equal' | 'ringLonger';
  /** Whether the little finger reaches past the top crease of the ring finger's upper phalange. */
  littleFingerSet: 'low' | 'normal' | 'high';
  /** Which of the three phalange bands is visibly dominant across the fingers overall. */
  dominantPhalange: 'top' | 'middle' | 'base' | 'even';
  spacing: 'tight' | 'normal' | 'wide';
}

export interface PalmFingerprint {
  finger: 'thumb' | 'index' | 'middle' | 'ring' | 'little';
  pattern: 'loop' | 'whorl' | 'arch';
}

export interface PalmSpecialMarking {
  symbol:
    | 'star'
    | 'triangle'
    | 'square'
    | 'cross'
    | 'fish'
    | 'trident'
    | 'mysticCross'
    | 'yava'
    | 'shankh';
  location: string;
}

/** The full Stage-A observation set for one hand. */
export interface PalmHandObservations {
  hand: 'left' | 'right';
  imageQuality: PalmImageQuality;
  handType: PalmHandType;
  mounts: PalmMounts;
  majorLines: PalmMajorLines;
  minorLines: PalmMinorLines;
  thumb: PalmThumbAnalysis;
  fingers?: PalmFingerAnalysis;
  fingerprints: PalmFingerprint[];
  specialMarkings: PalmSpecialMarking[];
  /** Which hand the vision pass saw in the photograph — compared against the hand the user was
   * asked to photograph, so a reading of the wrong hand is flagged instead of silently read. */
  detectedHand?: 'left' | 'right' | 'unknown';
  /** How the hand lies in the front photo; timing geometry is only computed for fingersUp. */
  orientation?: 'fingersUp' | 'fingersDown' | 'fingersLeft' | 'fingersRight';
  /** The palm (not fingers) on the front photo, 0-1: [xMin, yMin, xMax, yMax]. */
  palmBox?: [number, number, number, number];
  timingMarks?: PalmTimingMark[];
  marriageLines?: PalmMarriageLine[];
}
