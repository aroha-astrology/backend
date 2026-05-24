import type { HandLandmarker as HandLandmarkerType } from '@mediapipe/tasks-vision';
import { computePolylines, type PalmPolylines } from './handLandmarks';

/**
 * Real-time wrapper around MediaPipe HandLandmarker for video frames.
 *
 * Mirrors the singleton pattern in handLandmarks.ts but runs in VIDEO mode
 * (so detectForVideo() can be called every animation frame without re-allocating).
 *
 * Returned bounding boxes are normalized 0–1 in the source video frame.
 * Use them to decide whether the user's palm is centered inside the on-screen
 * silhouette before auto-capture.
 */

let videoLandmarker: HandLandmarkerType | null = null;
let initPromise: Promise<HandLandmarkerType> | null = null;

async function getVideoLandmarker(): Promise<HandLandmarkerType> {
  if (videoLandmarker) return videoLandmarker;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { HandLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
    const vision = await FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.34/wasm`,
    );
    const lm = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    videoLandmarker = lm;
    return lm;
  })();

  return initPromise;
}

export interface LiveDetection {
  /** Whether a hand was detected this frame. */
  found: boolean;
  /** Bounding box in 0-1 video-frame coords. */
  bbox?: { x: number; y: number; w: number; h: number };
  /** Whether fingers are clearly spread (heuristic on MCP-to-tip ratios). */
  fingersSpread: boolean;
  /** Hand center in 0-1 video-frame coords. */
  center?: { x: number; y: number };
  /** Detection confidence (0–1) — proxied from min landmark visibility. */
  confidence: number;
  /** Major-line polylines (heart/head/life/fate) derived from this frame's landmarks. 0-1 coords. */
  polylines?: PalmPolylines;
}

const EMPTY: LiveDetection = { found: false, fingersSpread: false, confidence: 0 };

/**
 * Run hand detection on the current frame of a <video> element.
 * Returns immediately; safe to call inside requestAnimationFrame.
 *
 * Returns EMPTY if the detector isn't loaded yet, the video has no frame,
 * or no hand is in the frame.
 */
export async function liveDetect(video: HTMLVideoElement, timestamp: number): Promise<LiveDetection> {
  if (video.readyState < 2 || video.videoWidth === 0) return EMPTY;
  try {
    const detector = await getVideoLandmarker();
    const result = detector.detectForVideo(video, timestamp);

    if (!result.landmarks || result.landmarks.length === 0) return EMPTY;
    const lm = result.landmarks[0];
    if (!lm || lm.length < 21) return EMPTY;

    // Bounding box from landmarks
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of lm) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const bbox = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

    // "Fingers spread" heuristic: check the horizontal span between thumb tip
    // (4), index tip (8), and pinky tip (20). A spread hand has good separation.
    const thumbTip = lm[4];
    const indexTip = lm[8];
    const pinkyTip = lm[20];
    const handWidth = Math.abs(pinkyTip.x - thumbTip.x);
    const indexToPinky = Math.abs(pinkyTip.x - indexTip.x);
    const fingersSpread = handWidth > 0.18 && indexToPinky > 0.08;

    // Confidence proxy: handedness has a score but visibility isn't returned by
    // the JS API. We approximate via bbox area — a tiny detection is probably
    // unreliable; a near-full-frame one is solid.
    const area = (maxX - minX) * (maxY - minY);
    const confidence = Math.min(1, Math.max(0.3, area * 2.2));

    // Compute live polylines so the camera overlay can draw heart/head/life/fate
    // directly on the user's hand at video frame rate.
    const polylines = computePolylines(lm);

    return { found: true, bbox, fingersSpread, center, confidence, polylines };
  } catch {
    return EMPTY;
  }
}

/**
 * Quick brightness heuristic to detect low-light frames.
 * Samples a downscaled grayscale grid; returns average luminance 0–255.
 */
export function frameBrightness(video: HTMLVideoElement, canvas: HTMLCanvasElement): number {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || video.videoWidth === 0) return 128;
  const W = 24;
  const H = 24;
  canvas.width = W;
  canvas.height = H;
  try {
    ctx.drawImage(video, 0, 0, W, H);
    const { data } = ctx.getImageData(0, 0, W, H);
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      // standard luma
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      n++;
    }
    return n === 0 ? 128 : sum / n;
  } catch {
    return 128;
  }
}

/**
 * Check if the detected hand bbox overlaps the silhouette target box.
 * Both boxes are in 0-1 coords. The silhouette is centered horizontally
 * and occupies the middle ~60% of the viewport vertically.
 */
export function isAligned(bbox: { x: number; y: number; w: number; h: number }): boolean {
  // Target: center 60% horizontal, middle 70% vertical.
  const target = { x: 0.2, y: 0.15, w: 0.6, h: 0.7 };
  const handCenterX = bbox.x + bbox.w / 2;
  const handCenterY = bbox.y + bbox.h / 2;
  const targetCenterX = target.x + target.w / 2;
  const targetCenterY = target.y + target.h / 2;
  const dx = Math.abs(handCenterX - targetCenterX);
  const dy = Math.abs(handCenterY - targetCenterY);
  // Reasonable hand size — not too small, not edge-clipped.
  const sized = bbox.w > 0.25 && bbox.w < 0.92 && bbox.h > 0.3 && bbox.h < 0.95;
  return dx < 0.12 && dy < 0.14 && sized;
}

/** Capture the current video frame to a JPEG data URL at the source resolution. */
export function captureFrameToJpeg(video: HTMLVideoElement, quality = 0.9): string | null {
  if (video.videoWidth === 0) return null;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0);
  try {
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}
