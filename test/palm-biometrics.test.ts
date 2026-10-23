import { describe, it, expect } from 'vitest';
import { computePalmBiometrics } from '../src/lib/astro-engine/palm/palm-biometrics.js';
import type { PalmLandmarkPoint } from '../src/db/schema.js';

function makeLandmarks(pts: Array<[number, number]>): PalmLandmarkPoint[] {
  return pts.map(([x, y]) => ({ x, y, z: 0 }));
}

// Canonical 21 points for a standardized upright hand (normalized 0-1)
function standardHand(): PalmLandmarkPoint[] {
  const pts: Array<[number, number]> = [
    [0.5, 0.9], // 0: wrist
    // Thumb (1..4)
    [0.38, 0.78], // 1: CMC
    [0.3, 0.65], // 2: MCP
    [0.24, 0.52], // 3: IP
    [0.2, 0.42], // 4: TIP
    // Index (5..8)
    [0.38, 0.5], // 5: MCP
    [0.36, 0.38], // 6: PIP
    [0.35, 0.28], // 7: DIP
    [0.34, 0.18], // 8: TIP
    // Middle (9..12)
    [0.5, 0.48], // 9: MCP
    [0.5, 0.34], // 10: PIP
    [0.5, 0.22], // 11: DIP
    [0.5, 0.1], // 12: TIP
    // Ring (13..16)
    [0.62, 0.5], // 13: MCP
    [0.64, 0.38], // 14: PIP
    [0.65, 0.28], // 15: DIP
    [0.66, 0.18], // 16: TIP
    // Little (17..20)
    [0.72, 0.55], // 17: MCP
    [0.74, 0.45], // 18: PIP
    [0.75, 0.37], // 19: DIP
    [0.76, 0.29], // 20: TIP
  ];
  return makeLandmarks(pts);
}

describe('computePalmBiometrics', () => {
  it('returns null on invalid or incomplete points', () => {
    expect(computePalmBiometrics({ points: [], imageWidth: 800, imageHeight: 800 })).toBeNull();
    const partial = standardHand().slice(0, 20);
    expect(
      computePalmBiometrics({ points: partial, imageWidth: 800, imageHeight: 800 }),
    ).toBeNull();
    expect(
      computePalmBiometrics({ points: standardHand(), imageWidth: 0, imageHeight: 800 }),
    ).toBeNull();
  });

  it('computes positive palm width and length in pixel space', () => {
    const res = computePalmBiometrics({
      points: standardHand(),
      imageWidth: 1000,
      imageHeight: 1000,
    });
    expect(res).not.toBeNull();
    expect(res!.palmWidth).toBeGreaterThan(100);
    expect(res!.palmLength).toBeGreaterThan(100);
  });

  it('computes indexVsRing as equal when lengths are symmetric', () => {
    const res = computePalmBiometrics({
      points: standardHand(),
      imageWidth: 1000,
      imageHeight: 1000,
    });
    expect(res).not.toBeNull();
    expect(res!.indexVsRing).toBe('equal');
  });

  it('computes indexVsRing as indexLonger when index finger extends further', () => {
    const pts = standardHand();
    // Extend index tip (point 8) upward (lower y)
    pts[8]!.y = 0.12;
    const res = computePalmBiometrics({ points: pts, imageWidth: 1000, imageHeight: 1000 });
    expect(res).not.toBeNull();
    expect(res!.indexVsRing).toBe('indexLonger');
  });

  it('computes indexVsRing as ringLonger when ring finger extends further', () => {
    const pts = standardHand();
    // Extend ring tip (point 16) upward (lower y)
    pts[16]!.y = 0.12;
    const res = computePalmBiometrics({ points: pts, imageWidth: 1000, imageHeight: 1000 });
    expect(res).not.toBeNull();
    expect(res!.indexVsRing).toBe('ringLonger');
  });

  it('computes littleFingerSet relative to ring DIP crease', () => {
    const pts = standardHand();
    const res = computePalmBiometrics({ points: pts, imageWidth: 1000, imageHeight: 1000 });
    expect(res).not.toBeNull();
    expect(['low', 'normal', 'high']).toContain(res!.littleFingerSet);
  });

  it('computes element and palm shape', () => {
    const res = computePalmBiometrics({
      points: standardHand(),
      imageWidth: 1000,
      imageHeight: 1000,
    });
    expect(res).not.toBeNull();
    expect(['Earth', 'Air', 'Fire', 'Water']).toContain(res!.computedElement);
    expect(['square', 'rectangular', 'narrow', 'wide']).toContain(res!.computedPalmShape);
  });
});
