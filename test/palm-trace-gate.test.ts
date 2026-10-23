import { describe, it, expect } from 'vitest';
import {
  gateTraces,
  orientationFromLandmarks,
  buildInnerPalmPolygon,
  pointInPolygon,
} from '../src/lib/palm/trace-gate.js';
import type { PalmHandObservations } from '../src/lib/astro-engine/palm/palm-types.js';
import type { SnapImages } from '../src/lib/palm/image-prep.js';

function makeMockImages(): SnapImages {
  // 100x100 mock plain and equalised images
  const size = 100 * 100;
  const data = new Uint8Array(size);
  // Fill with neutral skin tone ~150
  data.fill(150);
  return {
    equalised: { data, width: 100, height: 100 },
    plain: { data, width: 100, height: 100 },
  };
}

function baseObs(): PalmHandObservations {
  return {
    hand: 'right',
    imageQuality: { score: 9, lineVisibility: 9, lighting: 8, focus: 9, framing: 9 },
    handType: { element: 'Earth', palmShape: 'square', skinTexture: 'medium' },
    mounts: {
      jupiter: 'normal',
      saturn: 'normal',
      apollo: 'normal',
      mercury: 'normal',
      venus: 'normal',
      luna: 'normal',
      marsUpper: 'normal',
      marsLower: 'normal',
      rahuPlain: 'normal',
    },
    majorLines: {
      heartLine: {
        present: true,
        polyline: [
          [0.8, 0.4],
          [0.5, 0.38],
          [0.3, 0.42],
        ],
        confidence: 0.9,
      },
      headLine: {
        present: true,
        polyline: [
          [0.3, 0.5],
          [0.5, 0.55],
          [0.75, 0.6],
        ],
        confidence: 0.9,
      },
      lifeLine: {
        present: true,
        polyline: [
          [0.3, 0.5],
          [0.35, 0.65],
          [0.45, 0.85],
        ],
        confidence: 0.9,
      },
      fateLine: {
        present: false,
        confidence: 0,
      },
    },
    minorLines: {
      marriageLines: { count: 0 },
      childrenLines: { count: 0 },
      intuitionLine: { present: false },
      travelLines: { count: 0 },
    },
    thumb: { flexibility: 'normal', setAngle: 'medium' },
    fingerprints: [],
    specialMarkings: [],
    orientation: 'fingersUp',
    palmBox: [0.1, 0.2, 0.9, 0.95],
  };
}

describe('orientationFromLandmarks', () => {
  it('returns fingersUp when middle MCP (L9) is above wrist (L0)', () => {
    const lms: Array<{ x: number; y: number }> = Array.from({ length: 21 }, () => ({
      x: 0.5,
      y: 0.5,
    }));
    lms[0] = { x: 0.5, y: 0.8 }; // L0
    lms[9] = { x: 0.5, y: 0.3 }; // L9: y is smaller (higher in frame)
    expect(orientationFromLandmarks(lms)).toBe('fingersUp');
  });

  it('returns fingersDown when middle MCP is below wrist', () => {
    const lms: Array<{ x: number; y: number }> = Array.from({ length: 21 }, () => ({
      x: 0.5,
      y: 0.5,
    }));
    lms[0] = { x: 0.5, y: 0.2 }; // L0
    lms[9] = { x: 0.5, y: 0.7 }; // L9
    expect(orientationFromLandmarks(lms)).toBe('fingersDown');
  });
});

describe('buildInnerPalmPolygon & pointInPolygon', () => {
  it('builds polygon with boundary vertices from 21 landmarks', () => {
    const lms: Array<{ x: number; y: number }> = Array.from({ length: 21 }, (_, i) => ({
      x: 0.5 + 0.01 * i,
      y: 0.5 + 0.01 * i,
    }));
    const poly = buildInnerPalmPolygon(lms);
    expect(poly.length).toBeGreaterThanOrEqual(6);
  });

  it('correctly tests point containment inside palm polygon', () => {
    const poly: Array<[number, number]> = [
      [0.2, 0.2],
      [0.8, 0.2],
      [0.8, 0.8],
      [0.2, 0.8],
    ];
    expect(pointInPolygon([0.5, 0.5], poly)).toBe(true);
    expect(pointInPolygon([0.1, 0.5], poly)).toBe(false);
    expect(pointInPolygon([0.5, 0.9], poly)).toBe(false);
  });
});

describe('gateTraces (live gate, palm.strictGate off)', () => {
  // Hand points pointing the fingers DOWN, unlike the model's fingersUp.
  const downLandmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
  downLandmarks[0] = { x: 0.5, y: 0.2 };
  downLandmarks[9] = { x: 0.5, y: 0.7 };

  it("ignores the hand points: keeps the model's orientation", () => {
    const obs = baseObs();
    gateTraces(obs, makeMockImages(), { strictGate: false, landmarks: downLandmarks });
    expect(obs.orientation).toBe('fingersUp');
  });

  it('the strict gate does use them', () => {
    const obs = baseObs();
    gateTraces(obs, makeMockImages(), { strictGate: true, landmarks: downLandmarks });
    expect(obs.orientation).toBe('fingersDown');
  });
});

describe('gateTraces (strict mode)', () => {
  it('suppresses line when confidence is undefined under strict gate (Step 4B)', () => {
    const obs = baseObs();
    // remove confidence
    delete obs.majorLines.heartLine.confidence;

    const images = makeMockImages();
    const res = gateTraces(obs, images, { strictGate: true });
    expect(obs.majorLines.heartLine.trace?.drawable).toBe(false);
    expect(res.suppressed).toContain('heartLine');
    expect(res.suppressedReason['heartLine']).toContain('missing line confidence');
  });

  it('suppresses line when confidence is below strict threshold (0.65 for T1)', () => {
    const obs = baseObs();
    obs.majorLines.heartLine.confidence = 0.5; // below 0.65

    const images = makeMockImages();
    const res = gateTraces(obs, images, { strictGate: true });
    expect(obs.majorLines.heartLine.trace?.drawable).toBe(false);
    expect(res.suppressed).toContain('heartLine');
    expect(res.suppressedReason['heartLine']).toContain('confidence 0.5 < required 0.65');
  });
});
