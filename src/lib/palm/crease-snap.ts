// =============================================================================
// Crease snap — puts a traced palm line onto the real crease, or refuses it
// =============================================================================
// The overlay was pulled on 2026-08-23 because traced lines "ran nowhere near
// the actual creases". Two things were missing, and this module is both:
//
// 1. Precision. A vision model finds WHICH crease is the heart line well, but
//    its coordinates land a few pixels off: on 2026-09-30 only 16-60% of raw
//    gpt-6-astra trace points sat on a crease. A crease is a thin valley —
//    darker than the skin on both sides — so each point is moved along the
//    line's normal (at most SNAP_RADIUS) onto the darkest valley, with a
//    Viterbi pass keeping the path smooth. After snapping, 93-98% of points sat
//    on a crease, and independent traces of the same palm converged to within
//    0.1-0.5% of the frame.
//
// 2. A gate. A trace that is simply wrong (gpt-6-sol drew its "life line" along
//    the thumb's outline) is suppressed, not drawn: too little crease support
//    after the snap, or too much of the path running along a skin/background
//    edge instead of a crease, and `drawable` is false. The measurements the
//    model made still feed the written reading; only the drawing is withheld.
//
// Pure: works on GrayImage bitmaps (see image-prep.ts), no I/O.
// =============================================================================

import type { GrayImage, SnapImages } from './image-prep.js';

/** Sample spacing along the line, as a fraction of the long edge. */
const STEP = 0.008;
/** Furthest a point may move onto a crease, as a fraction of the long edge. */
const SNAP_RADIUS = 0.02;
/** Half-width of a crease valley (flank offset), fraction of the long edge. */
const FLANK = 0.006;
/** A sample is "on a crease" when its centre is this much darker than its flanks (0-255 scale). */
const VALLEY_DEPTH = 2.5;
/** Flank brightness difference that means skin on one side and background on the other. */
const EDGE_STEP = 40;
/** Where the plain-image flanks are read for the edge test, fraction of the long edge. */
const EDGE_FLANK = 0.0125;

/** Minimum share of snapped samples that must sit on a crease for the line to be drawn. */
export const MIN_SUPPORT = 0.6;
/** Maximum share of samples allowed to look like the hand's outline rather than a crease. */
export const MAX_EDGE_FRACTION = 0.25;

type Pt = [number, number];

export interface SnapResult {
  /** Snapped path, 0-1 image coordinates, at most MAX_OUTPUT_POINTS points. */
  polyline: Pt[];
  /** Share of snapped samples on a crease (0-1). */
  support: number;
  /** Share of the model's raw samples that were already on a crease (0-1) — diagnostics. */
  rawSupport: number;
  /** Share of samples whose two sides differ like skin vs background (0-1). */
  edgeFraction: number;
  /** Mean distance moved, as a fraction of the long edge. */
  meanShift: number;
  drawable: boolean;
}

const MAX_OUTPUT_POINTS = 24;

function sample(img: GrayImage, x: number, y: number): number | null {
  const { data, width: W, height: H } = img;
  if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return null;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, W - 1);
  const y1 = Math.min(y0 + 1, H - 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = data[y0 * W + x0]!;
  const b = data[y0 * W + x1]!;
  const c = data[y1 * W + x0]!;
  const d = data[y1 * W + x1]!;
  return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
}

/** Evenly spaced points along a polyline (pixel space). */
export function resample(points: Pt[], step: number): Pt[] {
  if (points.length === 0) return [];
  const out: Pt[] = [points[0]!];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1]!;
    const [bx, by] = points[i]!;
    const seg = Math.hypot(bx - ax, by - ay);
    if (seg === 0) continue;
    let t = step - carry;
    while (t <= seg) {
      out.push([ax + ((bx - ax) * t) / seg, ay + ((by - ay) * t) / seg]);
      t += step;
    }
    carry = seg - (t - step);
  }
  const last = points[points.length - 1]!;
  const tail = out[out.length - 1]!;
  if (Math.hypot(last[0] - tail[0], last[1] - tail[1]) > step / 3) out.push(last);
  return out;
}

function unitNormals(pts: Pt[]): Pt[] {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(pts.length - 1, i + 1)]!;
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    return [-ty / len, tx / len];
  });
}

/** Centre minus mean of both flanks along the normal; negative = the point sits in a valley. */
function valley(img: GrayImage, p: Pt, n: Pt, k: number, w: number): number {
  const c = sample(img, p[0] + n[0] * k, p[1] + n[1] * k);
  const l = sample(img, p[0] + n[0] * (k - w), p[1] + n[1] * (k - w));
  const r = sample(img, p[0] + n[0] * (k + w), p[1] + n[1] * (k + w));
  if (c === null || l === null || r === null) return 0;
  return c - (l + r) / 2;
}

/** Keeps every `ceil(n / max)`-th point plus the last one, so a stored path stays small. */
function thin(points: Pt[], max: number): Pt[] {
  if (points.length <= max) return points;
  const every = Math.ceil(points.length / max);
  const out = points.filter((_, i) => i % every === 0);
  const last = points[points.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/**
 * Snaps a 0-1 polyline onto the crease it was traced from and reports whether it may be drawn.
 * Returns null for a path too short to judge (under two samples).
 */
export function snapToCrease(images: SnapImages, polyline01: Pt[]): SnapResult | null {
  const eq = images.equalised;
  const long = Math.max(eq.width, eq.height);
  const px: Pt[] = polyline01.map(([x, y]) => [x * eq.width, y * eq.height]);
  const pts = resample(px, Math.max(2, long * STEP));
  if (pts.length < 3) return null;
  const normals = unitNormals(pts);
  const R = Math.max(4, Math.round(long * SNAP_RADIUS));
  const w = Math.max(3, Math.round(long * FLANK));
  const K = 2 * R + 1;

  const cost = pts.map((p, i) => {
    const row = new Float64Array(K);
    for (let j = 0; j < K; j++) row[j] = valley(eq, p, normals[i]!, j - R, w);
    return row;
  });

  // Viterbi: valley depth + a small pull toward the traced position + smoothness between
  // neighbours. A jump of more than 3 px between consecutive samples is not allowed at all, so
  // the path cannot hop onto a different crease halfway along.
  const OFFSET_WEIGHT = 0.08;
  const SMOOTH_WEIGHT = 0.9;
  const acc = cost.map(() => new Float64Array(K));
  const back = cost.map(() => new Int32Array(K));
  for (let j = 0; j < K; j++) acc[0]![j] = cost[0]![j]! + OFFSET_WEIGHT * Math.abs(j - R);
  for (let i = 1; i < pts.length; i++) {
    for (let j = 0; j < K; j++) {
      let best = Infinity;
      let arg = j;
      for (let q = Math.max(0, j - 3); q <= Math.min(K - 1, j + 3); q++) {
        const v = acc[i - 1]![q]! + SMOOTH_WEIGHT * (j - q) * (j - q);
        if (v < best) {
          best = v;
          arg = q;
        }
      }
      acc[i]![j] = best + cost[i]![j]! + OFFSET_WEIGHT * Math.abs(j - R);
      back[i]![j] = arg;
    }
  }
  let j = 0;
  const lastRow = acc[pts.length - 1]!;
  for (let q = 1; q < K; q++) if (lastRow[q]! < lastRow[j]!) j = q;
  const offsets = new Array<number>(pts.length);
  for (let i = pts.length - 1; i >= 0; i--) {
    offsets[i] = j - R;
    j = back[i]![j]!;
  }

  const snappedPx: Pt[] = pts.map((p, i) => [
    p[0] + normals[i]![0] * offsets[i]!,
    p[1] + normals[i]![1] * offsets[i]!,
  ]);
  const onCrease = offsets.filter((k, i) => cost[i]![k + R]! < -VALLEY_DEPTH).length;
  const rawOnCrease = cost.filter((row) => row[R]! < -VALLEY_DEPTH).length;

  // Outline test on the plain (un-equalised) image, where a skin/background step survives.
  const plain = images.plain;
  const sx = plain.width / eq.width;
  const sy = plain.height / eq.height;
  const ew = long * EDGE_FLANK;
  let edgeSamples = 0;
  for (let i = 0; i < snappedPx.length; i++) {
    const [x, y] = snappedPx[i]!;
    const [nx, ny] = normals[i]!;
    const a = sample(plain, (x + nx * ew) * sx, (y + ny * ew) * sy);
    const b = sample(plain, (x - nx * ew) * sx, (y - ny * ew) * sy);
    // Off the image on one side is an edge too: the line hugs the frame border.
    if (a === null || b === null || Math.abs(a - b) > EDGE_STEP) edgeSamples++;
  }

  const support = onCrease / pts.length;
  const edgeFraction = edgeSamples / pts.length;
  const meanShift = offsets.reduce((s, k) => s + Math.abs(k), 0) / offsets.length / long;
  const polyline = thin(snappedPx, MAX_OUTPUT_POINTS).map(
    ([x, y]) =>
      [Math.max(0, Math.min(1, x / eq.width)), Math.max(0, Math.min(1, y / eq.height))] as Pt,
  );
  return {
    polyline,
    support,
    rawSupport: rawOnCrease / pts.length,
    edgeFraction,
    meanShift,
    drawable: support >= MIN_SUPPORT && edgeFraction <= MAX_EDGE_FRACTION,
  };
}
