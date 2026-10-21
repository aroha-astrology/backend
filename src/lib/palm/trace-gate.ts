// =============================================================================
// Trace gate — decides which traced lines may be drawn on the user's photo
// =============================================================================
// Runs every traced line of the primary hand through the crease snap
// (crease-snap.ts), then three checks that catch what the snap cannot:
//   - the model's own confidence in the path (a hesitant trace is not drawn);
//   - the path stays on the palm (a line wandering off the palm is wrong);
//   - anatomy: the heart line runs above the head line. When they come back
//     the other way round the model has swapped them, and neither is drawn.
// A line that fails keeps its measurements (the written reading still uses
// them); it only loses the right to be drawn. Mutates `obs` in place.
// =============================================================================

import type { PalmHandObservations } from '../astro-engine/palm/palm-types.js';
import { PALM_LINE_KEYS } from '../astro-engine/palm/palm-types.js';
import type { SnapImages } from './image-prep.js';
import { snapToCrease } from './crease-snap.js';

/** Below this self-reported confidence a path is not drawn, however well it snaps. */
export const MIN_LINE_CONFIDENCE = 0.35;
/** The palm box is widened by this much (fraction of the frame) before the on-palm check (legacy fallback). */
const BOX_MARGIN = 0.06;
/** Share of a path's points that must fall inside the widened palm box (legacy fallback). */
const MIN_INSIDE = 0.85;

type Pt = [number, number];

export interface GateOptions {
  strictGate?: boolean;
  landmarks?: Array<{ x: number; y: number; z?: number }>;
  imageWidth?: number;
  imageHeight?: number;
}

export interface GateSummary {
  drawn: string[];
  suppressed: string[];
  suppressedReason: Record<string, string>;
}

/** Mean canonical "height" of a path: small = near the fingers. */
function meanFingerwardY(points: Pt[], orientation: PalmHandObservations['orientation']): number {
  const ys = points.map(([x, y]) =>
    orientation === 'fingersDown'
      ? 1 - y
      : orientation === 'fingersLeft'
        ? x
        : orientation === 'fingersRight'
          ? 1 - x
          : y,
  );
  return ys.reduce((s, v) => s + v, 0) / ys.length;
}

/** Point in polygon check using ray-casting. */
export function pointInPolygon(pt: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i]![0],
      yi = poly[i]![1];
    const xj = poly[j]![0],
      yj = poly[j]![1];
    const intersect =
      yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi || 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Builds an inner-palm boundary polygon from 21 MediaPipe landmarks. */
export function buildInnerPalmPolygon(landmarks: Array<{ x: number; y: number }>): Pt[] {
  if (landmarks.length < 21) return [];
  const p = (i: number): Pt => [landmarks[i]!.x, landmarks[i]!.y];
  const p0 = p(0);
  const p2 = p(2);
  const p5 = p(5);
  const p9 = p(9);
  const p13 = p(13);
  const p17 = p(17);
  // Percussion midpoint between little finger base and wrist
  const pPercussion: Pt = [(p17[0] + p0[0]) / 2, (p17[1] + p0[1]) / 2];
  // Slightly inset thumb base towards palm center (L9) to keep life line inside
  const tThumb: Pt = [p2[0] * 0.85 + p9[0] * 0.15, p2[1] * 0.85 + p9[1] * 0.15];

  return [p0, tThumb, p5, p9, p13, p17, pPercussion];
}

/** Derives orientation from the landmark wrist-to-middle vector L0->L9. */
export function orientationFromLandmarks(
  landmarks: Array<{ x: number; y: number }>,
): PalmHandObservations['orientation'] {
  if (landmarks.length < 21) return 'fingersUp';
  const dx = landmarks[9]!.x - landmarks[0]!.x;
  const dy = landmarks[9]!.y - landmarks[0]!.y;
  if (Math.abs(dy) >= Math.abs(dx)) {
    return dy < 0 ? 'fingersUp' : 'fingersDown';
  }
  return dx < 0 ? 'fingersLeft' : 'fingersRight';
}

const T1_KEYS = new Set(['lifeLine', 'headLine', 'heartLine']);

export function gateTraces(
  obs: PalmHandObservations,
  images: SnapImages,
  options?: GateOptions,
): GateSummary {
  const summary: GateSummary = { drawn: [], suppressed: [], suppressedReason: {} };
  const strict = options?.strictGate === true;
  const landmarks = options?.landmarks;

  // Use landmark orientation when available
  if (landmarks && landmarks.length >= 21) {
    obs.orientation = orientationFromLandmarks(landmarks);
  }

  const polygon = landmarks && landmarks.length >= 21 ? buildInnerPalmPolygon(landmarks) : null;
  const box = obs.palmBox;

  for (const key of PALM_LINE_KEYS) {
    const line = obs.majorLines[key];
    if (!line?.present || !line.polyline || line.polyline.length < 2) continue;
    const snap = snapToCrease(images, line.polyline);
    if (!snap) {
      delete line.polyline;
      summary.suppressedReason[key] = 'failed crease snap';
      continue;
    }

    let confident = false;
    let onPalm = true;
    let passesThresholds = false;
    let reason = '';

    if (strict) {
      // Under strict gate, missing confidence is NOT confident (owner's accuracy rule)
      if (line.confidence === undefined || line.confidence === null) {
        confident = false;
        reason = 'missing line confidence';
      } else {
        const isT1 = T1_KEYS.has(key);
        const reqConfidence = isT1 ? 0.65 : 0.85;
        const reqSupport = isT1 ? 0.82 : 0.9;
        const maxEdge = isT1 ? 0.04 : 0.0;
        const minContainment = isT1 ? 0.96 : 1.0;

        confident = line.confidence >= reqConfidence;
        if (!confident) {
          reason = `confidence ${line.confidence} < required ${reqConfidence}`;
        } else if (snap.support < reqSupport) {
          passesThresholds = false;
          reason = `crease support ${snap.support} < required ${reqSupport}`;
        } else if (snap.edgeFraction > maxEdge) {
          passesThresholds = false;
          reason = `edge fraction ${snap.edgeFraction} > allowed ${maxEdge}`;
        } else if (!isT1 && snap.meanValleyDepth < 4.5) {
          passesThresholds = false;
          reason = `mean valley depth ${snap.meanValleyDepth} < required 4.5`;
        } else {
          passesThresholds = true;
        }

        // Containment check
        if (polygon && polygon.length >= 3) {
          const inside = snap.polyline.filter((pt) => pointInPolygon(pt, polygon)).length;
          const containment = inside / (snap.polyline.length || 1);
          onPalm = containment >= minContainment;
          if (!onPalm && !reason)
            reason = `containment ${containment.toFixed(2)} < ${minContainment}`;
        } else if (box) {
          // Shrunk/exact box (no widening margin under strict gate)
          const inside = snap.polyline.filter(
            ([x, y]) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3],
          ).length;
          const containment = inside / (snap.polyline.length || 1);
          onPalm = containment >= minContainment;
          if (!onPalm && !reason)
            reason = `containment ${containment.toFixed(2)} < ${minContainment}`;
        }
      }
    } else {
      // Baseline gate
      confident = line.confidence === undefined || line.confidence >= MIN_LINE_CONFIDENCE;
      if (!confident) {
        reason = `confidence ${line.confidence} < ${MIN_LINE_CONFIDENCE}`;
      } else if (!snap.drawable) {
        passesThresholds = false;
        reason = 'snap failed drawable threshold';
      } else {
        passesThresholds = true;
      }

      if (polygon && polygon.length >= 3) {
        const inside = snap.polyline.filter((pt) => pointInPolygon(pt, polygon)).length;
        onPalm = inside / snap.polyline.length >= MIN_INSIDE;
        if (!onPalm && !reason) reason = 'line wanders off palm polygon';
      } else if (box) {
        const inside = snap.polyline.filter(
          ([x, y]) =>
            x >= box[0] - BOX_MARGIN &&
            x <= box[2] + BOX_MARGIN &&
            y >= box[1] - BOX_MARGIN &&
            y <= box[3] + BOX_MARGIN,
        ).length;
        onPalm = inside / snap.polyline.length >= MIN_INSIDE;
        if (!onPalm && !reason) reason = 'line wanders off palm box';
      }
    }

    const drawable = confident && onPalm && (strict ? passesThresholds : snap.drawable);
    line.polyline = snap.polyline;
    line.trace = {
      support: Math.round(snap.support * 100) / 100,
      edgeFraction: Math.round(snap.edgeFraction * 100) / 100,
      drawable,
    };
    if (!drawable && reason) {
      summary.suppressedReason[key] = reason;
    }
  }

  // Anatomy swap check
  const heart = obs.majorLines.heartLine;
  const head = obs.majorLines.headLine;
  if (heart?.trace?.drawable && head?.trace?.drawable && heart.polyline && head.polyline) {
    if (
      meanFingerwardY(heart.polyline, obs.orientation) >=
      meanFingerwardY(head.polyline, obs.orientation)
    ) {
      heart.trace.drawable = false;
      head.trace.drawable = false;
      summary.suppressedReason['heartLine'] = 'swapped with head line';
      summary.suppressedReason['headLine'] = 'swapped with heart line';
    }
  }

  for (const key of PALM_LINE_KEYS) {
    const trace = obs.majorLines[key]?.trace;
    if (!trace) continue;
    (trace.drawable ? summary.drawn : summary.suppressed).push(key);
  }
  return summary;
}
