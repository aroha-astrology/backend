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
}
