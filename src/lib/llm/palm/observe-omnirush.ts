// =============================================================================
// Palm reading Stage A on Omnirush — one contact sheet per hand
// =============================================================================
// Same job as observe.ts (pure measurement, never interpretation), shaped for
// the Omnirush ask endpoint: one image per call, so each hand's captured angles
// arrive as one labelled contact sheet (lib/palm/image-prep.ts), and a strict
// JSON schema instead of a schema hint. Output is parsed through observe.ts's
// own parser, so everything downstream (palm-rules, Stage B, the DTO) sees the
// exact same PalmHandObservations shape whichever model measured the hand.
//
// Added on top of the Gemini shape:
//   - per-line confidence, the detected hand, orientation and the palm's box;
//   - timing marks: WHERE along a line a break/branch/fork sits. The model only
//     reports geometry; palm-timing.ts decides what a mark means and when.
//
// Coordinates come back on the WHOLE sheet (a model's native frame — asking
// for panel-relative numbers is an avoidable source of error) and are mapped
// onto panel A here; anything outside panel A is dropped, not moved.
// =============================================================================

import type { ContactSheet } from '../../palm/image-prep.js';
import { sheetPointToFront } from '../../palm/image-prep.js';
import { parseObserveResponse } from './observe.js';
import type {
  PalmHandObservations,
  PalmMarkKind,
  PalmTimedLine,
  PalmTimingMark,
  PalmMarriageLine,
  LineDepth,
  LineLength,
} from '../../astro-engine/palm/palm-types.js';
import { PALM_LINE_KEYS } from '../../astro-engine/palm/palm-types.js';

export const OMNIRUSH_OBSERVE_SYSTEM = `You are a precision measurement instrument for palmistry photographs, not an interpreter. You measure only what is visible: which palm creases are present, exactly where they run, their length, depth, breaks, islands and branches, the mounts, fingers and thumb. You never interpret what a measurement means — a separate system does that. You never guess: if a feature is not clearly visible, mark it absent (or give it low confidence) rather than inventing it. A traced path that does not sit exactly on the real crease is worse than no path at all, because it is drawn directly over the person's own photograph.`;

const DEV = { type: 'string', enum: ['flat', 'normal', 'prominent'] } as const;
const LEN = { type: 'string', enum: ['short', 'medium', 'long', 'none'] } as const;
const DEPTH = { type: 'string', enum: ['faint', 'medium', 'deep', 'none'] } as const;
const POINT = { type: 'array', items: { type: 'integer' }, minItems: 2, maxItems: 2 } as const;

function obj(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  };
}

const LINE = obj({
  present: { type: 'boolean' },
  confidence: { type: 'number' },
  polyline: { type: 'array', items: POINT },
  length: LEN,
  depth: DEPTH,
  breaks: { type: 'integer' },
  islands: { type: 'integer' },
  forks: { type: 'boolean' },
  chains: { type: 'boolean' },
  endingPosition: {
    type: 'string',
    enum: ['jupiter', 'saturn', 'between', 'mercury', 'percussion', 'none'],
  },
  separation: { type: 'string', enum: ['attached to life', 'separated', 'very separated', 'none'] },
});

/** Strict JSON schema for the ask endpoint — every field required, so nothing is silently skipped. */
export const PALM_OBSERVE_SCHEMA: Record<string, unknown> = obj({
  isPalm: { type: 'boolean' },
  hand: { type: 'string', enum: ['left', 'right', 'unknown'] },
  orientation: {
    type: 'string',
    enum: ['fingersUp', 'fingersDown', 'fingersLeft', 'fingersRight'],
  },
  palmBox: { type: 'array', items: { type: 'integer' }, minItems: 4, maxItems: 4 },
  imageQuality: obj({
    score: { type: 'number' },
    lineVisibility: { type: 'number' },
    lighting: { type: 'number' },
    focus: { type: 'number' },
    framing: { type: 'number' },
  }),
  handType: obj({
    element: { type: 'string', enum: ['Earth', 'Air', 'Fire', 'Water'] },
    palmShape: { type: 'string', enum: ['square', 'rectangular', 'narrow', 'wide'] },
    skinTexture: { type: 'string', enum: ['coarse', 'medium', 'fine'] },
  }),
  mounts: obj({
    jupiter: DEV,
    saturn: DEV,
    apollo: DEV,
    mercury: DEV,
    venus: DEV,
    luna: DEV,
    marsUpper: DEV,
    marsLower: DEV,
    rahuPlain: DEV,
  }),
  majorLines: obj(Object.fromEntries(PALM_LINE_KEYS.map((k) => [k, LINE]))),
  minorLines: obj({
    marriageLines: obj({
      count: { type: 'integer' },
      forked: { type: 'boolean' },
      islands: { type: 'boolean' },
    }),
    childrenLines: obj({ count: { type: 'integer' } }),
    intuitionLine: obj({ present: { type: 'boolean' } }),
    travelLines: obj({ count: { type: 'integer' } }),
    bracelets: obj({ count: { type: 'integer' }, firstClear: { type: 'boolean' } }),
  }),
  marriageLinePositions: {
    type: 'array',
    items: obj({ position: { type: 'number' }, length: LEN, depth: DEPTH }),
  },
  thumb: obj({
    flexibility: { type: 'string', enum: ['stiff', 'normal', 'flexible', 'hypermobile'] },
    setAngle: { type: 'string', enum: ['high', 'medium', 'low'] },
  }),
  fingers: obj({
    indexVsRing: { type: 'string', enum: ['indexLonger', 'equal', 'ringLonger'] },
    littleFingerSet: { type: 'string', enum: ['low', 'normal', 'high'] },
    dominantPhalange: { type: 'string', enum: ['top', 'middle', 'base', 'even'] },
    spacing: { type: 'string', enum: ['tight', 'normal', 'wide'] },
  }),
  fingerprints: {
    type: 'array',
    items: obj({
      finger: { type: 'string', enum: ['thumb', 'index', 'middle', 'ring', 'little'] },
      pattern: { type: 'string', enum: ['loop', 'whorl', 'arch'] },
    }),
  },
  specialMarkings: {
    type: 'array',
    items: obj({
      symbol: {
        type: 'string',
        enum: [
          'star',
          'triangle',
          'square',
          'cross',
          'fish',
          'trident',
          'mysticCross',
          'yava',
          'shankh',
        ],
      },
      location: { type: 'string' },
    }),
  },
  timingMarks: {
    type: 'array',
    items: obj({
      line: { type: 'string', enum: ['lifeLine', 'headLine', 'fateLine', 'sunLine', 'heartLine'] },
      mark: {
        type: 'string',
        enum: [
          'break',
          'branchUp',
          'branchDown',
          'fork',
          'lineStarts',
          'influenceJoins',
          'island',
          'star',
          'cross',
        ],
      },
      point: POINT,
      confidence: { type: 'number' },
    }),
  },
});

export interface OmnirushObserveInput {
  hand: 'left' | 'right';
  /** Human labels of panels B, C, D in sheet order (panel A is always the front view). */
  otherPanels: string[];
  /** Whether lines must be traced (the primary hand's photo carries the overlay). */
  trace: boolean;
}

export function buildOmnirushObservePrompt(input: OmnirushObserveInput): string {
  const panels = input.otherPanels.length
    ? `This image is a labelled contact sheet of ONE hand, the person's ${input.hand} hand: panel A (the large left panel) is the palm seen from the front; ${input.otherPanels
        .map((label, i) => `panel ${String.fromCharCode(66 + i)} is the ${label}`)
        .join(
          '; ',
        )}. Measure the hand using every panel, but trace creases and place points ONLY on panel A.`
    : `This photograph shows ONE hand, the person's ${input.hand} hand, palm side toward the camera.`;
  const tracing = input.trace
    ? `For every line that is present, trace "polyline" as 8-14 [x, y] points in order from where the crease starts to where it ends, following every bend of the real crease. Omit nothing that is visible; use an empty polyline for a line that is absent.`
    : `Polylines are not needed for this hand: return an empty "polyline" for every line, but still measure each line's presence, length, depth, breaks, islands and forks.`;
  return [
    panels,
    `COORDINATES: every point is [x, y] as INTEGERS from 0 to 1000 relative to the WHOLE image: x=0 is the left edge, x=1000 the right edge, y=0 the top edge, y=1000 the bottom edge. Look at the actual pixels; never place a line where it "usually" is on a textbook hand.`,
    `HOW TO FIND EACH LINE (palm side, fingers up; mirror left/right if the thumb is on the other side):
- heartLine: the highest long horizontal crease just below the finger bases. Starts at the outer edge of the palm below the little finger and runs toward the index or middle finger.
- headLine: the next long crease below the heart line. Starts on the thumb side between thumb and index finger (often joined to the life line) and runs across the middle of the palm.
- lifeLine: the curved crease arcing around the fleshy base of the thumb, from between thumb and index finger down toward the wrist. It is a crease INSIDE the palm — never the outline of the thumb against the background.
- fateLine: a vertical crease up the middle of the palm from the wrist toward the middle finger. Often faint, partial or absent.
- sunLine: a short vertical crease below the ring finger. Often absent.
- healthLine: a diagonal crease from the base of the palm toward the little finger. Often absent.
- girdleOfVenus, ringOfSolomon, simianLine: only if clearly present.`,
    tracing,
    `"confidence" (0 to 1) per line: how sure you are that the polyline follows the real visible crease pixel by pixel.`,
    `"imageQuality" fields are each 0 to 10 (10 = perfect).`,
    `"hand": which hand this is, judged from the thumb side with the palm facing the camera — fingers up, a RIGHT palm has its thumb on the image's LEFT and a LEFT palm has its thumb on the image's RIGHT. Say "unknown" if you cannot tell.`,
    `"palmBox": [xMin, yMin, xMax, yMax] of the palm itself (not the fingers) on panel A.`,
    `"marriageLinePositions": one entry per short horizontal crease on the outer edge between the heart line and the base of the little finger (best seen on the side view). "position" is 0 at the heart line and 1 at the base of the little finger.`,
    `"timingMarks": every clear break, upward or downward branch, fork, point where a line begins (e.g. a second fate-line segment starting), influence line joining the fate line, island, star or cross ON the life, head, fate, sun or heart line. "point" is where the mark touches the line, on panel A. Only marks you can actually see; an empty array is a valid answer.`,
    `If this is not a palm at all, set "isPalm" to false.`,
    `Return only the JSON.`,
  ].join('\n\n');
}

const TIMED_LINES: readonly PalmTimedLine[] = [
  'lifeLine',
  'headLine',
  'fateLine',
  'sunLine',
  'heartLine',
];
const MARK_KINDS: readonly PalmMarkKind[] = [
  'break',
  'branchUp',
  'branchDown',
  'fork',
  'lineStarts',
  'influenceJoins',
  'island',
  'star',
  'cross',
];
const LENGTHS: readonly LineLength[] = ['short', 'medium', 'long'];
const DEPTHS: readonly LineDepth[] = ['faint', 'medium', 'deep'];

function point01(raw: unknown): [number, number] | null {
  if (!Array.isArray(raw) || raw.length !== 2) return null;
  const [x, y] = raw as unknown[];
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  ) {
    return null;
  }
  if (x < 0 || x > 1000 || y < 0 || y > 1000) return null;
  return [x / 1000, y / 1000];
}

const clamp01 = (n: unknown, fallback: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;

/**
 * Parses one hand's answer. Returns null when the answer is unusable (not a palm, or missing the
 * load-bearing blocks) so the caller can fall back or fail the scan. `sheet` maps coordinates
 * from the whole sheet onto panel A.
 */
export function parseOmnirushObservation(
  answer: unknown,
  sheet: Pick<ContactSheet, 'width' | 'frontWidth'>,
): PalmHandObservations | null {
  if (typeof answer !== 'object' || answer === null) return null;
  const data = answer as Record<string, unknown>;
  if (data.isPalm === false) return null;

  const base = parseObserveResponse(JSON.stringify(answer));
  if (!base) return null;

  const toFront = (p: [number, number] | null) => (p ? sheetPointToFront(p, sheet) : null);

  // parseObserveResponse normalised polylines to 0-1 of the SHEET; move them onto panel A. A path
  // with any point off panel A was traced on the wrong panel — drop the path, keep the measurements.
  for (const key of PALM_LINE_KEYS) {
    const line = base.majorLines[key];
    if (!line) continue;
    // The strict schema makes every field required, so an absent line comes back with "none"
    // placeholders. They are not measurements and must not reach palm-rules as if they were.
    if ((line.length as string) === 'none') delete line.length;
    if ((line.depth as string) === 'none') delete line.depth;
    if (line.endingPosition === 'none') delete line.endingPosition;
    if (line.separation === 'none') delete line.separation;
    if (!line.present) delete line.polyline;
    if (!line.polyline) continue;
    const mapped = line.polyline.map((p) => sheetPointToFront(p, sheet));
    if (mapped.some((p) => p === null)) delete line.polyline;
    else line.polyline = mapped as Array<[number, number]>;
  }

  const hand = data.hand;
  base.detectedHand = hand === 'left' || hand === 'right' ? hand : 'unknown';
  const orientation = data.orientation;
  if (
    orientation === 'fingersUp' ||
    orientation === 'fingersDown' ||
    orientation === 'fingersLeft' ||
    orientation === 'fingersRight'
  ) {
    base.orientation = orientation;
  }

  if (Array.isArray(data.palmBox) && data.palmBox.length === 4) {
    const [x0, y0, x1, y1] = data.palmBox as unknown[];
    const a = toFront(point01([x0, y0]));
    const b = toFront(point01([x1, y1]));
    if (a && b && b[0] > a[0] && b[1] > a[1]) base.palmBox = [a[0], a[1], b[0], b[1]];
  }

  const marks: PalmTimingMark[] = [];
  for (const raw of Array.isArray(data.timingMarks) ? data.timingMarks : []) {
    const m = raw as Record<string, unknown>;
    if (!TIMED_LINES.includes(m.line as PalmTimedLine)) continue;
    if (!MARK_KINDS.includes(m.mark as PalmMarkKind)) continue;
    const p = toFront(point01(m.point));
    if (!p) continue;
    marks.push({
      line: m.line as PalmTimedLine,
      mark: m.mark as PalmMarkKind,
      point: p,
      confidence: clamp01(m.confidence, 0.5),
    });
  }
  base.timingMarks = marks;

  const marriage: PalmMarriageLine[] = [];
  for (const raw of Array.isArray(data.marriageLinePositions) ? data.marriageLinePositions : []) {
    const m = raw as Record<string, unknown>;
    if (typeof m.position !== 'number' || !Number.isFinite(m.position)) continue;
    marriage.push({
      position: Math.max(0, Math.min(1, m.position)),
      length: LENGTHS.includes(m.length as LineLength) ? (m.length as LineLength) : 'medium',
      depth: DEPTHS.includes(m.depth as LineDepth) ? (m.depth as LineDepth) : 'medium',
    });
  }
  base.marriageLines = marriage.sort((a, b) => a.position - b.position).slice(0, 4);

  return base;
}
