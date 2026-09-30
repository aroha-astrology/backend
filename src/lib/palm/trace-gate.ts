// =============================================================================
// Trace gate — decides which traced lines may be drawn on the user's photo
// =============================================================================
// Runs every traced line of the primary hand through the crease snap
// (crease-snap.ts), then three checks that catch what the snap cannot:
//   - the model's own confidence in the path (a hesitant trace is not drawn);
//   - the path stays on the palm (a line wandering off the palm's box is wrong);
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
/** The palm box is widened by this much (fraction of the frame) before the on-palm check. */
const BOX_MARGIN = 0.06;
/** Share of a path's points that must fall inside the widened palm box. */
const MIN_INSIDE = 0.85;

type Pt = [number, number];

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

export interface GateSummary {
  drawn: string[];
  suppressed: string[];
}

export function gateTraces(obs: PalmHandObservations, images: SnapImages): GateSummary {
  const summary: GateSummary = { drawn: [], suppressed: [] };
  const box = obs.palmBox;

  for (const key of PALM_LINE_KEYS) {
    const line = obs.majorLines[key];
    if (!line?.present || !line.polyline || line.polyline.length < 2) continue;
    const snap = snapToCrease(images, line.polyline);
    if (!snap) {
      delete line.polyline;
      continue;
    }
    const confident = line.confidence === undefined || line.confidence >= MIN_LINE_CONFIDENCE;
    let onPalm = true;
    if (box) {
      const inside = snap.polyline.filter(
        ([x, y]) =>
          x >= box[0] - BOX_MARGIN &&
          x <= box[2] + BOX_MARGIN &&
          y >= box[1] - BOX_MARGIN &&
          y <= box[3] + BOX_MARGIN,
      ).length;
      onPalm = inside / snap.polyline.length >= MIN_INSIDE;
    }
    line.polyline = snap.polyline;
    line.trace = {
      support: Math.round(snap.support * 100) / 100,
      edgeFraction: Math.round(snap.edgeFraction * 100) / 100,
      drawable: snap.drawable && confident && onPalm,
    };
  }

  const heart = obs.majorLines.heartLine;
  const head = obs.majorLines.headLine;
  if (heart?.trace?.drawable && head?.trace?.drawable && heart.polyline && head.polyline) {
    if (
      meanFingerwardY(heart.polyline, obs.orientation) >=
      meanFingerwardY(head.polyline, obs.orientation)
    ) {
      heart.trace.drawable = false;
      head.trace.drawable = false;
    }
  }

  for (const key of PALM_LINE_KEYS) {
    const trace = obs.majorLines[key]?.trace;
    if (!trace) continue;
    (trace.drawable ? summary.drawn : summary.suppressed).push(key);
  }
  return summary;
}
