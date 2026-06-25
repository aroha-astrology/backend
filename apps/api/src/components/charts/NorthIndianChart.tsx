'use client';

import { motion } from 'framer-motion';
import type { HouseData, PlanetPosition } from '@aroha-astrology/shared';
import { PLANET_ABBREVIATIONS, type Planet } from '@aroha-astrology/shared';
import { useStore } from '@/store/useStore';

interface NorthIndianChartProps {
  chartData: {
    houses: HouseData[];
    planets: PlanetPosition[];
  };
  ascendantHouse?: number;
  title?: string;
  size?: number;
  instant?: boolean;
}

const PLANET_GLYPHS: Record<Planet, string> = {
  Sun:     '☉',
  Moon:    '☾',
  Mars:    '♂',
  Mercury: '☿',
  Jupiter: '♃',
  Venus:   '♀',
  Saturn:  '♄',
  Rahu:    '☊',
  Ketu:    '☋',
};

function getPlanetLabel(planet: Planet, isRetrograde: boolean): string {
  const glyph = PLANET_GLYPHS[planet] ?? '';
  const abbr = PLANET_ABBREVIATIONS[planet] || planet.slice(0, 2);
  const base = glyph ? `${glyph} ${abbr}` : abbr;
  return isRetrograde ? `${base}(R)` : base;
}

// ─── Geometry ───────────────────────────────────────────────────────────────
// SVG viewBox: 400 × 400. Chart rectangle is 360×280 centred horizontally,
// with title text above and breathing room below.
//
// Outer rectangle: (20, 60) to (380, 340). W = 360, H = 280.
// Mid-points (form the inner rhombus): TM, RM, BM, LM.
// Diagonals (TL→BR and TR→BL) intersect rhombus edges at P1..P4.
//
//   TL─────────TM─────────TR
//   │ ╲    H2  │   H12   ╱│
//   │  ╲       │       ╱  │
//   │H3 ╲      │      ╱H11│
//   │    P1──H1──P2       │
//   LM───┤ H4    H10 ├───RM
//   │    P4──H7──P3       │
//   │H5 ╱      │      ╲H9 │
//   │  ╱       │       ╲  │
//   │ ╱   H6   │   H8    ╲│
//   BL─────────BM─────────BR
//
// House centroids are used for both the house-number label and the planet
// stack origin. Inner cells (1, 4, 7, 10) cluster their numbers near the
// chart centre, mirroring the canonical North Indian layout.

interface HousePos {
  numberX: number;
  numberY: number;
  planetX: number;
  planetY: number;
}

const HOUSE_POSITIONS: Record<number, HousePos> = {
  // Inner cells — house number near centre, planets stack from there
  1:  { numberX: 200, numberY: 175, planetX: 200, planetY: 105 }, // top inner
  4:  { numberX: 175, numberY: 200, planetX: 100, planetY: 188 }, // left inner
  7:  { numberX: 200, numberY: 225, planetX: 200, planetY: 256 }, // bottom inner
  10: { numberX: 225, numberY: 200, planetX: 300, planetY: 188 }, // right inner

  // Outer triangle cells — number small, planets in centroid (shifted down 6px to clear lord label)
  2:  { numberX: 110, numberY: 78,  planetX: 110, planetY: 101 }, // top-left small
  3:  { numberX: 45,  numberY: 125, planetX: 60,  planetY: 148 }, // left-top small
  5:  { numberX: 45,  numberY: 275, planetX: 60,  planetY: 251 }, // left-bottom small
  6:  { numberX: 110, numberY: 322, planetX: 110, planetY: 311 }, // bottom-left small
  8:  { numberX: 290, numberY: 322, planetX: 290, planetY: 311 }, // bottom-right small
  9:  { numberX: 355, numberY: 275, planetX: 340, planetY: 251 }, // right-bottom small
  11: { numberX: 355, numberY: 125, planetX: 340, planetY: 148 }, // right-top small
  12: { numberX: 290, numberY: 78,  planetX: 290, planetY: 101 }, // top-right small
};

// Deterministic star positions (kept inside the SVG bounds, mostly outside the chart)
const STARS = [
  [22, 18], [55, 38], [95, 12], [148, 28], [238, 15], [310, 22], [362, 45],
  [380, 105], [375, 178], [368, 250], [342, 358], [285, 380], [198, 388],
  [112, 372], [42, 358], [18, 255], [12, 175], [30, 92], [72, 60], [340, 80],
  [180, 8], [260, 35], [320, 380], [360, 350], [170, 380], [80, 380],
] as const;

export function NorthIndianChart({
  chartData,
  ascendantHouse = 1,
  title = 'Rashi Chart',
  instant = false,
}: NorthIndianChartProps) {
  const { houses, planets } = chartData;
  const reduceMotion = useStore((s) => s.reduceMotion);
  const skip = instant || reduceMotion;

  const drawLine = (delay: number) =>
    skip
      ? { initial: { pathLength: 1, opacity: 1 } as const, animate: { pathLength: 1, opacity: 1 } as const, transition: { duration: 0 } }
      : {
          initial: { pathLength: 0, opacity: 0 } as const,
          animate: { pathLength: 1, opacity: 1 } as const,
          transition: { pathLength: { duration: 1.1, ease: 'easeInOut' as const, delay }, opacity: { duration: 0.3, delay } },
        };
  const fadeIn = (delay: number) =>
    skip
      ? { initial: { opacity: 1, scale: 1 } as const, animate: { opacity: 1, scale: 1 } as const, transition: { duration: 0 } }
      : {
          initial: { opacity: 0, scale: 0.6 } as const,
          animate: { opacity: 1, scale: 1 } as const,
          transition: { duration: 0.45, ease: 'easeOut' as const, delay },
        };
  const fadeOnly = (delay: number) =>
    skip
      ? { initial: { opacity: 1 } as const, animate: { opacity: 1 } as const, transition: { duration: 0 } }
      : {
          initial: { opacity: 0 } as const,
          animate: { opacity: 1 } as const,
          transition: { duration: 0.4, ease: 'easeOut' as const, delay },
        };

  const housePlanets: Record<number, string[]> = {};
  for (let i = 1; i <= 12; i++) housePlanets[i] = [];
  planets.forEach((p) => {
    const label = getPlanetLabel(p.planet, p.isRetrograde);
    if (housePlanets[p.house]) housePlanets[p.house].push(label);
  });

  // Houses always render at their fixed visual position (1 = top inner, 4 = left
  // inner, 7 = bottom inner, 10 = right inner). When the ascendant isn't house 1,
  // the lagna rotates: e.g. asc=4 means real-house 4 should appear at the top,
  // and real-house 5 to its anticlockwise neighbour, etc.
  function getDisplayPosition(logicalHouse: number): number {
    return ((logicalHouse - ascendantHouse + 12) % 12) + 1;
  }

  return (
    <svg viewBox="0 0 400 400" className="w-full max-w-[400px]" role="img" aria-label={title}>
      <defs>
        <radialGradient id="niCenterGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(212, 175, 55,0.07)" />
          <stop offset="60%" stopColor="rgba(212, 175, 55,0.02)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        <filter id="niAscGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="niLineGlow">
          <feGaussianBlur stdDeviation="0.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="penGlow" x="-150%" y="-150%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Deep cosmos background */}
      <rect x="0" y="0" width="400" height="400" fill="rgba(2,1,10,0.0)" />
      <rect x="0" y="0" width="400" height="400" fill="url(#niCenterGlow)" />

      {/* Starfield */}
      {STARS.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={i % 3 === 0 ? '1' : '0.6'}
          fill={i % 4 === 0 ? 'rgba(212, 175, 55,0.30)' : 'rgba(60,72,88,0.10)'}
        />
      ))}

      {/* Decorative corner flourishes around the chart rectangle */}
      <g fill="none" stroke="rgba(212, 175, 55,0.45)" strokeWidth="0.8" strokeLinecap="round">
        <path d="M14 66 Q14 60 20 60 M16 70 Q20 62 26 60" />
        <circle cx="14" cy="60" r="1.4" fill="rgba(212, 175, 55,0.55)" />
        <path d="M386 66 Q386 60 380 60 M384 70 Q380 62 374 60" />
        <circle cx="386" cy="60" r="1.4" fill="rgba(212, 175, 55,0.55)" />
        <path d="M14 334 Q14 340 20 340 M16 330 Q20 338 26 340" />
        <circle cx="14" cy="340" r="1.4" fill="rgba(212, 175, 55,0.55)" />
        <path d="M386 334 Q386 340 380 340 M384 330 Q380 338 374 340" />
        <circle cx="386" cy="340" r="1.4" fill="rgba(212, 175, 55,0.55)" />
      </g>

      {/* Title above the chart */}
      <text
        x="200"
        y="26"
        textAnchor="middle"
        fill="rgba(212, 175, 55,0.80)"
        fontSize="11"
        fontWeight="700"
        letterSpacing="2"
        fontFamily="Cinzel, Georgia, serif"
      >
        {title.toUpperCase()}
      </text>
      <text
        x="200"
        y="40"
        textAnchor="middle"
        fill="rgba(60,72,88,0.25)"
        fontSize="8"
        letterSpacing="1.5"
      >
        NORTH INDIAN
      </text>

      {/* Outer rectangle — gold border, animates as a draw-on */}
      <motion.path
        d="M 20 60 L 380 60 L 380 340 L 20 340 Z"
        fill="none"
        stroke="rgba(212, 175, 55,0.50)"
        strokeWidth="1.6"
        filter="url(#niLineGlow)"
        {...drawLine(0.05)}
      />

      {/* Vertex motifs at the rectangle corners */}
      <g>
        {([[20, 60, 0.95], [380, 60, 1.05], [380, 340, 1.15], [20, 340, 1.05]] as const).map(([cx, cy, d], i) => (
          <motion.g key={i} {...fadeIn(d)}>
            <circle cx={cx} cy={cy} r="2.6" fill="var(--surface)" stroke="rgba(212, 175, 55,0.6)" strokeWidth="0.9" />
            <circle cx={cx} cy={cy} r="1"   fill="rgba(212, 175, 55,0.8)" />
          </motion.g>
        ))}
      </g>

      {/* Inner rhombus connecting the four side mid-points */}
      <motion.path
        d="M 200 60 L 380 200 L 200 340 L 20 200 Z"
        fill="none"
        stroke="rgba(212, 175, 55,0.35)"
        strokeWidth="1.2"
        {...drawLine(0.4)}
      />

      {/* The two long diagonals — TL→BR and TR→BL */}
      <motion.line x1="20"  y1="60"  x2="380" y2="340" stroke="rgba(212, 175, 55,0.22)" strokeWidth="0.9" {...drawLine(0.65)} />
      <motion.line x1="380" y1="60"  x2="20"  y2="340" stroke="rgba(212, 175, 55,0.22)" strokeWidth="0.9" {...drawLine(0.80)} />

      {/* Render houses — staggered fade-in after the chart skeleton finishes drawing */}
      {houses.map((house, hi) => {
        const displayPos = getDisplayPosition(house.house);
        const pos = HOUSE_POSITIONS[displayPos];
        if (!pos) return null;

        const planetLabels = housePlanets[house.house] || [];
        const isAscendant = house.house === ascendantHouse;
        const baseDelay = 1.05 + hi * 0.045;

        return (
          <motion.g
            key={house.house}
            filter={isAscendant ? 'url(#niAscGlow)' : undefined}
            {...fadeOnly(baseDelay)}
          >
            {isAscendant && (
              <text
                x={pos.numberX}
                y={pos.numberY - 12}
                textAnchor="middle"
                fill="rgba(212, 175, 55,0.90)"
                fontSize="8"
                fontWeight="800"
                letterSpacing="1.3"
                fontFamily="Cinzel, Georgia, serif"
              >
                ASC
              </text>
            )}

            {/* House number — bright, readable, mirrors the canonical chart */}
            <text
              x={pos.numberX}
              y={pos.numberY}
              textAnchor="middle"
              fill={isAscendant ? 'rgba(212, 175, 55,1)' : 'rgba(60,72,88,0.55)'}
              fontSize="11"
              fontWeight={isAscendant ? '800' : '700'}
              fontFamily="DM Sans, sans-serif"
            >
              {house.house}
            </text>

            {/* House lord — small, muted teal, below the house number */}
            <text
              x={pos.numberX}
              y={pos.numberY + 12}
              textAnchor="middle"
              fill="rgba(130,210,210,0.70)"
              fontSize="8.5"
              fontWeight="600"
              fontFamily="DM Sans, sans-serif"
            >
              {PLANET_ABBREVIATIONS[house.lord] ?? house.lord.slice(0, 2)}
            </text>

            {/* Planet labels — gold, each fades in after the house cell */}
            {planetLabels.map((label, idx) => (
              <motion.text
                key={label}
                x={pos.planetX}
                y={pos.planetY + idx * 14}
                textAnchor="middle"
                fill={label.includes('(R)') ? 'rgba(174,128,255,0.85)' : 'rgba(212, 175, 55,0.95)'}
                fontSize="11"
                fontWeight="700"
                fontFamily="DM Sans, sans-serif"
                {...fadeOnly(baseDelay + 0.08 + idx * 0.06)}
              >
                {label}
              </motion.text>
            ))}
          </motion.g>
        );
      })}

      {/* Subtle Om glyph at chart bottom centre, just outside the rectangle */}
      <text
        x="200"
        y="368"
        textAnchor="middle"
        fill="rgba(212, 175, 55,0.40)"
        fontSize="13"
        fontFamily="Noto Sans Devanagari, Noto Sans, serif"
      >
        ॐ
      </text>

      {/* Pen-nib cursors — golden glowing dot that traces each stroke as it draws */}
      {!reduceMotion && (
        <>
          {/* Outer rectangle: TL→TR→BR→BL→TL */}
          <motion.circle
            r="3"
            fill="rgba(212, 175, 55,0.90)"
            filter="url(#penGlow)"
            initial={{ cx: 20, cy: 60, opacity: 0 }}
            animate={{
              cx: [20, 380, 380, 20, 20],
              cy: [60, 60, 340, 340, 60],
              opacity: [0, 1, 1, 1, 1, 0],
            }}
            transition={{
              duration: 1.1,
              delay: 0.05,
              ease: 'linear',
              opacity: { times: [0, 0.02, 0.25, 0.5, 0.97, 1], duration: 1.1, delay: 0.05 },
            }}
          />
          {/* Inner rhombus: TM→RM→BM→LM→TM */}
          <motion.circle
            r="3"
            fill="rgba(212, 175, 55,0.90)"
            filter="url(#penGlow)"
            initial={{ cx: 200, cy: 60, opacity: 0 }}
            animate={{
              cx: [200, 380, 200, 20, 200],
              cy: [60, 200, 340, 200, 60],
              opacity: [0, 1, 1, 1, 1, 0],
            }}
            transition={{
              duration: 1.1,
              delay: 0.4,
              ease: 'linear',
              opacity: { times: [0, 0.02, 0.25, 0.5, 0.97, 1], duration: 1.1, delay: 0.4 },
            }}
          />
          {/* Diagonal TL→BR */}
          <motion.circle
            r="3"
            fill="rgba(212, 175, 55,0.90)"
            filter="url(#penGlow)"
            initial={{ cx: 20, cy: 60, opacity: 0 }}
            animate={{
              cx: [20, 380],
              cy: [60, 340],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 1.1,
              delay: 0.65,
              ease: 'easeInOut',
              opacity: { times: [0, 0.04, 0.94, 1], duration: 1.1, delay: 0.65 },
            }}
          />
          {/* Diagonal TR→BL */}
          <motion.circle
            r="3"
            fill="rgba(212, 175, 55,0.90)"
            filter="url(#penGlow)"
            initial={{ cx: 380, cy: 60, opacity: 0 }}
            animate={{
              cx: [380, 20],
              cy: [60, 340],
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: 1.1,
              delay: 0.8,
              ease: 'easeInOut',
              opacity: { times: [0, 0.04, 0.94, 1], duration: 1.1, delay: 0.8 },
            }}
          />
        </>
      )}
    </svg>
  );
}
