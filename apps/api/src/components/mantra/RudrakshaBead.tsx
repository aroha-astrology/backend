'use client';

import { useEffect, useImperativeHandle, useRef, forwardRef, useState, useId } from 'react';

interface Props {
  mukhi: number;
  size: number;
  locked: boolean;
  onTap: () => void;
  /** Hide cast shadow when the bead sits on a string (mala carousel). */
  hideShadow?: boolean;
  /** Hide breathing halo (mala carousel renders its own). */
  hideHalo?: boolean;
}

export interface RudrakshaBeadRef {
  pulse: () => void;
}

/**
 * Photoreal Rudraksha bead (SVG only).
 *   - Layered radial gradients give an organic cherry-brown silhouette.
 *   - Each mukhi groove is drawn as a paired light/dark stroke (carved depth).
 *   - Specular highlight at top-left + dark rim shading + cast shadow below.
 *   - mukhi=0 → smooth deity bead with Om glyph.
 *   - `pulse()` plays the count-tap scale + glow flash.
 */
export const RudrakshaBead = forwardRef<RudrakshaBeadRef, Props>(function RudrakshaBead(
  { mukhi, size, locked, onTap, hideShadow = false, hideHalo = false },
  ref,
) {
  const [scale, setScale] = useState(1);
  const [glow, setGlow] = useState(0.0);
  const [breathePhase, setBreathePhase] = useState(0);
  const pulseTimerRef = useRef<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    if (hideHalo) return;
    const id = setInterval(() => {
      setBreathePhase((p) => (p + 1) % 360);
    }, 50);
    return () => clearInterval(id);
  }, [hideHalo]);

  useImperativeHandle(ref, () => ({
    pulse: () => {
      if (pulseTimerRef.current) window.clearTimeout(pulseTimerRef.current);
      setScale(1.1);
      setGlow(0.75);
      pulseTimerRef.current = window.setTimeout(() => {
        setScale(1.0);
        setGlow(0);
      }, 220);
    },
  }));

  const cx = size / 2;
  const cy = size / 2;
  const beadR = size * 0.34;
  const haloR = size * 0.46;
  const outerR = size * 0.5;
  const shadowRy = size * 0.045;
  const shadowCy = cy + beadR + size * 0.04;

  // Mukhi grooves: curved paths from top to bottom; offset N-fold around the centerline.
  const mukhiPaths: string[] = [];
  if (mukhi > 0) {
    for (let i = 0; i < mukhi; i++) {
      const angleDeg = (i / mukhi) * 180 - 90;
      const t = Math.sin((angleDeg * Math.PI) / 180);
      const widthAtCenter = beadR * Math.abs(t) * 0.95;
      const startX = cx;
      const startY = cy - beadR * 0.95;
      const endX = cx;
      const endY = cy + beadR * 0.95;
      const cp1X = cx + widthAtCenter;
      const cp1Y = cy;
      mukhiPaths.push(`M ${startX} ${startY} Q ${cp1X} ${cp1Y} ${endX} ${endY}`);
    }
  }

  const breatheScale = hideHalo ? 1 : 1 + 0.06 * Math.sin((breathePhase * Math.PI) / 180);
  const breatheOpacity = locked || hideHalo ? 0 : 0.16 + 0.22 * Math.sin((breathePhase * Math.PI) / 180);

  return (
    <div
      style={{
        width: size,
        height: size,
        position: 'relative',
        display: 'inline-block',
      }}
    >
      {/* Cast shadow under the bead — sells the resting-in-space feel */}
      {!hideShadow && (
        <svg
          width={size}
          height={size}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            transform: `scale(${scale})`,
            transition: 'transform 220ms ease-out',
          }}
        >
          <defs>
            <radialGradient id={`shadow${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(0,0,0,0.42)" />
              <stop offset="60%" stopColor="rgba(0,0,0,0.15)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
          </defs>
          <ellipse
            cx={cx}
            cy={shadowCy}
            rx={beadR * 0.9}
            ry={shadowRy}
            fill={`url(#shadow${uid})`}
          />
        </svg>
      )}

      {/* Breathing halo */}
      {!hideHalo && (
        <svg
          width={size}
          height={size}
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            transform: `scale(${breatheScale})`,
            opacity: breatheOpacity,
            transition: 'opacity 60ms linear',
          }}
        >
          <defs>
            <radialGradient id={`halo${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="55%" stopColor="rgba(212,175,55,0)" />
              <stop offset="80%" stopColor="rgba(242,202,80,0.55)" />
              <stop offset="100%" stopColor="rgba(212,175,55,0)" />
            </radialGradient>
          </defs>
          <circle cx={cx} cy={cy} r={outerR} fill={`url(#halo${uid})`} />
        </svg>
      )}

      {/* Tap glow ring */}
      <svg
        width={size}
        height={size}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: glow,
          transition: 'opacity 220ms ease-out',
        }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={haloR}
          stroke="rgba(242,202,80,0.7)"
          strokeWidth={1.5}
          fill="none"
        />
      </svg>

      {/* Bead body */}
      <button
        type="button"
        onClick={onTap}
        disabled={locked}
        aria-label="Tap to count"
        style={{
          position: 'absolute',
          inset: 0,
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: locked ? 'default' : 'pointer',
          opacity: locked ? 0.55 : 1,
          transform: `scale(${scale})`,
          transition: 'transform 220ms ease-out, opacity 180ms ease-out',
        }}
      >
        <svg width={size} height={size}>
          <defs>
            {/* Outer silhouette — deep cherry brown radial */}
            <radialGradient id={`beadOuter${uid}`} cx="48%" cy="48%" r="52%">
              <stop offset="0%" stopColor="#8a4626" />
              <stop offset="55%" stopColor="#5a2a17" />
              <stop offset="85%" stopColor="#2a0f06" />
              <stop offset="100%" stopColor="#0d0301" />
            </radialGradient>
            {/* Warm core — biases shading toward the top-left */}
            <radialGradient id={`beadCore${uid}`} cx="32%" cy="28%" r="65%">
              <stop offset="0%" stopColor="#c98553" />
              <stop offset="25%" stopColor="#9c5a32" />
              <stop offset="55%" stopColor="rgba(120,60,28,0.35)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </radialGradient>
            {/* Specular highlight — soft white ellipse, organic shape */}
            <radialGradient id={`spec${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,240,210,0.85)" />
              <stop offset="50%" stopColor="rgba(255,240,210,0.25)" />
              <stop offset="100%" stopColor="rgba(255,240,210,0)" />
            </radialGradient>
            {/* Mukhi groove — light edge gradient (catches highlight) */}
            <linearGradient id={`grooveLight${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,210,150,0)" />
              <stop offset="45%" stopColor="rgba(255,210,150,0.55)" />
              <stop offset="100%" stopColor="rgba(255,210,150,0)" />
            </linearGradient>
            {/* Mukhi groove — dark edge gradient (the carved shadow) */}
            <linearGradient id={`grooveDark${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(0,0,0,0)" />
              <stop offset="50%" stopColor="rgba(0,0,0,0.85)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0)" />
            </linearGradient>
            {/* Rim darkening — soft black halo at the silhouette edge */}
            <radialGradient id={`rim${uid}`} cx="50%" cy="50%" r="50%">
              <stop offset="78%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.75)" />
            </radialGradient>
            {/* Micro-noise filter — breaks the perfect gradient with organic surface */}
            <filter id={`noise${uid}`} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="3" />
              <feColorMatrix
                values="0 0 0 0 0
                        0 0 0 0 0
                        0 0 0 0 0
                        0 0 0 0.15 0"
              />
              <feComposite in2="SourceGraphic" operator="in" />
            </filter>
          </defs>

          {/* Base silhouette */}
          <circle cx={cx} cy={cy} r={beadR} fill={`url(#beadOuter${uid})`} />

          {/* Warm core (top-left bias) */}
          <circle cx={cx} cy={cy} r={beadR} fill={`url(#beadCore${uid})`} />

          {/* Organic noise overlay */}
          <circle
            cx={cx}
            cy={cy}
            r={beadR}
            fill="#000"
            filter={`url(#noise${uid})`}
            opacity={0.55}
          />

          {/* Brahmarandhra (top pore) — recessed dark spot with tiny inner highlight */}
          <circle cx={cx} cy={cy - beadR + 5} r={3} fill="#1a0703" />
          <circle cx={cx - 0.6} cy={cy - beadR + 4.4} r={0.8} fill="rgba(255,210,150,0.35)" />

          {/* Mukhi grooves — paired dark+light strokes for carved depth */}
          {mukhiPaths.length > 0 && (
            <>
              {/* Shadow edge (slightly to the right of true centerline) */}
              <g opacity={0.95}>
                {mukhiPaths.map((d, i) => (
                  <path
                    key={`d${i}`}
                    d={d}
                    stroke={`url(#grooveDark${uid})`}
                    strokeWidth={1.8}
                    fill="none"
                    transform={`translate(0.6, 0)`}
                  />
                ))}
              </g>
              {/* Light edge (catches the top-left light) */}
              <g opacity={0.85}>
                {mukhiPaths.map((d, i) => (
                  <path
                    key={`l${i}`}
                    d={d}
                    stroke={`url(#grooveLight${uid})`}
                    strokeWidth={1.2}
                    fill="none"
                    transform={`translate(-0.6, 0)`}
                  />
                ))}
              </g>
            </>
          )}

          {/* Om glyph for deity beads (mukhi = 0) */}
          {mukhi === 0 && (
            <text
              x={cx}
              y={cy + beadR * 0.22}
              fontSize={beadR * 0.95}
              fontWeight={700}
              fill="rgba(242,202,80,0.92)"
              textAnchor="middle"
              style={{ filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.6))' }}
            >
              ॐ
            </text>
          )}

          {/* Rim darkening — pushes the silhouette */}
          <circle cx={cx} cy={cy} r={beadR} fill={`url(#rim${uid})`} />

          {/* Specular highlight — elongated, top-left */}
          <ellipse
            cx={cx - beadR * 0.32}
            cy={cy - beadR * 0.42}
            rx={beadR * 0.32}
            ry={beadR * 0.16}
            fill={`url(#spec${uid})`}
            transform={`rotate(-32 ${cx - beadR * 0.32} ${cy - beadR * 0.42})`}
          />
        </svg>
      </button>
    </div>
  );
});
