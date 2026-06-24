/**
 * MediaPipe Hand Landmarker — client-side palm-photo validator and auto-cropper.
 *
 * Why: a weak vision model hallucinates lines on bad inputs. Catching obvious
 * problems (no hand, fingers closed, palm facing away, off-center) before
 * upload protects the model and saves a round-trip.
 *
 * The WASM bundle is ~3 MB so we lazy-load it only when this module is used.
 */

import type { HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';

export interface HandValidation {
  ok: boolean;
  /** Reason the photo was rejected, if any. */
  reason?: string;
  /** Suggestion to show the user. */
  hint?: string;
  /** Auto-crop bounding box in [0,1] coords (of the original image). */
  bbox?: { x: number; y: number; w: number; h: number };
  /** MediaPipe-reported handedness ("Left" or "Right"). */
  handedness?: string;
  /** Whether the palm is facing the camera (vs back-of-hand). */
  palmUp?: boolean;
  /** Average spread between adjacent finger MCPs — 0..1, higher = more open. */
  fingerSpread?: number;
}

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm';

let landmarkerPromise: Promise<HandLandmarker> | null = null;

async function getLandmarker(): Promise<HandLandmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      return HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
        runningMode: 'IMAGE',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    })().catch((err) => {
      // Reset so the next call retries (e.g. transient CDN failure).
      landmarkerPromise = null;
      throw err;
    });
  }
  return landmarkerPromise;
}

/* -------------------------------------------------------------------------- */
/*  Geometry helpers                                                          */
/* -------------------------------------------------------------------------- */

// MediaPipe landmark indices: https://developers.google.com/mediapipe/solutions/vision/hand_landmarker
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_TIP = 12;
const RING_MCP = 13;
const RING_TIP = 16;
const PINKY_MCP = 17;
const PINKY_TIP = 20;

type Pt = { x: number; y: number; z: number };

function dist(a: Pt, b: Pt): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Palm-up detection via the cross product of the wrist→index-MCP and
 * wrist→pinky-MCP vectors in screen space. The sign correlates with whether
 * the palm faces the camera, but depends on which hand it is.
 */
function isPalmUp(landmarks: Pt[], handedness: string): boolean {
  const w = landmarks[WRIST];
  const i = landmarks[INDEX_MCP];
  const p = landmarks[PINKY_MCP];
  const cross = (i.x - w.x) * (p.y - w.y) - (i.y - w.y) * (p.x - w.x);
  // In static photos (non-mirrored), a "Right" hand with palm up has the
  // thumb on the right → cross is negative. Opposite of a mirrored selfie feed.
  return handedness === 'Right' ? cross < 0 : cross > 0;
}

/**
 * 0 = fingers closed in a fist; ~1 = fingers fully fanned.
 * Computed as the mean adjacent-tip distance, normalised by palm width.
 */
function fingerSpread(landmarks: Pt[]): number {
  const palmWidth = dist(landmarks[INDEX_MCP], landmarks[PINKY_MCP]) || 1;
  const tips = [landmarks[THUMB_TIP], landmarks[INDEX_TIP], landmarks[MIDDLE_TIP], landmarks[RING_TIP], landmarks[PINKY_TIP]];
  let sum = 0;
  for (let i = 0; i < tips.length - 1; i++) sum += dist(tips[i], tips[i + 1]);
  return sum / 4 / palmWidth;
}

function bboxOf(landmarks: Pt[], pad = 0.08): { x: number; y: number; w: number; h: number } {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const lm of landmarks) {
    if (lm.x < minX) minX = lm.x;
    if (lm.x > maxX) maxX = lm.x;
    if (lm.y < minY) minY = lm.y;
    if (lm.y > maxY) maxY = lm.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  return {
    x: Math.max(0, minX - pad * w),
    y: Math.max(0, minY - pad * h),
    w: Math.min(1, w + 2 * pad * w),
    h: Math.min(1, h + 2 * pad * h),
  };
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

export async function validatePalmImage(image: HTMLImageElement): Promise<HandValidation> {
  let result: HandLandmarkerResult;
  try {
    const lm = await getLandmarker();
    result = lm.detect(image);
  } catch (err) {
    return {
      ok: false,
      reason: 'detector-failed',
      hint: 'Could not load the hand detector — try again or use a different network.',
    };
  }

  if (!result.landmarks || result.landmarks.length === 0) {
    return {
      ok: false,
      reason: 'no-hand',
      hint: 'No hand detected. Hold your palm flat, fully in frame, against a plain background.',
    };
  }

  const landmarks = result.landmarks[0] as Pt[];
  const handedness = result.handedness?.[0]?.[0]?.categoryName ?? '';
  const palmUp = isPalmUp(landmarks, handedness);
  const spread = fingerSpread(landmarks);
  const bbox = bboxOf(landmarks);

  if (!palmUp) {
    return {
      ok: false,
      reason: 'palm-down',
      hint: "We're seeing the back of your hand — flip it so your palm faces the camera.",
      handedness,
      palmUp,
      fingerSpread: spread,
      bbox,
    };
  }

  if (spread < 0.32) {
    return {
      ok: false,
      reason: 'fingers-closed',
      hint: 'Spread your fingers gently so each line is visible — not clenched, not splayed wide.',
      handedness,
      palmUp,
      fingerSpread: spread,
      bbox,
    };
  }

  if (bbox.w < 0.35 || bbox.h < 0.35) {
    return {
      ok: false,
      reason: 'too-small',
      hint: 'Your hand is too small in the frame — bring it closer to the camera.',
      handedness,
      palmUp,
      fingerSpread: spread,
      bbox,
    };
  }

  return { ok: true, handedness, palmUp, fingerSpread: spread, bbox };
}

/**
 * Crop an image to the validated bbox and return a JPEG dataURL.
 * The crop is padded by ~8% (already baked into bboxOf) so we don't clip the
 * fingertips. Returns the original dataURL if anything goes wrong.
 */
export async function cropToBbox(
  image: HTMLImageElement,
  bbox: { x: number; y: number; w: number; h: number },
  maxDim = 1500,
): Promise<string> {
  const sx = Math.round(bbox.x * image.naturalWidth);
  const sy = Math.round(bbox.y * image.naturalHeight);
  const sw = Math.round(bbox.w * image.naturalWidth);
  const sh = Math.round(bbox.h * image.naturalHeight);

  const scale = Math.min(1, maxDim / Math.max(sw, sh));
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);

  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return image.src;
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, dw, dh);
  return canvas.toDataURL('image/jpeg', 0.9);
}

/** Load a dataURL into an HTMLImageElement so we can pass it to the detector. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = src;
  });
}
