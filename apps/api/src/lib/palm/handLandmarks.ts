import type { HandLandmarker as HandLandmarkerType, HandLandmarkerResult } from '@mediapipe/tasks-vision';

type Pt = [number, number];

export interface PalmPolylines {
  heart: Pt[] | null;
  head: Pt[] | null;
  life: Pt[] | null;
  fate: Pt[] | null;
}

// Singleton — we only ever need one landmarker instance per page load.
let landmarker: HandLandmarkerType | null = null;

async function getLandmarker(): Promise<HandLandmarkerType> {
  if (landmarker) return landmarker;

  const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');

  const vision = await FilesetResolver.forVisionTasks(
    `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm`,
  );

  landmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    numHands: 1,
    minHandDetectionConfidence: 0.4,
    minHandPresenceConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });

  return landmarker;
}

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const pt = (x: number, y: number): Pt => [clamp(x), clamp(y)];

/**
 * Given 21 MediaPipe hand landmarks (normalized 0-1), derive the 4 major
 * palmistry lines as ordered polyline arrays.
 *
 * Landmark indices (MediaPipe canonical):
 *   0=WRIST  1=THUMB_CMC  2=THUMB_MCP  5=INDEX_MCP  9=MIDDLE_MCP
 *   13=RING_MCP  17=PINKY_MCP
 */
export function computePolylines(lm: Array<{ x: number; y: number }>): PalmPolylines {
  const w = lm[0];       // WRIST
  const tCmc = lm[1];    // THUMB_CMC
  const iMcp = lm[5];    // INDEX_MCP
  const mMcp = lm[9];    // MIDDLE_MCP
  const rMcp = lm[13];   // RING_MCP
  const pMcp = lm[17];   // PINKY_MCP

  // "palm direction" scalar: fraction t=0 at MCP row, t=1 at wrist.
  // py(baseY, t) gives a y coordinate t-fraction toward the wrist from baseY.
  const py = (baseY: number, t: number) => lerp(baseY, w.y, t);

  // Thumb-web anchor: between THUMB_CMC and INDEX_MCP — start of life + head lines.
  const webX = lerp(tCmc.x, iMcp.x, 0.55);
  const webY = lerp(tCmc.y, iMcp.y, 0.55);

  // ── Heart line ──────────────────────────────────────────────────────────────
  // Runs just below the MCP row (upper palm). From pinky side → index side.
  const heart: Pt[] = [
    pt(pMcp.x, py(pMcp.y, 0.13)),
    pt(rMcp.x, py(rMcp.y, 0.13)),
    pt(mMcp.x, py(mMcp.y, 0.12)),
    pt(iMcp.x, py(iMcp.y, 0.09)),
  ];

  // ── Head line ────────────────────────────────────────────────────────────────
  // Runs across the middle of the palm. Starts from thumb-web, ends pinky side.
  const head: Pt[] = [
    pt(webX, py(webY, 0.05)),
    pt(iMcp.x, py(iMcp.y, 0.28)),
    pt(mMcp.x, py(mMcp.y, 0.32)),
    pt(rMcp.x, py(rMcp.y, 0.34)),
    pt(pMcp.x, py(pMcp.y, 0.34)),
  ];

  // ── Life line ────────────────────────────────────────────────────────────────
  // Arcs from thumb-web downward, curving around the thumb mount toward wrist.
  const life: Pt[] = [
    pt(webX, webY),
    pt(lerp(tCmc.x, iMcp.x, 0.2), py(tCmc.y, 0.15)),
    pt(tCmc.x, py(tCmc.y, 0.38)),
    pt(lerp(tCmc.x, w.x, 0.55), py(lerp(tCmc.y, w.y, 0.55), 0.68)),
    pt(w.x, w.y),
  ];

  // ── Fate line ────────────────────────────────────────────────────────────────
  // Vertical line from wrist to roughly 20% above middle-MCP.
  const fate: Pt[] = [
    pt(w.x, w.y),
    pt(lerp(w.x, mMcp.x, 0.4), py(mMcp.y, 0.72)),
    pt(lerp(w.x, mMcp.x, 0.7), py(mMcp.y, 0.45)),
    pt(mMcp.x, py(mMcp.y, 0.22)),
  ];

  return { heart, head, life, fate };
}

/**
 * Run MediaPipe HandLandmarker on an image element and return the 4 major
 * palmistry line polylines. Returns `null` for all lines if no hand is found.
 *
 * Coordinates are normalized 0–1 in the original image's coordinate frame,
 * matching the SVG viewBox convention used by PalmInfographic after Phase 2.
 */
export async function traceLines(
  image: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
  _hand: 'left' | 'right',
): Promise<PalmPolylines> {
  const empty: PalmPolylines = { heart: null, head: null, life: null, fate: null };

  try {
    const detector = await getLandmarker();
    let result: HandLandmarkerResult;

    if (image instanceof HTMLImageElement) {
      result = detector.detect(image);
    } else {
      // ImageBitmap / HTMLCanvasElement — detect() accepts these too
      result = detector.detect(image as Parameters<typeof detector.detect>[0]);
    }

    if (!result.landmarks || result.landmarks.length === 0) return empty;

    // Pick the first (and only, since numHands=1) detected hand.
    const lm = result.landmarks[0];
    if (!lm || lm.length < 18) return empty;

    return computePolylines(lm);
  } catch (err) {
    console.warn('[handLandmarks] detection failed, no overlay will be shown:', err);
    return empty;
  }
}
