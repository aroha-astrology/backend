'use client';

import type { HouseData, PlanetPosition } from '@aroha-astrology/shared';
import { PLANET_ABBREVIATIONS, type Planet } from '@aroha-astrology/shared';

interface SouthIndianChartProps {
  chartData: {
    houses: HouseData[];
    planets: PlanetPosition[];
  };
  ascendantHouse?: number;
  title?: string;
  size?: number;
}

const PLANET_GLYPHS: Record<Planet, string> = {
  Sun: '☉', Moon: '☾', Mars: '♂', Mercury: '☿',
  Jupiter: '♃', Venus: '♀', Saturn: '♄', Rahu: '☊', Ketu: '☋',
};

function getPlanetLabel(planet: Planet, isRetrograde: boolean): string {
  const glyph = PLANET_GLYPHS[planet] ?? '';
  const abbr = PLANET_ABBREVIATIONS[planet] || planet.slice(0, 2);
  const base = glyph ? `${glyph} ${abbr}` : abbr;
  return isRetrograde ? `${base}(R)` : base;
}

// South Indian chart: 4x4 grid, center 2x2 merged.
// Signs are FIXED in position (Pisces top-left, clockwise).
const SIGN_GRID_MAP: Record<number, [number, number]> = {
  11: [0, 0], // Pisces
  0:  [0, 1], // Aries
  1:  [0, 2], // Taurus
  2:  [0, 3], // Gemini
  3:  [1, 3], // Cancer
  4:  [2, 3], // Leo
  5:  [3, 3], // Virgo
  6:  [3, 2], // Libra
  7:  [3, 1], // Scorpio
  8:  [3, 0], // Sagittarius
  9:  [2, 0], // Capricorn
  10: [1, 0], // Aquarius
};

const SIGN_ABBR: Record<number, string> = {
  0: 'Ari', 1: 'Tau', 2: 'Gem', 3: 'Can',
  4: 'Leo', 5: 'Vir', 6: 'Lib', 7: 'Sco',
  8: 'Sag', 9: 'Cap', 10: 'Aqu', 11: 'Pis',
};

const CELL_SIZE = 90;
const PADDING = 10;

// Deterministic stars for South Indian chart
const SI_STARS = [
  [8, 8], [48, 5], [100, 18], [200, 6], [310, 14], [368, 8],
  [380, 90], [375, 200], [370, 310], [355, 368], [270, 382],
  [170, 388], [70, 375], [15, 330], [8, 220], [12, 110],
] as const;

export function SouthIndianChart({
  chartData,
  ascendantHouse = 1,
  title = 'Rashi Chart',
}: SouthIndianChartProps) {
  const { houses, planets } = chartData;

  const signPlanets: Record<number, string[]> = {};
  for (let i = 0; i < 12; i++) signPlanets[i] = [];

  planets.forEach((p) => {
    const label = getPlanetLabel(p.planet, p.isRetrograde);
    if (signPlanets[p.signIndex] !== undefined) {
      signPlanets[p.signIndex].push(label);
    }
  });

  const ascHouse = houses.find((h) => h.house === ascendantHouse);
  const ascSignIndex = ascHouse?.signIndex ?? 0;

  const totalSize = CELL_SIZE * 4 + PADDING * 2;

  return (
    <svg
      viewBox={`0 0 ${totalSize} ${totalSize}`}
      className="w-full max-w-[400px]"
      role="img"
      aria-label={title}
    >
      <defs>
        {/* Center gradient */}
        <radialGradient id="siCenterGrad" cx="50%" cy="50%" r="70%">
          <stop offset="0%" stopColor="rgba(212, 175, 55,0.06)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
        {/* Ascendant cell fill */}
        <linearGradient id="siAscGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="rgba(212, 175, 55,0.16)" />
          <stop offset="100%" stopColor="rgba(212, 175, 55,0.06)" />
        </linearGradient>
        {/* Cell glow filter */}
        <filter id="siCellGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background radial */}
      <rect x="0" y="0" width={totalSize} height={totalSize} fill="url(#siCenterGrad)" />

      {/* Starfield */}
      {SI_STARS.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={i % 3 === 0 ? '0.9' : '0.55'}
          fill={i % 4 === 0 ? 'rgba(212, 175, 55,0.28)' : 'rgba(60,72,88,0.10)'}
        />
      ))}

      {/* Draw grid cells for all 12 signs */}
      {Object.entries(SIGN_GRID_MAP).map(([signIdxStr, [row, col]]) => {
        const signIdx = parseInt(signIdxStr, 10);
        const x = PADDING + col * CELL_SIZE;
        const y = PADDING + row * CELL_SIZE;
        const isAscendant = signIdx === ascSignIndex;
        const planetLabels = signPlanets[signIdx] || [];

        return (
          <g key={signIdx} filter={isAscendant ? 'url(#siCellGlow)' : undefined}>
            {/* Cell fill */}
            <rect
              x={x}
              y={y}
              width={CELL_SIZE}
              height={CELL_SIZE}
              fill={isAscendant ? 'url(#siAscGrad)' : 'transparent'}
              stroke={isAscendant ? 'rgba(212, 175, 55,0.55)' : 'rgba(212, 175, 55,0.18)'}
              strokeWidth={isAscendant ? '1.5' : '0.8'}
            />

            {/* Ascendant corner mark */}
            {isAscendant && (
              <>
                <line
                  x1={x}
                  y1={y}
                  x2={x + 18}
                  y2={y + 18}
                  stroke="rgba(212, 175, 55,0.80)"
                  strokeWidth="2"
                />
                <circle cx={x} cy={y} r="3" fill="rgba(212, 175, 55,0.65)" />
              </>
            )}

            {/* Sign abbreviation */}
            <text
              x={x + 4}
              y={y + 13}
              fill={isAscendant ? 'rgba(212, 175, 55,0.95)' : 'rgba(212, 175, 55,0.38)'}
              fontSize="8"
              fontWeight={isAscendant ? '700' : '400'}
              fontFamily="Cinzel, Georgia, serif"
              letterSpacing="0.5"
            >
              {SIGN_ABBR[signIdx].toUpperCase()}
            </text>

            {/* Planet labels */}
            {planetLabels.map((label, idx) => {
              const colOffset = idx % 2;
              const rowOffset = Math.floor(idx / 2);
              return (
                <text
                  key={label}
                  x={x + 8 + colOffset * 42}
                  y={y + 28 + rowOffset * 14}
                  fill={label.includes('(R)') ? 'rgba(174,128,255,0.85)' : 'rgba(212, 175, 55,0.95)'}
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="DM Sans, sans-serif"
                >
                  {label}
                </text>
              );
            })}
          </g>
        );
      })}

      {/* Center 2x2 merged area */}
      <rect
        x={PADDING + CELL_SIZE}
        y={PADDING + CELL_SIZE}
        width={CELL_SIZE * 2}
        height={CELL_SIZE * 2}
        fill="rgba(212, 175, 55,0.03)"
        stroke="rgba(212, 175, 55,0.18)"
        strokeWidth="1"
      />
      {/* Center decorative ring */}
      <circle
        cx={PADDING + CELL_SIZE * 2}
        cy={PADDING + CELL_SIZE * 2}
        r={CELL_SIZE * 0.55}
        fill="none"
        stroke="rgba(212, 175, 55,0.12)"
        strokeWidth="0.8"
        strokeDasharray="3 4"
      />
      <text
        x={PADDING + CELL_SIZE * 2}
        y={PADDING + CELL_SIZE * 2 - 6}
        textAnchor="middle"
        fill="rgba(212, 175, 55,0.65)"
        fontSize="11"
        fontWeight="600"
        fontFamily="Cinzel, Georgia, serif"
        letterSpacing="1"
      >
        {title.toUpperCase()}
      </text>
      <text
        x={PADDING + CELL_SIZE * 2}
        y={PADDING + CELL_SIZE * 2 + 10}
        textAnchor="middle"
        fill="rgba(60,72,88,0.25)"
        fontSize="7"
        letterSpacing="1.5"
        fontFamily="Cinzel, Georgia, serif"
      >
        SOUTH INDIAN
      </text>
    </svg>
  );
}
