'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PalmCaptureGuide } from './PalmCaptureGuide';
import {
  liveDetect,
  isAligned,
  frameBrightness,
  captureFrameToJpeg,
  type LiveDetection,
} from '@/lib/palm/liveLandmarks';
import type { PalmPolylines } from '@/lib/palm/handLandmarks';

type Status =
  | 'idle'
  | 'requesting'
  | 'searching'
  | 'detected'
  | 'aligned'
  | 'capturing'
  | 'lowlight'
  | 'error';

interface Props {
  hand: 'left' | 'right';
  /**
   * Called once a frame is captured. Passes the JPEG data URL AND the most
   * recent live-detected polylines (or null if MediaPipe didn't have a fresh
   * hand reading at the capture moment). The parent should use these
   * polylines directly — they're more reliable than re-running detection
   * on the static frame, which often fails on full-frame palm captures.
   */
  onCapture: (dataUrl: string, polylines: PalmPolylines | null) => void;
  /** Called when the user wants to upload a photo instead. */
  onUseUpload: () => void;
}

const COUNTDOWN_MS = 1200;
const LOW_LIGHT_THRESHOLD = 28; // 0-255 luminance — dark backgrounds drag average down, so keep this low

/**
 * Astroline-style live capture. Opens the back camera, renders the
 * PalmCaptureGuide overlay, gates auto-capture on MediaPipe hand alignment,
 * and falls back gracefully to file upload when the camera is unavailable.
 *
 * The colored template lines on the guide are static; we do NOT draw detected
 * lines on the live feed. The HUD only reflects whether the user's palm is
 * placed correctly so we can trigger auto-capture at the right moment.
 */
export function LiveCapture({ hand, onCapture, onUseUpload }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const brightnessCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const alignedSinceRef = useRef<number | null>(null);
  const capturedRef = useRef(false);

  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [countdown, setCountdown] = useState<number | null>(null);
  /** Latest live polylines from MediaPipe — drawn directly on the user's hand. */
  const [livePolylines, setLivePolylines] = useState<PalmPolylines | null>(null);
  /** Ref mirror so doCapture can snapshot the latest polylines without re-creating the callback. */
  const livePolylinesRef = useRef<PalmPolylines | null>(null);
  /** Torch / flashlight controls — only available on devices whose back camera exposes it. */
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  /* ----------------------------- camera setup ---------------------------- */

  const startCamera = useCallback(async () => {
    setStatus('requesting');
    setErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1920 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      // Probe torch support — only the back camera on most phones exposes it.
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorchSupported(!!caps?.torch);
      setTorchOn(false);

      setStatus('searching');
    } catch (err) {
      const message =
        err instanceof Error && err.name === 'NotAllowedError'
          ? 'Camera permission denied'
          : err instanceof Error
            ? err.message
            : 'Camera unavailable';
      setErrorMsg(message);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (countdownRef.current) window.clearInterval(countdownRef.current);
    };
  }, [startCamera]);

  // Lock body scroll while the full-screen overlay is mounted.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  /* ----------------------------- capture frame ---------------------------- */

  const doCapture = useCallback(() => {
    if (capturedRef.current) return;
    const video = videoRef.current;
    if (!video) return;
    const dataUrl = captureFrameToJpeg(video, 0.9);
    if (!dataUrl) {
      setErrorMsg('Could not capture frame');
      setStatus('error');
      return;
    }
    capturedRef.current = true;
    setStatus('capturing');
    // Stop the camera so the preview freezes on the captured frame visually.
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    // Pass the latest live polylines so the parent doesn't need to re-run
    // MediaPipe on the static frame (which often fails on full-frame palms).
    onCapture(dataUrl, livePolylinesRef.current);
  }, [onCapture]);

  /* ----------------------------- torch toggle ----------------------------- */

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks?.()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await (track as MediaStreamTrack & {
        applyConstraints: (c: { advanced: Array<{ torch: boolean }> }) => Promise<void>;
      }).applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      // Some devices reject torch control mid-stream — silently swallow.
      setTorchSupported(false);
    }
  }, [torchOn]);

  /* ----------------------------- detection loop --------------------------- */

  useEffect(() => {
    if (status === 'error' || status === 'requesting' || status === 'idle' || status === 'capturing') {
      return;
    }
    let cancelled = false;
    let lastBrightnessCheck = 0;

    const loop = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      const brightnessCanvas = brightnessCanvasRef.current;
      if (!video || !brightnessCanvas) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const now = performance.now();

      // Brightness check every 500ms — cheap downscale.
      if (now - lastBrightnessCheck > 500) {
        lastBrightnessCheck = now;
        const lux = frameBrightness(video, brightnessCanvas);
        if (lux < LOW_LIGHT_THRESHOLD) {
          setStatus((s) => (s === 'capturing' || s === 'aligned' ? s : 'lowlight'));
          // Don't return — keep running detection so alignment can still trigger capture.
        }
      }

      const det: LiveDetection = await liveDetect(video, now);
      if (cancelled) return;

      // Push the live polylines to state so the overlay redraws.
      // Clear when no hand is detected so old lines don't linger.
      const nextPoly = det.polylines ?? null;
      livePolylinesRef.current = nextPoly;
      setLivePolylines(nextPoly);

      if (!det.found) {
        alignedSinceRef.current = null;
        setStatus((s) => (s === 'capturing' || s === 'lowlight' ? s : 'searching'));
        setCountdown(null);
      } else if (!det.bbox || !isAligned(det.bbox) || !det.fingersSpread) {
        alignedSinceRef.current = null;
        setStatus((s) => (s === 'capturing' ? s : 'detected'));
        setCountdown(null);
      } else {
        if (alignedSinceRef.current == null) alignedSinceRef.current = now;
        const heldFor = now - alignedSinceRef.current;
        setStatus((s) => (s === 'capturing' ? s : 'aligned'));
        const remaining = Math.max(0, COUNTDOWN_MS - heldFor);
        setCountdown(Math.ceil(remaining / 1000));
        if (heldFor >= COUNTDOWN_MS && !capturedRef.current) {
          doCapture();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [status, doCapture]);

  /* ----------------------------- HUD copy --------------------------------- */

  const hudCopy = (() => {
    switch (status) {
      case 'idle':
      case 'requesting':
        return `Allow camera access to begin`;
      case 'searching':
        return `Place your ${hand} palm inside the outline`;
      case 'detected':
        return `Center your palm · spread your fingers`;
      case 'aligned':
        return countdown != null
          ? `✓ Tap to capture or hold still… ${countdown}s`
          : `✓ Tap to capture`;
      case 'capturing':
        return `Captured ✓`;
      case 'lowlight':
        return `Find better light`;
      case 'error':
        return errorMsg || `Camera unavailable`;
    }
  })();

  /* ----------------------------- render ----------------------------------- */

  // Error state: surface fallback prominently
  if (status === 'error') {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/50 px-6 py-10 text-center">
        <p className="text-[13px] font-semibold text-white mb-2">{errorMsg}</p>
        <p className="text-[11px] text-white/65 mb-5">
          You can still get your reading by uploading a clear photo of your {hand} palm.
        </p>
        <button
          type="button"
          onClick={onUseUpload}
          className="rounded-full bg-[var(--primary)] px-5 py-2 text-[12px] font-semibold text-white"
        >
          Upload a photo instead
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[100] overflow-hidden bg-black"
      style={{ touchAction: 'none' }}
    >
      {/* Close button — exits live capture back to the page */}
      <button
        type="button"
        onClick={onUseUpload}
        aria-label="Close camera"
        className="absolute top-4 left-4 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-md border border-white/15"
      >
        ✕
      </button>

      {/* Torch / flashlight toggle — only rendered when the back camera exposes it */}
      {torchSupported && (
        <button
          type="button"
          onClick={toggleTorch}
          aria-label={torchOn ? 'Turn flashlight off' : 'Turn flashlight on'}
          aria-pressed={torchOn}
          className="absolute top-4 right-4 z-20 flex items-center gap-1.5 rounded-full backdrop-blur-md border px-3 h-9 text-[12px] font-medium transition-colors"
          style={{
            background: torchOn ? 'rgba(252,211,77,0.22)' : 'rgba(0,0,0,0.6)',
            borderColor: torchOn ? 'rgba(252,211,77,0.55)' : 'rgba(255,255,255,0.15)',
            color: torchOn ? '#FCD34D' : '#fff',
          }}
        >
          <span aria-hidden style={{ fontSize: 14 }}>{torchOn ? '🔦' : '💡'}</span>
          {torchOn ? 'Flash on' : 'Flash off'}
        </button>
      )}

      {/* Camera feed */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        style={{
          // Don't mirror — back camera shows the world as-is. The silhouette
          // mirrors itself for left-hand mode in PalmCaptureGuide.
          transform: 'none',
        }}
      />

      {/* Vignette to make the silhouette pop */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0.0) 35%, rgba(0,0,0,0.55) 100%)',
        }}
      />

      {/* Title — sits below the close button so they don't overlap on narrow phones */}
      <div className="absolute top-16 left-16 right-4 pointer-events-none">
        <h2 className="text-[15px] font-bold text-white font-[family-name:var(--font-serif)] drop-shadow-md leading-tight">
          Take a photo of your{' '}
          <span style={{ color: '#FCD34D' }}>{hand} palm</span>
        </h2>
      </div>

      {/* Astroline-style guide overlay — only visible while we haven't locked
          onto the user's hand yet, so the live-detected lines on their actual
          hand are the focus once detection lands. */}
      {!livePolylines && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <PalmCaptureGuide hand={hand} status={status === 'requesting' ? 'idle' : status} />
        </div>
      )}

      {/* HUD status pill */}
      <AnimatePresence mode="wait">
        <motion.div
          key={hudCopy}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className="absolute bottom-20 inset-x-0 flex justify-center pointer-events-none"
        >
          <div
            className="rounded-full px-4 py-1.5 text-[12px] font-medium text-white border border-white/15 backdrop-blur-md"
            style={{
              background:
                status === 'aligned'
                  ? 'rgba(34,197,94,0.32)'
                  : status === 'lowlight'
                    ? 'rgba(245,158,11,0.32)'
                    : 'rgba(0,0,0,0.5)',
            }}
          >
            {hudCopy}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Capture button — DISABLED until the user's palm is aligned inside the
          silhouette. Once aligned, the button enlarges, gains a green border,
          and shows a pulsing ring so the "ready" moment is unmistakable. */}
      <div className="absolute bottom-5 inset-x-0 flex flex-col items-center gap-2.5">
        <button
          type="button"
          onClick={doCapture}
          disabled={status !== 'aligned' && status !== 'capturing' && status !== 'lowlight'}
          className={`relative rounded-full transition-all duration-200 ${
            status === 'aligned' || status === 'capturing'
              ? 'h-16 w-16 border-[4px] border-[#22C55E] bg-white shadow-[0_0_14_rgba(34,197,94,0.85)] active:scale-95'
              : status === 'lowlight'
                ? 'h-14 w-14 border-[3px] border-[#F59E0B] bg-white/80 shadow-[0_0_18px_rgba(245,158,11,0.6)] active:scale-95'
                : 'h-14 w-14 border-[3px] border-white/30 bg-white/20 opacity-50 cursor-not-allowed'
          }`}
          aria-label="Capture palm photo"
        >
          {(status === 'aligned' || status === 'capturing') && (
            <span
              aria-hidden
              className="absolute inset-[-6px] rounded-full border-2 border-[#22C55E]/55 animate-ping pointer-events-none"
            />
          )}
        </button>
        <button
          type="button"
          onClick={onUseUpload}
          className="text-[11px] font-medium text-white/75 underline underline-offset-2"
        >
          Use a photo instead
        </button>
      </div>

      {/* Hidden brightness sampler */}
      <canvas ref={brightnessCanvasRef} className="hidden" />
    </div>
  );
}

