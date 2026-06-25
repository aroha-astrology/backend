'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { ZODIAC_ORDER, SIGN_META, type ZodiacSign } from '@/lib/zodiacMeta';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface NatalPlanet {
  /** Display name (Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu, Ketu). */
  name: string;
  /** Zodiac sign the planet sits in. */
  sign: ZodiacSign;
  /** Degree within the sign (0–30). */
  signDegree?: number;
  /** Absolute longitude 0–360. Computed from signIndex + signDegree if not provided. */
  longitude?: number;
}

interface Props {
  planets: NatalPlanet[];
  /** Diameter in pixels. Defaults to 320. */
  size?: number;
  /** When true, the aspect-line draw-in animation plays on mount. */
  animate?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Aspect math                                                               */
/* -------------------------------------------------------------------------- */

type AspectKind = 'trine' | 'sextile' | 'square' | 'opposition';

const ASPECT_ANGLES: Record<AspectKind, { angle: number; orb: number; color: string; glow: string }> = {
  // Brand-warmed palette (gold for harmonious, primary purple for tension)
  trine:      { angle: 120, orb: 8, color: '#F59E0B', glow: 'rgba(245,158,11,0.55)' }, // gold
  sextile:    { angle: 60,  orb: 6, color: '#5EEAD4', glow: 'rgba(94,234,212,0.55)' },  // teal
  square:     { angle: 90,  orb: 8, color: '#F87171', glow: 'rgba(248,113,113,0.55)' }, // coral
  opposition: { angle: 180, orb: 8, color: '#7C3AED', glow: 'rgba(124,58,237,0.65)' },  // primary purple
};

function angleBetween(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function planetAbsoluteLongitude(p: NatalPlanet): number {
  if (typeof p.longitude === 'number') return p.longitude;
  const idx = ZODIAC_ORDER.indexOf(p.sign);
  if (idx < 0) return 0;
  const deg = typeof p.signDegree === 'number' ? p.signDegree : 15; // mid-sign default
  return idx * 30 + deg;
}

/** Convert ecliptic longitude (0° at Aries cusp) to chart angle.
 *  We orient Aries at the 9 o'clock position (the traditional ascendant
 *  placement on Western wheels) and go counter-clockwise. */
function longitudeToAngle(lon: number): number {
  // 0° (Aries) → 180° on screen (left, 9 o'clock); +1° lon → -1° screen.
  return (180 - lon + 360) % 360;
}

/* -------------------------------------------------------------------------- */
/*  Planet glyphs                                                             */
/* -------------------------------------------------------------------------- */

const PLANET_GLYPH: Record<string, string> = {
  Sun:     '☉',
  Moon:    '☽',
  Mars:    '♂',
  Mercury: '☿',
  Jupiter: '♃',
  Venus:   '♀',
  Saturn:  '♄',
  Rahu:    '☊',
  Ketu:    '☋',
};

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function NatalWheel({ planets, size = 320, animate = true }: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.46;
  const innerR = size * 0.36; // inner edge of zodiac ring
  const planetR = size * 0.27; // where planet glyphs sit
  const aspectR = size * 0.24; // where aspect lines anchor

  // Place planets at their ecliptic longitudes (or mid-sign fallback).
  const placedPlanets = useMemo(() => {
    return planets.map((p) => {
      const lon = planetAbsoluteLongitude(p);
      const angleDeg = longitudeToAngle(lon);
      const rad = (angleDeg * Math.PI) / 180;
      const px = cx + planetR * Math.cos(rad);
      const py = cy - planetR * Math.sin(rad);
      const ax = cx + aspectR * Math.cos(rad);
      const ay = cy - aspectR * Math.sin(rad);
      return { ...p, lon, px, py, ax, ay };
    });
  }, [planets, cx, cy, planetR, aspectR]);

  // Compute aspects between every pair of planets.
  const aspects = useMemo(() => {
    const out: Array<{ from: typeof placedPlanets[number]; to: typeof placedPlanets[number]; kind: AspectKind }> = [];
    for (let i = 0; i < placedPlanets.length; i++) {
      for (let j = i + 1; j < placedPlanets.length; j++) {
        const a = placedPlanets[i];
        const b = placedPlanets[j];
        const sep = angleBetween(a.lon, b.lon);
        for (const kind of ['opposition', 'trine', 'square', 'sextile'] as const) {
          const { angle, orb } = ASPECT_ANGLES[kind];
          if (Math.abs(sep - angle) <= orb) {
            out.push({ from: a, to: b, kind });
            break; // first match wins (orb priority)
          }
        }
      }
    }
    return out;
  }, [placedPlanets]);

  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      {/* Halo glow behind the wheel — matches the "after onboarding" vibe from the reference */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, rgba(124,58,237,0.35) 0%, rgba(94,234,212,0.18) 38%, transparent 70%)',
          filter: 'blur(18px)',
        }}
        aria-hidden
      />

      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="relative"
      >
        <defs>
          <radialGradient id="wheel-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0F1424" />
            <stop offset="80%" stopColor="#070A14" />
            <stop offset="100%" stopColor="#02040A" />
          </radialGradient>
        </defs>

        {/* Inner disc */}
        <circle cx={cx} cy={cy} r={outerR} fill="url(#wheel-bg)" stroke="rgba(124,58,237,0.4)" strokeWidth={1.5} />
        <circle cx={cx} cy={cy} r={innerR} fill="transparent" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />

        {/* Zodiac ring — 12 segments with glyphs */}
        {ZODIAC_ORDER.map((sign, i) => {
          const meta = SIGN_META[sign];
          const startLon = i * 30;
          const endLon = (i + 1) * 30;
          const a1 = ((longitudeToAngle(startLon)) * Math.PI) / 180;
          const a2 = ((longitudeToAngle(endLon)) * Math.PI) / 180;
          const midAngle = (longitudeToAngle(startLon + 15) * Math.PI) / 180;

          // Tick lines at each sign boundary
          const x1 = cx + innerR * Math.cos(a1);
          const y1 = cy - innerR * Math.sin(a1);
          const x2 = cx + outerR * Math.cos(a1);
          const y2 = cy - outerR * Math.sin(a1);

          // Glyph position (midpoint of the segment, ring radius)
          const glyphR = (outerR + innerR) / 2;
          const gx = cx + glyphR * Math.cos(midAngle);
          const gy = cy - glyphR * Math.sin(midAngle);

          return (
            <g key={sign}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth={1}
              />
              <text
                x={gx}
                y={gy}
                fill={meta.color}
                fontSize={size * 0.05}
                textAnchor="middle"
                dominantBaseline="central"
                style={{ filter: `drop-shadow(0 0 4px ${meta.color}88)` }}
              >
                {meta.glyph}
              </text>
              {/* Use a2 to silence unused-var */}
              <metadata>{a2}</metadata>
            </g>
          );
        })}

        {/* Aspect lines — animated draw-in */}
        {aspects.map((asp, idx) => {
          const { color, glow } = ASPECT_ANGLES[asp.kind];
          const line = (
            <motion.line
              key={`${asp.from.name}-${asp.to.name}-${asp.kind}`}
              x1={asp.from.ax}
              y1={asp.from.ay}
              x2={asp.to.ax}
              y2={asp.to.ay}
              stroke={color}
              strokeWidth={asp.kind === 'opposition' ? 1.6 : 1.2}
              strokeOpacity={0.85}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 3px ${glow})` }}
              {...(animate
                ? {
                    initial: { pathLength: 0, opacity: 0 },
                    animate: { pathLength: 1, opacity: 0.85 },
                    transition: { duration: 0.9, delay: 0.4 + idx * 0.08, ease: 'easeOut' },
                  }
                : {})}
            />
          );
          return line;
        })}

        {/* Planet glyphs */}
        {placedPlanets.map((p, idx) => {
          const glyph = PLANET_GLYPH[p.name] ?? p.name.charAt(0);
          return (
            <motion.g
              key={`${p.name}-${idx}`}
              initial={animate ? { opacity: 0, scale: 0.4 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.45, delay: idx * 0.06, ease: 'easeOut' }}
            >
              <circle
                cx={p.px}
                cy={p.py}
                r={size * 0.038}
                fill="#0F1424"
                stroke="#FBBF24"
                strokeWidth={1.2}
                style={{ filter: 'drop-shadow(0 0 6px rgba(251,191,36,0.5))' }}
              />
              <text
                x={p.px}
                y={p.py}
                fill="#FBBF24"
                fontSize={size * 0.045}
                textAnchor="middle"
                dominantBaseline="central"
                fontWeight={600}
              >
                {glyph}
              </text>
            </motion.g>
          );
        })}

        {/* Center dot */}
        <circle cx={cx} cy={cy} r={size * 0.01} fill="#FBBF24" opacity={0.8} />
      </svg>
    </div>
  );
}
