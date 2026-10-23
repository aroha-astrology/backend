// =============================================================================
// Palm biometrics — deterministic geometric analysis from 21 MediaPipe landmarks
// =============================================================================
// All geometry runs in pixel space (x * imageWidth, y * imageHeight) to avoid
// distortion on non-square photographs. Metrics correspond directly to classical
// Samudrika rules and the PalmFingerAnalysis / PalmHandType contracts.
// =============================================================================

import type { PalmLandmarkPoint } from '../../../db/schema.js';

export interface PalmBiometricsInput {
  points: PalmLandmarkPoint[];
  imageWidth: number;
  imageHeight: number;
}

export interface PalmBiometricsResult {
  palmWidth: number;
  palmLength: number;
  fingerLengths: {
    thumb: number;
    index: number;
    middle: number;
    ring: number;
    little: number;
  };
  indexVsRing: 'indexLonger' | 'equal' | 'ringLonger';
  thumbWillToLogicRatio: number;
  thumbSet: 'low' | 'medium' | 'high';
  littleFingerSet: 'low' | 'normal' | 'high';
  dominantPhalange: 'top' | 'middle' | 'base' | 'even';
  spacing: 'tight' | 'normal' | 'wide';
  computedPalmShape: 'square' | 'rectangular' | 'narrow' | 'wide';
  computedElement: 'Earth' | 'Air' | 'Fire' | 'Water';
}

export function computePalmBiometrics(input: PalmBiometricsInput): PalmBiometricsResult | null {
  const { points, imageWidth, imageHeight } = input;
  if (!points || points.length !== 21 || imageWidth <= 0 || imageHeight <= 0) return null;

  // Convert to pixel space
  const px = points.map((p) => ({
    x: p.x * imageWidth,
    y: p.y * imageHeight,
    z: (p.z ?? 0) * imageWidth,
  }));

  const d = (i: number, j: number): number => {
    const a = px[i]!;
    const b = px[j]!;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  // Palm dimensions:
  // Palm width W = 1.18 * distance(L5, L17) (index MCP to little MCP + fleshy edge)
  const palmWidth = 1.18 * d(5, 17);
  // Palm length L = distance(L0, L9) + 0.18 * distance(L9, L10) (wrist to middle MCP + cup)
  const palmLength = d(0, 9) + 0.18 * d(9, 10);

  // Finger lengths (sum of segments MCP->PIP->DIP->TIP)
  const L_thumb = d(1, 2) + d(2, 3) + d(3, 4);
  const L_index = d(5, 6) + d(6, 7) + d(7, 8);
  const L_middle = d(9, 10) + d(10, 11) + d(11, 12);
  const L_ring = d(13, 14) + d(14, 15) + d(15, 16);
  const L_little = d(17, 18) + d(18, 19) + d(19, 20);

  const fingerLengths = {
    thumb: L_thumb,
    index: L_index,
    middle: L_middle,
    ring: L_ring,
    little: L_little,
  };

  // Index vs Ring ratio normalized by middle finger length
  const indexVsRingDiff = (L_index - L_ring) / (L_middle || 1);
  let indexVsRing: 'indexLonger' | 'equal' | 'ringLonger' = 'equal';
  if (indexVsRingDiff > 0.025) {
    indexVsRing = 'indexLonger';
  } else if (indexVsRingDiff < -0.025) {
    indexVsRing = 'ringLonger';
  }

  // Thumb will (distal phalanx L3->L4) to logic (proximal phalanx L2->L3) ratio
  const thumbWillToLogicRatio = d(3, 4) / (d(2, 3) || 1e-6);

  // Palm axis vector V = L0 -> L9
  const axis = { x: px[9]!.x - px[0]!.x, y: px[9]!.y - px[0]!.y };
  const axisLenSq = axis.x * axis.x + axis.y * axis.y || 1e-6;
  const axisLen = Math.sqrt(axisLenSq);

  // Thumb set: projection of L2 on the L0->L9 axis as a fraction of d(L0, L9)
  const t2Vec = { x: px[2]!.x - px[0]!.x, y: px[2]!.y - px[0]!.y };
  const thumbProj = (t2Vec.x * axis.x + t2Vec.y * axis.y) / axisLenSq;
  let thumbSet: 'low' | 'medium' | 'high' = 'medium';
  if (thumbProj < 0.38) {
    thumbSet = 'low';
  } else if (thumbProj > 0.48) {
    thumbSet = 'high';
  }

  // Little finger set: project L20 (tip) and L15 (ring DIP) onto the palm axis L0->L9
  const v20 = { x: px[20]!.x - px[0]!.x, y: px[20]!.y - px[0]!.y };
  const v15 = { x: px[15]!.x - px[0]!.x, y: px[15]!.y - px[0]!.y };
  const proj20 = (v20.x * axis.x + v20.y * axis.y) / axisLen;
  const proj15 = (v15.x * axis.x + v15.y * axis.y) / axisLen;
  const littleRel = (proj20 - proj15) / (L_middle || 1);

  let littleFingerSet: 'low' | 'normal' | 'high' = 'normal';
  if (littleRel < -0.02) {
    littleFingerSet = 'low';
  } else if (littleRel > 0.02) {
    littleFingerSet = 'high';
  }

  // Dominant phalange: compare across the 4 main fingers
  const topTotal = d(7, 8) + d(11, 12) + d(15, 16) + d(19, 20);
  const midTotal = d(6, 7) + d(10, 11) + d(14, 15) + d(18, 19);
  const baseTotal = d(5, 6) + d(9, 10) + d(13, 14) + d(17, 18);
  const allPhalanges = topTotal + midTotal + baseTotal || 1;

  const sTop = topTotal / allPhalanges;
  const sMid = midTotal / allPhalanges;
  const sBase = baseTotal / allPhalanges;

  // Normalized relative to baseline { top: 0.28, middle: 0.31, base: 0.41 }
  const rTop = sTop / 0.28;
  const rMid = sMid / 0.31;
  const rBase = sBase / 0.41;

  let dominantPhalange: 'top' | 'middle' | 'base' | 'even' = 'even';
  const maxR = Math.max(rTop, rMid, rBase);
  const minR = Math.min(rTop, rMid, rBase);
  if (maxR - minR >= 0.06) {
    if (rTop === maxR) dominantPhalange = 'top';
    else if (rMid === maxR) dominantPhalange = 'middle';
    else dominantPhalange = 'base';
  }

  // Spacing (spread of fingertips relative to palm width)
  const tipSpread = (d(4, 8) + d(8, 12) + d(12, 16) + d(16, 20)) / (palmWidth || 1);
  let spacing: 'tight' | 'normal' | 'wide' = 'normal';
  if (tipSpread < 0.95) {
    spacing = 'tight';
  } else if (tipSpread > 1.55) {
    spacing = 'wide';
  }

  // Palm Shape and Classical 4 Elements
  const aspect = palmLength / (palmWidth || 1);
  const fingerRatio = L_middle / (palmLength || 1);

  let computedPalmShape: 'square' | 'rectangular' | 'narrow' | 'wide' = 'square';
  if (aspect >= 0.95 && aspect <= 1.08) {
    computedPalmShape = 'square';
  } else if (aspect > 1.08) {
    computedPalmShape = 'rectangular';
  } else if (palmWidth / palmLength > 1.08) {
    computedPalmShape = 'wide';
  } else {
    computedPalmShape = 'narrow';
  }

  let computedElement: 'Earth' | 'Air' | 'Fire' | 'Water' = 'Earth';
  if (computedPalmShape === 'square' || computedPalmShape === 'wide') {
    computedElement = fingerRatio < 0.8 ? 'Earth' : 'Air';
  } else {
    computedElement = fingerRatio < 0.8 ? 'Fire' : 'Water';
  }

  return {
    palmWidth: Math.round(palmWidth * 10) / 10,
    palmLength: Math.round(palmLength * 10) / 10,
    fingerLengths,
    indexVsRing,
    thumbWillToLogicRatio: Math.round(thumbWillToLogicRatio * 100) / 100,
    thumbSet,
    littleFingerSet,
    dominantPhalange,
    spacing,
    computedPalmShape,
    computedElement,
  };
}
