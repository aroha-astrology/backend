'use client';

import { useState } from 'react';
import { LINE_STYLES, INSIGHT_CHIPS } from '@/lib/palm/lineColors';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface PalmLine {
  present?: boolean;
  length?: string;
  depth?: string;
  curvature?: string;
  direction?: string;
  branches?: string;
  startPoint?: string;
  separation?: string;
  interpretation?: string;
  polyline?: Array<[number, number]>;
}

export interface PalmLines {
  heart?: PalmLine;
  head?: PalmLine;
  life?: PalmLine;
  fate?: PalmLine;
}

export interface MinorLineDatum {
  present?: boolean;
  count?: number;
  interpretation?: string;
}

export interface MinorLines {
  sun?: MinorLineDatum;
  marriage?: MinorLineDatum;
  children?: MinorLineDatum;
  health?: MinorLineDatum;
  travel?: MinorLineDatum;
  mars?: MinorLineDatum;
}

interface Props {
  imageUrl: string;
  hand: 'left' | 'right';
  lines: PalmLines;
  /** Interpretive minor lines from analysis.minorLines — descriptive only,
   *  not drawn on the photo. Surfaced in the "MINOR LINES" panel on `full` variant. */
  minorLines?: MinorLines;
  variant: 'compact' | 'full';
}

type MajorKey = keyof PalmLines;            // 'heart' | 'head' | 'life' | 'fate'
type MinorKey = keyof MinorLines;           // 'sun' | 'marriage' | …

interface MajorLineMeta {
  key: MajorKey;
  num: number;
  description: string;
}

interface MinorLineMeta {
  key: MinorKey;
  num: number;
  description: string;
}

const MAJOR_LINE_META: MajorLineMeta[] = [
  { key: 'heart', num: 1, description: 'Runs horizontally across the top of the palm. Reflects emotions, relationships, and the way you express love.' },
  { key: 'head',  num: 2, description: 'Runs across the middle of the palm. Represents your intellect, thinking style, and decision-making.' },
  { key: 'life',  num: 3, description: 'Curves around the base of the thumb. Indicates your vitality, energy, and major life changes.' },
  { key: 'fate',  num: 4, description: 'Runs vertically toward the center of the palm. Relates to your career path, life purpose, and key opportunities.' },
];

const MINOR_LINE_META: MinorLineMeta[] = [
  { key: 'sun',      num: 5,  description: 'Rises toward the ring finger (Apollo / Surya mount). Signals fame, recognition, and creative success.' },
  { key: 'marriage', num: 6,  description: 'Short horizontal lines on the percussion below the little finger. Each line marks a significant partnership.' },
  { key: 'children', num: 7,  description: 'Fine vertical lines above the marriage line. Indicates children, legacy, and lineage strength.' },
  { key: 'health',   num: 8,  description: 'Rises from the base of the palm toward Mercury. Reveals digestion, vitality, and constitutional strength.' },
  { key: 'travel',   num: 9,  description: 'Short horizontal lines on the percussion edge. Marks meaningful journeys and foreign opportunities.' },
  { key: 'mars',     num: 10, description: 'Runs parallel to the Life line inside the Mount of Venus. Adds courage, resilience, and protective support.' },
];

// Legacy alias kept for the overlay-only logic below (4 majors).
const LINE_META = MAJOR_LINE_META;

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

/** Returns the polyline only if it looks like real traced coords; otherwise null. */
function tryGetPoly(line: PalmLine | undefined): Array<[number, number]> | null {
  const p = line?.polyline;
  if (
    Array.isArray(p) &&
    p.length >= 3 &&
    p.every((pt) => Array.isArray(pt) && pt.length === 2 && pt[0] >= 0 && pt[0] <= 1 && pt[1] >= 0 && pt[1] <= 1)
  ) {
    return p;
  }
  return null;
}

function midpoint(poly: Array<[number, number]>): [number, number] {
  const i = Math.floor(poly.length / 2);
  return poly[i] ?? poly[0];
}

function pointsToString(
  poly: Array<[number, number]>,
  hand: 'left' | 'right',
  naturalW: number,
  naturalH: number,
): string {
  return poly
    .map(([x, y]) => {
      const px = (hand === 'left' ? 1 - x : x) * naturalW;
      const py = y * naturalH;
      return `${px},${py}`;
    })
    .join(' ');
}

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function PalmInfographic({ imageUrl, hand, lines, minorLines, variant }: Props) {
  const [activeMajorKey, setActiveMajorKey] = useState<MajorKey | null>(null);
  const [activeMinorKey, setActiveMinorKey] = useState<MinorKey | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const isCompact = variant === 'compact';

  const hasAnyLine = LINE_META.some(({ key }) => tryGetPoly(lines[key]) !== null);

  return (
    <div className={isCompact ? 'flex gap-3 items-stretch' : 'flex flex-col gap-4'}>
      {/* Image + overlay (+ insight chips in full variant) */}
      <div
        className={`relative flex-shrink-0 overflow-hidden rounded-xl ${isCompact ? '' : 'mx-auto'}`}
        style={{
          width: isCompact ? 110 : '100%',
          height: isCompact ? 110 : 'auto',
          aspectRatio: isCompact ? '1' : '3/4',
          background: '#1a1a1f',
        }}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={`${hand} palm`}
            className="absolute inset-0 w-full h-full object-cover"
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget;
              setDims({ w: img.naturalWidth, h: img.naturalHeight });
            }}
          />
        )}
        {/* Fallback template overlay — same Hast Samudrika Shastra geometry as
            the capture-screen guide, in a normalised 200x290 viewBox stretched
            to the image. Shown when MediaPipe couldn't detect real polylines,
            so the user still sees the four major lines visualised. */}
        {!hasAnyLine && (
          <svg
            viewBox="0 0 200 290"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{
              // Same orientation logic as PalmCaptureGuide: paths authored
              // "thumb on right", mirror for RIGHT hand so the Life line ends
              // up curving around the LEFT-side thumb that appears in a
              // real back-camera right-palm photo.
              transform: hand === 'right' ? 'scaleX(-1)' : undefined,
              filter: 'drop-shadow(0 0 3px rgba(0,0,0,0.65))',
            }}
          >
            <path
              d="M 40 108 Q 92 94 138 104"
              fill="none"
              stroke={LINE_STYLES.heart.color}
              strokeWidth={3.4}
              strokeLinecap="round"
              opacity={0.95}
              style={{ filter: `drop-shadow(0 0 5px ${LINE_STYLES.heart.glow})` }}
            />
            <path
              d="M 138 130 Q 92 148 50 154"
              fill="none"
              stroke={LINE_STYLES.head.color}
              strokeWidth={3.2}
              strokeLinecap="round"
              opacity={0.95}
              style={{ filter: `drop-shadow(0 0 5px ${LINE_STYLES.head.glow})` }}
            />
            <path
              d="M 138 118 Q 170 182 110 258"
              fill="none"
              stroke={LINE_STYLES.life.color}
              strokeWidth={3.4}
              strokeLinecap="round"
              strokeDasharray="4 6"
              opacity={0.95}
              style={{ filter: `drop-shadow(0 0 5px ${LINE_STYLES.life.glow})` }}
            />
            <path
              d="M 100 150 Q 102 205 100 258"
              fill="none"
              stroke={LINE_STYLES.fate.color}
              strokeWidth={2.8}
              strokeLinecap="round"
              opacity={0.9}
              style={{ filter: `drop-shadow(0 0 5px ${LINE_STYLES.fate.glow})` }}
            />
          </svg>
        )}

        {/* Real detector overlay — drawn when we have valid polylines. */}
        {dims && hasAnyLine && (
          <svg
            viewBox={`0 0 ${dims.w} ${dims.h}`}
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.6))' }}
          >
            {LINE_META.map(({ key, num }) => {
              const poly = tryGetPoly(lines[key]);
              if (!poly) return null;
              const [mx, my] = midpoint(poly);
              const isActive = activeMajorKey === key;
              const adjustedMx = (hand === 'left' ? 1 - mx : mx) * dims.w;
              const adjustedMy = my * dims.h;
              const r = isCompact ? dims.w * 0.055 : dims.w * 0.035;
              const fontSize = isCompact ? dims.w * 0.065 : dims.w * 0.044;
              const strokeW = isCompact ? dims.w * 0.026 : dims.w * 0.019;
              const haloW = strokeW * 2.6;
              const style = LINE_STYLES[key];
              const pts = pointsToString(poly, hand, dims.w, dims.h);
              return (
                <g key={key}>
                  {/* Soft outer halo to make the line readable on any skin tone */}
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={style.color}
                    strokeOpacity={0.4}
                    strokeWidth={haloW}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: 'blur(4px)' }}
                  />
                  {/* Crisp center stroke */}
                  <polyline
                    points={pts}
                    fill="none"
                    stroke={style.color}
                    strokeWidth={isActive ? strokeW * 1.25 : strokeW}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={style.dashed ? `${strokeW * 1.6} ${strokeW * 2.4}` : undefined}
                    opacity={1}
                    style={{ filter: `drop-shadow(0 0 ${strokeW * 1.4}px ${style.glow})` }}
                  />
                  <circle
                    cx={adjustedMx}
                    cy={adjustedMy}
                    r={r}
                    fill="#0a0a0f"
                    stroke={style.color}
                    strokeWidth={dims.w * 0.008}
                    style={{ filter: `drop-shadow(0 0 ${dims.w * 0.012}px ${style.glow})` }}
                  />
                  <text
                    x={adjustedMx}
                    y={adjustedMy}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={fontSize}
                    fontWeight={700}
                    fill="#ffffff"
                  >
                    {num}
                  </text>
                </g>
              );
            })}
          </svg>
        )}

        {/* Life-area insight chips — only on the full variant, positioned around
            the captured photo. Clicking a chip scrolls to its result section. */}
        {!isCompact && INSIGHT_CHIPS.map((chip) => {
          const positionClass = {
            top:         'top-[4%] left-1/2 -translate-x-1/2',
            left:        'top-[40%] left-[2%]',
            right:       'top-[40%] right-[2%]',
            bottomLeft:  'bottom-[6%] left-[2%]',
            bottomRight: 'bottom-[6%] right-[2%]',
          }[chip.position];
          return (
            <a
              key={chip.key}
              href={`#${chip.anchor}`}
              className={`absolute ${positionClass} z-10 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-black/72 backdrop-blur-md px-3 py-1.5 text-[11px] font-semibold text-white shadow-xl whitespace-nowrap no-underline`}
              style={{ boxShadow: '0 4px 16px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.08)' }}
            >
              <span className="text-[14px] leading-none">{chip.emoji}</span>
              <span className="tracking-[0.01em]">{chip.label}</span>
            </a>
          );
        })}
      </div>

      {/* Side panel */}
      {isCompact ? (
        <div className="flex flex-col justify-center gap-1.5 flex-1 min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[var(--text-secondary)]">PALM READING</p>
          <p className="text-[14px] font-bold text-[var(--text)] leading-tight">Your hand, decoded</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {LINE_META.map(({ key }) => {
              const style = LINE_STYLES[key];
              return (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(0,0,0,0.06)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                >
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: style.color, boxShadow: `0 0 4px ${style.glow}` }}
                  />
                  {style.englishName.replace(' Line', '')}
                </span>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Major Lines card — fintech-clean white card */}
          <div className="rounded-2xl overflow-hidden bg-[var(--surface)] border border-[var(--border)] shadow-sm">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <p className="text-[11px] font-bold tracking-[0.16em] text-[var(--text-secondary)] uppercase">Major Lines</p>
              <p className="text-[10px] text-[var(--text-secondary)] italic">Pradhan Rekhāḥ</p>
            </div>
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {MAJOR_LINE_META.map(({ key, description }) => {
                const line = lines[key];
                const isActive = activeMajorKey === key;
                const interp = line?.interpretation;
                const style = LINE_STYLES[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setActiveMajorKey(isActive ? null : key)}
                    className="text-left flex items-start gap-0 w-full border-none cursor-pointer transition-colors duration-150"
                    style={{ background: isActive ? `${style.color}0D` : 'transparent' }}
                  >
                    {/* Left color stripe */}
                    <div
                      className="flex-shrink-0 w-1 self-stretch rounded-r-full mr-3"
                      style={{
                        background: style.color,
                        opacity: isActive ? 1 : 0.55,
                        boxShadow: isActive ? `0 0 8px ${style.glow}` : undefined,
                      }}
                    />
                    <div className="flex-1 min-w-0 py-3 pr-4">
                      {/* Name row */}
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-[14px] font-bold tracking-tight text-[var(--text)]">
                          {style.englishName}
                        </span>
                        <span className="text-[10px] text-[var(--text-secondary)] italic font-normal">
                          {style.vedicName}
                        </span>
                        {/* Emoji badge */}
                        <span className="ml-auto text-[14px] leading-none">{style.emoji}</span>
                      </div>
                      {/* Meaning pill */}
                      <span
                        className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1.5"
                        style={{ background: `${style.color}18`, color: style.color }}
                      >
                        {style.meaning}
                      </span>
                      {/* Description */}
                      <p className="text-[12px] leading-snug text-[var(--text-secondary)]">
                        {description}
                      </p>
                      {/* Expanded interpretation */}
                      {isActive && interp && (
                        <p className="text-[13px] leading-relaxed mt-2.5 text-[var(--text)] border-t border-[var(--border)] pt-2.5">
                          {interp}
                        </p>
                      )}
                      {/* Tap hint */}
                      {!isActive && interp && (
                        <p className="text-[10px] mt-1" style={{ color: style.color, opacity: 0.7 }}>
                          Tap to read interpretation ›
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Minor Lines card */}
          {minorLines && MINOR_LINE_META.some(({ key }) => minorLines[key]?.interpretation || minorLines[key]?.present) && (
            <div className="rounded-2xl overflow-hidden bg-[var(--surface)] border border-[var(--border)] shadow-sm">
              <div className="px-4 pt-4 pb-2 flex items-center justify-between">
                <p className="text-[11px] font-bold tracking-[0.16em] text-[var(--text-secondary)] uppercase">Minor Lines</p>
                <p className="text-[10px] text-[var(--text-secondary)] italic">Laghu Rekhāḥ</p>
              </div>
              <div className="flex flex-col divide-y divide-[var(--border)]">
                {MINOR_LINE_META.map(({ key, description }) => {
                  const datum = minorLines[key];
                  if (!datum?.interpretation && datum?.present === false) return null;
                  const isActive = activeMinorKey === key;
                  const interp = datum?.interpretation;
                  const style = LINE_STYLES[key];
                  const count = datum?.count;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setActiveMinorKey(isActive ? null : key)}
                      className="text-left flex items-start gap-0 w-full border-none cursor-pointer transition-colors duration-150"
                      style={{ background: isActive ? `${style.color}0D` : 'transparent' }}
                    >
                      <div
                        className="flex-shrink-0 w-1 self-stretch rounded-r-full mr-3"
                        style={{
                          background: style.color,
                          opacity: isActive ? 1 : 0.45,
                          boxShadow: isActive ? `0 0 8px ${style.glow}` : undefined,
                        }}
                      />
                      <div className="flex-1 min-w-0 py-3 pr-4">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-[14px] font-bold tracking-tight text-[var(--text)]">
                            {style.englishName}
                          </span>
                          <span className="text-[10px] text-[var(--text-secondary)] italic font-normal">
                            {style.vedicName}
                          </span>
                          {typeof count === 'number' && count > 0 && (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded-md"
                              style={{ background: `${style.color}22`, color: style.color }}
                            >
                              ×{count}
                            </span>
                          )}
                          <span className="ml-auto text-[14px] leading-none">{style.emoji}</span>
                        </div>
                        <span
                          className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mb-1.5"
                          style={{ background: `${style.color}18`, color: style.color }}
                        >
                          {style.meaning}
                        </span>
                        <p className="text-[12px] leading-snug text-[var(--text-secondary)]">
                          {description}
                        </p>
                        {isActive && interp && (
                          <p className="text-[13px] leading-relaxed mt-2.5 text-[var(--text)] border-t border-[var(--border)] pt-2.5">
                            {interp}
                          </p>
                        )}
                        {!isActive && interp && (
                          <p className="text-[10px] mt-1" style={{ color: style.color, opacity: 0.7 }}>
                            Tap to read interpretation ›
                          </p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
