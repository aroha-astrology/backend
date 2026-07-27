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
}

export interface PalmMinorLines {
  marriageLines: { count: number; forked?: boolean; islands?: boolean };
  childrenLines: { count: number };
  intuitionLine: { present: boolean };
  travelLines: { count: number };
}

export interface PalmThumbAnalysis {
  flexibility: 'stiff' | 'normal' | 'flexible' | 'hypermobile';
  setAngle: 'high' | 'medium' | 'low';
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
  fingerprints: PalmFingerprint[];
  specialMarkings: PalmSpecialMarking[];
}
