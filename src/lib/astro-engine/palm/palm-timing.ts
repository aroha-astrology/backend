// =============================================================================
// Palm life events — dated on the hand, reconciled with the birth chart
// =============================================================================
// The callouts on the palm photo ("Marriage · Age 30 · marriage line") come
// from here, in three deterministic steps:
//
// 1. Candidates from the hand. The vision pass reports only geometry — where a
//    break, branch or fork sits on which line (observe-omnirush.ts). Which
//    event a mark stands for is a fixed classical rule table (MARK_EVENTS), and
//    its age is read off the mark's position with the classical timing scales
//    (life line from its start, fate/sun line against the head and heart line
//    crossings, marriage lines between the heart line and the little finger).
//    The model is never asked "when will this person marry".
//
// 2. Reconciliation with the chart. Every age is checked against the chart's
//    own windows for the same area — for the future, the SAME confidence-
//    ranked dasha windows the Marriage / Progeny / Wealth reports and chat
//    show (report-timing.ts); for the past, the Life Timeline's bands. A palm
//    age inside a window (±AGE_TOLERANCE) is a match. A near miss is shown at
//    the window's nearest edge and marked as adjusted. An age the chart gives
//    no window for at all is not shown: the palm screen never states a date
//    the kundli-based reports would contradict.
//
// 3. Agreement. How often the hand and the chart independently agree, across
//    event timing, the six life-area scores and the mount-vs-planet checks,
//    as one percentage (computeKundliMatch).
//
// Pure: no I/O. The service computes the chart windows and passes them in.
// =============================================================================

import type {
  PalmHandObservations,
  PalmLineKey,
  PalmMarkKind,
  PalmTimedLine,
} from './palm-types.js';
import type { PalmRuleFact } from './palm-rules.js';
import type { PalmDomainScores } from './palm-chart.js';
import { CHART_ANCHOR_TOLERANCE } from './palm-chart.js';

export const PALM_EVENT_KINDS = [
  'marriage',
  'child',
  'careerChange',
  'promotion',
  'wealth',
  'relocation',
] as const;
export type PalmEventKind = (typeof PALM_EVENT_KINDS)[number];

/** Palmistry dates to roughly a year either side; a chart window this close counts as agreeing. */
export const AGE_TOLERANCE = 2;
/** Beyond the tolerance but within this, the age is moved onto the chart's window. */
const NEAR_TOLERANCE = 4;
const MIN_EVENT_AGE = 16;
const MAX_EVENT_AGE = 80;
const MAX_CAREER_CHANGES = 3;

type Pt = [number, number];

/** Which event a mark on a line classically stands for. Islands, stars and crosses are left out
 * on purpose: they read as obstacles or health cautions, and the photo never puts an age on those. */
const MARK_EVENTS: Partial<Record<PalmTimedLine, Partial<Record<PalmMarkKind, PalmEventKind>>>> = {
  fateLine: {
    break: 'careerChange',
    lineStarts: 'careerChange',
    fork: 'careerChange',
    branchUp: 'promotion',
    influenceJoins: 'marriage',
  },
  headLine: { fork: 'careerChange', break: 'careerChange', branchUp: 'careerChange' },
  lifeLine: { branchUp: 'promotion', branchDown: 'relocation' },
  sunLine: { lineStarts: 'wealth', branchUp: 'wealth' },
};

export interface PalmEventCandidate {
  kind: PalmEventKind;
  /** The line (or minor-line group) the event is read from. */
  source: PalmLineKey | 'marriageLine' | 'childrenLine';
  mark?: PalmMarkKind;
  /** Age read off the hand; null when the hand shows the event but not its timing (children). */
  palmAge: number | null;
  /** Where on the photo (0-1) the callout's leader line starts, or null when not drawable. */
  anchor: Pt | null;
  confidence: number;
}

/* ---------------------------------------------------------------- geometry */

type Orientation = NonNullable<PalmHandObservations['orientation']>;

/** Rotates a photo point into the canonical frame (fingers up). Rotation keeps handedness. */
function toCanon([x, y]: Pt, o: Orientation): Pt {
  switch (o) {
    case 'fingersDown':
      return [1 - x, 1 - y];
    case 'fingersLeft':
      return [1 - y, x];
    case 'fingersRight':
      return [y, 1 - x];
    default:
      return [x, y];
  }
}

function fromCanon([x, y]: Pt, o: Orientation): Pt {
  switch (o) {
    case 'fingersDown':
      return [1 - x, 1 - y];
    case 'fingersLeft':
      return [y, 1 - x];
    case 'fingersRight':
      return [1 - y, x];
    default:
      return [x, y];
  }
}

function project(p: Pt, a: Pt, b: Pt): { t: number; d: number; q: Pt } {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1e-12;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const q: Pt = [a[0] + t * dx, a[1] + t * dy];
  return { t, d: Math.hypot(p[0] - q[0], p[1] - q[1]), q };
}

/** Nearest point on a polyline and its arc-length fraction (0 at the first point, 1 at the last). */
export function locateOnPolyline(
  line: Pt[],
  p: Pt,
): { fraction: number; point: Pt; distance: number } {
  const segs = line.slice(1).map((b, i) => Math.hypot(b[0] - line[i]![0], b[1] - line[i]![1]));
  const total = segs.reduce((s, n) => s + n, 0) || 1e-12;
  let best = { fraction: 0, point: line[0]!, distance: Infinity };
  let walked = 0;
  for (let i = 1; i < line.length; i++) {
    const { t, d, q } = project(p, line[i - 1]!, line[i]!);
    if (d < best.distance)
      best = { fraction: (walked + t * segs[i - 1]!) / total, point: q, distance: d };
    walked += segs[i - 1]!;
  }
  return best;
}

/** The y where a (roughly horizontal) canonical polyline passes a given x, or null if it doesn't. */
function yAtX(line: Pt[], x: number): number | null {
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]!;
    const [bx, by] = line[i]!;
    if ((x - ax) * (x - bx) <= 0 && ax !== bx) return ay + ((x - ax) / (bx - ax)) * (by - ay);
  }
  return null;
}

function lerpAge(y: number, anchors: Array<[number, number]>): number {
  // anchors: [y, age] with y DEcreasing as age increases (wrist at the bottom).
  for (let i = 1; i < anchors.length; i++) {
    const [y0, a0] = anchors[i - 1]!;
    const [y1, a1] = anchors[i]!;
    if (y <= y0 && y >= y1) return a0 + ((y0 - y) / (y0 - y1 || 1e-12)) * (a1 - a0);
  }
  return y > anchors[0]![0] ? anchors[0]![1] : anchors[anchors.length - 1]![1];
}

/** Classical marriage-line timing: at the heart line ~16, halfway ~28, at the little finger ~45. */
export function marriageAgeFromPosition(position: number): number {
  const p = Math.max(0, Math.min(1, position));
  return p <= 0.5 ? 16 + (p / 0.5) * 12 : 28 + ((p - 0.5) / 0.5) * 17;
}

interface CanonicalHand {
  o: Orientation;
  thumbOnLeft: boolean;
  box: { x0: number; y0: number; x1: number; y1: number };
  lines: Partial<Record<PalmLineKey, Pt[]>>;
}

function canonicalHand(obs: PalmHandObservations, hand: 'left' | 'right'): CanonicalHand {
  const o: Orientation = obs.orientation ?? 'fingersUp';
  const box = obs.palmBox ?? [0.15, 0.4, 0.85, 0.95];
  const c1 = toCanon([box[0], box[1]], o);
  const c2 = toCanon([box[2], box[3]], o);
  const lines: CanonicalHand['lines'] = {};
  for (const [key, line] of Object.entries(obs.majorLines) as Array<
    [PalmLineKey, PalmHandObservations['majorLines'][PalmLineKey]]
  >) {
    // Only a line that passed the crease snap is trusted for geometry — the same rule as drawing.
    if (line?.polyline && line.trace?.drawable)
      lines[key] = line.polyline.map((p) => toCanon(p, o));
  }
  return {
    o,
    // Fingers up, palm toward the camera: a right hand's thumb is on the left of the frame.
    thumbOnLeft: hand === 'right',
    box: {
      x0: Math.min(c1[0], c2[0]),
      y0: Math.min(c1[1], c2[1]),
      x1: Math.max(c1[0], c2[0]),
      y1: Math.max(c1[1], c2[1]),
    },
    lines,
  };
}

/** Orients a canonical line so index 0 is where palmistry starts counting its years. */
function oriented(key: PalmLineKey, line: Pt[], h: CanonicalHand): Pt[] {
  const first = line[0]!;
  const last = line[line.length - 1]!;
  let reverse = false;
  if (key === 'lifeLine')
    reverse = last[1] < first[1]; // starts up near the index finger
  else if (key === 'headLine')
    reverse = h.thumbOnLeft ? last[0] < first[0] : last[0] > first[0]; // starts thumb side
  else if (key === 'heartLine')
    reverse = h.thumbOnLeft ? last[0] > first[0] : last[0] < first[0]; // starts percussion side
  else if (key === 'fateLine' || key === 'sunLine') reverse = last[1] > first[1]; // starts at the wrist
  return reverse ? [...line].reverse() : line;
}

/** Age at a point on a line, or null when the geometry to date it isn't there. */
function ageOnLine(
  key: PalmTimedLine,
  pointCanon: Pt,
  h: CanonicalHand,
): { age: number; at: Pt } | null {
  const line = h.lines[key];
  if (!line || line.length < 2) return null;
  const path = oriented(key, line, h);
  const loc = locateOnPolyline(path, pointCanon);
  // A mark more than ~6% of the frame away from its own drawn line is not on it.
  if (loc.distance > 0.06) return null;
  if (key === 'lifeLine') return { age: loc.fraction * 80, at: loc.point };
  if (key === 'headLine') return { age: loc.fraction * 70, at: loc.point };
  if (key === 'fateLine' || key === 'sunLine') {
    const { y0, y1 } = h.box;
    const height = y1 - y0 || 1;
    const x = loc.point[0];
    let heartY = h.lines.heartLine ? yAtX(h.lines.heartLine, x) : null;
    let headY = h.lines.headLine ? yAtX(h.lines.headLine, x) : null;
    heartY ??= y0 + 0.22 * height;
    headY ??= y0 + 0.42 * height;
    if (!(y1 > headY && headY > heartY && heartY > y0)) {
      heartY = y0 + 0.22 * height;
      headY = y0 + 0.42 * height;
    }
    // Classical fate-line scale: wrist 0, head-line crossing 35, heart-line crossing 49, finger base 70.
    const age = lerpAge(loc.point[1], [
      [y1, 0],
      [headY, 35],
      [heartY, 49],
      [y0, 70],
    ]);
    return { age, at: loc.point };
  }
  return null;
}

/**
 * Every life event the hand itself indicates, with the age it reads and where the callout
 * attaches. Timing is only computed from lines that passed the crease snap, in the canonical
 * (fingers-up) frame; `hand` is the hand the person was asked to photograph.
 */
export function palmEventCandidates(
  obs: PalmHandObservations,
  hand: 'left' | 'right',
): PalmEventCandidate[] {
  const h = canonicalHand(obs, hand);
  const out: PalmEventCandidate[] = [];

  for (const m of obs.timingMarks ?? []) {
    const kind = MARK_EVENTS[m.line]?.[m.mark];
    if (!kind) continue;
    const dated = ageOnLine(m.line, toCanon(m.point, h.o), h);
    if (!dated) continue;
    if (dated.age < MIN_EVENT_AGE || dated.age > MAX_EVENT_AGE) continue;
    out.push({
      kind,
      source: m.line,
      mark: m.mark,
      palmAge: Math.round(dated.age * 10) / 10,
      anchor: fromCanon(dated.at, h.o),
      confidence: m.confidence,
    });
  }

  // Marriage: the strongest marriage line only — the photo names one marriage, never a count.
  const marriageLines = obs.marriageLines ?? [];
  const DEPTH_RANK = { faint: 0, medium: 1, deep: 2 } as const;
  const LENGTH_RANK = { short: 0, medium: 1, long: 2 } as const;
  const strongest = [...marriageLines].sort(
    (a, b) =>
      DEPTH_RANK[b.depth] + LENGTH_RANK[b.length] - (DEPTH_RANK[a.depth] + LENGTH_RANK[a.length]),
  )[0];
  let marriageAnchor: Pt | null = null;
  if (strongest) {
    // On the percussion edge, between the heart line's start and the little finger's base.
    const percussionX = h.thumbOnLeft ? h.box.x1 : h.box.x0;
    const heart = h.lines.heartLine ? oriented('heartLine', h.lines.heartLine, h) : null;
    const heartY = heart ? heart[0]![1] : h.box.y0 + 0.22 * (h.box.y1 - h.box.y0);
    const y = heartY - strongest.position * (heartY - h.box.y0);
    const inset = (h.thumbOnLeft ? -1 : 1) * 0.02;
    marriageAnchor = fromCanon([percussionX + inset, y], h.o);
    out.push({
      kind: 'marriage',
      source: 'marriageLine',
      palmAge: Math.round(marriageAgeFromPosition(strongest.position) * 10) / 10,
      anchor: marriageAnchor,
      confidence: 0.7,
    });
  }

  // Children lines show THAT the hand indicates children, not when — the chart dates it.
  if ((obs.minorLines.childrenLines?.count ?? 0) > 0) {
    out.push({
      kind: 'child',
      source: 'childrenLine',
      palmAge: null,
      anchor: marriageAnchor ? [marriageAnchor[0], Math.max(0, marriageAnchor[1] - 0.03)] : null,
      confidence: 0.6,
    });
  }
  return out;
}

/* ---------------------------------------------------------- reconciliation */

export interface AgeWindow {
  startAge: number;
  endAge: number;
  startDate: string;
  endDate: string;
}

/** The chart's windows for one event kind: the report windows ahead, the Life Timeline behind. */
export interface KindWindows {
  future: AgeWindow[];
  past: AgeWindow[];
}

export type EventAgreement = 'match' | 'adjusted' | 'chart';

export interface PalmEventAge {
  /** The age shown on the photo. */
  age: number;
  /** What the hand alone said, or null (children lines carry no timing). */
  palmAge: number | null;
  agreement: EventAgreement;
  window: AgeWindow;
  past: boolean;
}

export interface PalmEvent {
  kind: PalmEventKind;
  source: PalmEventCandidate['source'];
  mark?: PalmMarkKind;
  anchor: Pt | null;
  ages: PalmEventAge[];
}

export interface TimingTally {
  match: number;
  adjusted: number;
  chart: number;
  /** Palm events the chart gave no window for — not shown, but counted against agreement. */
  unsupported: number;
}

function nearestWindow(age: number, windows: AgeWindow[]): { w: AgeWindow; gap: number } | null {
  let best: { w: AgeWindow; gap: number } | null = null;
  for (const w of windows) {
    const gap = age < w.startAge ? w.startAge - age : age > w.endAge ? age - w.endAge : 0;
    if (!best || gap < best.gap) best = { w, gap };
  }
  return best;
}

/** A single representative age inside a window: its first whole year, capped two years in. */
function windowAge(w: AgeWindow): number {
  return Math.round((w.startAge + Math.min(w.endAge, w.startAge + 2)) / 2);
}

function reconcileAge(
  palmAge: number | null,
  windows: KindWindows,
  currentAge: number,
): { result: PalmEventAge | null; outcome: keyof TimingTally } {
  if (palmAge === null) {
    // The hand says "yes", the chart says "when": its first window ahead.
    const w = windows.future[0];
    if (!w) return { result: null, outcome: 'unsupported' };
    return {
      result: {
        age: Math.max(windowAge(w), Math.ceil(currentAge)),
        palmAge: null,
        agreement: 'chart',
        window: w,
        past: false,
      },
      outcome: 'chart',
    };
  }
  const past = palmAge < currentAge - 1;
  const hit = nearestWindow(palmAge, past ? windows.past : windows.future);
  if (!hit) return { result: null, outcome: 'unsupported' };
  if (hit.gap <= AGE_TOLERANCE) {
    const age = Math.round(Math.max(hit.w.startAge, Math.min(hit.w.endAge, palmAge)));
    return { result: { age, palmAge, agreement: 'match', window: hit.w, past }, outcome: 'match' };
  }
  if (hit.gap <= NEAR_TOLERANCE) {
    const edge = palmAge < hit.w.startAge ? Math.ceil(hit.w.startAge) : Math.floor(hit.w.endAge);
    return {
      result: { age: edge, palmAge, agreement: 'adjusted', window: hit.w, past },
      outcome: 'adjusted',
    };
  }
  return { result: null, outcome: 'unsupported' };
}

/**
 * Groups the hand's candidates into one event per kind (up to three career changes, one of every
 * other kind — the most confident mark wins), then dates every age against the chart.
 */
export function reconcilePalmEvents(
  candidates: PalmEventCandidate[],
  windowsByKind: Record<PalmEventKind, KindWindows>,
  currentAge: number,
): { events: PalmEvent[]; tally: TimingTally } {
  const tally: TimingTally = { match: 0, adjusted: 0, chart: 0, unsupported: 0 };
  const events: PalmEvent[] = [];

  for (const kind of PALM_EVENT_KINDS) {
    const ofKind = candidates
      .filter((c) => c.kind === kind)
      .sort((a, b) => b.confidence - a.confidence);
    if (ofKind.length === 0) continue;

    // Career changes are the one kind the photo lists several ages for ("28 · 31 · 35"); marks
    // within 1.5 years of a stronger one are the same change seen twice.
    const picked: PalmEventCandidate[] = [];
    for (const c of ofKind) {
      const limit = kind === 'careerChange' ? MAX_CAREER_CHANGES : 1;
      if (picked.length >= limit) break;
      if (
        c.palmAge !== null &&
        picked.some((p) => p.palmAge !== null && Math.abs(p.palmAge - c.palmAge!) < 1.5)
      )
        continue;
      picked.push(c);
    }

    const ages: PalmEventAge[] = [];
    for (const c of picked) {
      const { result, outcome } = reconcileAge(c.palmAge, windowsByKind[kind], currentAge);
      tally[outcome]++;
      if (result && !ages.some((a) => a.age === result.age)) ages.push(result);
    }
    if (ages.length === 0) continue;
    ages.sort((a, b) => a.age - b.age);
    const lead = picked[0]!;
    events.push({
      kind,
      source: lead.source,
      ...(lead.mark ? { mark: lead.mark } : {}),
      anchor: picked.find((c) => c.anchor)?.anchor ?? null,
      ages,
    });
  }
  return { events, tally };
}

/* --------------------------------------------------------------- agreement */

export interface AgreementPart {
  agree: number;
  total: number;
}

export interface KundliMatch {
  /** 0-100: how much of what the hand shows the birth chart independently confirms. */
  percent: number;
  timing: AgreementPart | null;
  scores: AgreementPart | null;
  mounts: AgreementPart | null;
}

const WEIGHTS = { timing: 0.5, scores: 0.3, mounts: 0.2 } as const;

/**
 * One agreement figure from three independent comparisons:
 *  - timing: each palm-dated event against the chart's window (match or chart-dated = 1,
 *    adjusted = 0.5, no window at all = 0);
 *  - scores: the palm's own six area scores (before any clamping) within the chart's ±2 band;
 *  - mounts: developed/flat mounts the chart's planet strength corroborates vs contradicts.
 * Parts with nothing to compare are left out and the weights renormalised; null when no part
 * has anything to compare at all.
 */
export function computeKundliMatch(input: {
  tally: TimingTally | null;
  palmScores: PalmDomainScores | null;
  chartScores: PalmDomainScores | null;
  chartFacts: PalmRuleFact[];
}): KundliMatch | null {
  const t = input.tally;
  const timingTotal = t ? t.match + t.adjusted + t.chart + t.unsupported : 0;
  const timing: AgreementPart | null =
    t && timingTotal > 0
      ? { agree: t.match + t.chart + 0.5 * t.adjusted, total: timingTotal }
      : null;

  let scores: AgreementPart | null = null;
  if (input.palmScores && input.chartScores) {
    const keys = Object.keys(input.chartScores) as Array<keyof PalmDomainScores>;
    const agree = keys.filter(
      (k) => Math.abs(input.palmScores![k] - input.chartScores![k]) <= CHART_ANCHOR_TOLERANCE,
    ).length;
    scores = { agree, total: keys.length };
  }

  const corroborated = input.chartFacts.filter((f) => f.key.endsWith('.corroborated')).length;
  const conflicts = input.chartFacts.filter((f) => f.key.endsWith('.conflict')).length;
  const mounts: AgreementPart | null =
    corroborated + conflicts > 0 ? { agree: corroborated, total: corroborated + conflicts } : null;

  const parts = (
    [
      ['timing', timing],
      ['scores', scores],
      ['mounts', mounts],
    ] as const
  ).filter(([, p]) => p !== null) as Array<[keyof typeof WEIGHTS, AgreementPart]>;
  if (parts.length === 0) return null;
  const weight = parts.reduce((s, [k]) => s + WEIGHTS[k], 0);
  const percent = Math.round(
    (parts.reduce((s, [k, p]) => s + WEIGHTS[k] * (p.agree / p.total), 0) / weight) * 100,
  );
  return { percent, timing, scores, mounts };
}
