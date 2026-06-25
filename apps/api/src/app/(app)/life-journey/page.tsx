'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveChart } from '@/hooks/useActiveChart';
import { SkeletonCard, PageSkeleton } from '@/components/ui/skeleton';
import { DashaPlanet3D } from '@/components/3d/DashaPlanet3D';
import { Planet3DInline } from '@/components/3d/Planet3DInline';
import { PlanetOrb2D } from '@/components/3d/PlanetOrb2D';
import { useTokenToast } from '@/components/ui/TokenToast';

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface LifePhase {
  index: number;
  planet: string;
  title: string;
  startYear: number;
  endYear: number;
  startAge: number;
  endAge: number;
  isActive: boolean;
  isCurrent: boolean;
}

interface JourneyData {
  phases: LifePhase[];
  birthYear: number;
  name: string;
  gender: string;
}

/* -------------------------------------------------------------------------- */
/*  Planet palette                                                             */
/* -------------------------------------------------------------------------- */

const PLANET_COLOR: Record<string, string> = {
  Ketu: '#9B6B9E', Venus: '#E8A87C', Sun: '#F4B942', Moon: '#8BC4E8',
  Mars: '#E8735A', Rahu: '#7BA3B8', Jupiter: '#C4A84F', Saturn: '#8BA89B',
  Mercury: '#6BBF9E',
};


/* -------------------------------------------------------------------------- */
/*  Plant growth stage illustrations — seed sprout → ancient tree             */
/* -------------------------------------------------------------------------- */

// Average human lifespan — phases past this render dimmed in the Future tab.
// Max is the full Vimshottari cycle (120y); phases past that are filtered out by the API.
const AVG_HUMAN_AGE = 80;
const MAX_HUMAN_AGE = 120;

const LIFE_STAGE_MAP: { maxAge: number; key: string }[] = [
  { maxAge: 2,   key: 'baby' },
  { maxAge: 5,   key: 'toddler' },
  { maxAge: 12,  key: 'child' },
  { maxAge: 18,  key: 'teen' },
  { maxAge: 28,  key: 'young-adult' },
  { maxAge: 40,  key: 'adult' },
  { maxAge: 55,  key: 'middle-aged' },
  { maxAge: 70,  key: 'senior' },
  { maxAge: Infinity, key: 'elderly' },
];

function getLifeStageKey(age: number): string {
  return LIFE_STAGE_MAP.find(s => age <= s.maxAge)?.key ?? 'elderly';
}

function PlantStageChar({ age, size = 'sm' }: { age: number; size?: 'sm' | 'lg' }) {
  const stage = getLifeStageKey(age);
  const w = size === 'lg' ? 48 : 36;
  const h = size === 'lg' ? 72 : 54;

  const stemColor = '#9E7248';
  const groundColor = '#D4C4A8';

  const leafColors: Record<string, [string, string]> = {
    baby:           ['#C2E8B0', '#8EC880'],
    toddler:        ['#A8DC96', '#78C465'],
    child:          ['#8CCC7C', '#60B450'],
    teen:           ['#70C062', '#48A838'],
    'young-adult':  ['#58AD50', '#389035'],
    adult:          ['#429A44', '#287A2E'],
    'middle-aged':  ['#348A38', '#1E6825'],
    senior:         ['#287830', '#146020'],
    elderly:        ['#1E6828', '#0E4E18'],
  };

  const [lc, lcD] = leafColors[stage] ?? leafColors['adult'];

  const content: Record<string, React.ReactNode> = {
    baby: (
      <>
        <ellipse cx={30} cy={104} rx={9} ry={3} fill={groundColor} opacity={0.7} />
        <path d="M 30 103 C 29 98 31 93 30 88" stroke={stemColor} strokeWidth={1.4} fill="none" strokeLinecap="round" />
        <ellipse cx={23} cy={89} rx={6.5} ry={3.5} fill={lc} transform="rotate(-35 23 89)" />
        <ellipse cx={37} cy={89} rx={6.5} ry={3.5} fill={lc} transform="rotate(35 37 89)" />
        <path d="M 30 88 C 29 84 31 82 30 80" stroke={stemColor} strokeWidth={1.2} fill="none" strokeLinecap="round" />
        <ellipse cx={30} cy={80} rx={3} ry={4} fill={lc} />
      </>
    ),
    toddler: (
      <>
        <ellipse cx={30} cy={104} rx={10} ry={3} fill={groundColor} opacity={0.7} />
        <path d="M 30 103 C 28 95 32 87 30 76" stroke={stemColor} strokeWidth={1.6} fill="none" strokeLinecap="round" />
        <ellipse cx={21} cy={97} rx={8} ry={3.5} fill={lc} transform="rotate(-30 21 97)" />
        <ellipse cx={39} cy={95} rx={8} ry={3.5} fill={lc} transform="rotate(25 39 95)" />
        <ellipse cx={22} cy={87} rx={7.5} ry={3.5} fill={lc} transform="rotate(-30 22 87)" />
        <ellipse cx={38} cy={85} rx={7.5} ry={3.5} fill={lc} transform="rotate(25 38 85)" />
        <ellipse cx={30} cy={76} rx={5} ry={6.5} fill={lc} />
      </>
    ),
    child: (
      <>
        <ellipse cx={30} cy={104} rx={11} ry={3} fill={groundColor} opacity={0.7} />
        <path d="M 30 103 C 27 92 33 81 30 66" stroke={stemColor} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        <ellipse cx={20} cy={98} rx={9} ry={4} fill={lc} transform="rotate(-28 20 98)" />
        <ellipse cx={40} cy={96} rx={9} ry={4} fill={lc} transform="rotate(22 40 96)" />
        <ellipse cx={21} cy={86} rx={8.5} ry={4} fill={lc} transform="rotate(-32 21 86)" />
        <ellipse cx={39} cy={84} rx={8.5} ry={4} fill={lc} transform="rotate(26 39 84)" />
        <ellipse cx={23} cy={75} rx={7.5} ry={3.5} fill={lc} transform="rotate(-30 23 75)" />
        <ellipse cx={37} cy={73} rx={7.5} ry={3.5} fill={lc} transform="rotate(24 37 73)" />
        <circle cx={30} cy={65} r={7} fill={lc} />
        <circle cx={26} cy={62} r={5} fill={lcD} opacity={0.3} />
      </>
    ),
    teen: (
      <>
        <ellipse cx={30} cy={104} rx={11} ry={3} fill={groundColor} opacity={0.7} />
        <path d="M 30 103 C 27 90 33 77 30 58" stroke={stemColor} strokeWidth={2} fill="none" strokeLinecap="round" />
        <ellipse cx={20} cy={99} rx={9} ry={4} fill={lc} transform="rotate(-28 20 99)" />
        <ellipse cx={40} cy={97} rx={9} ry={4} fill={lc} transform="rotate(22 40 97)" />
        <ellipse cx={21} cy={88} rx={8.5} ry={4} fill={lc} transform="rotate(-32 21 88)" />
        <ellipse cx={39} cy={86} rx={8.5} ry={4} fill={lc} transform="rotate(26 39 86)" />
        <ellipse cx={22} cy={77} rx={8} ry={3.5} fill={lc} transform="rotate(-30 22 77)" />
        <ellipse cx={38} cy={75} rx={8} ry={3.5} fill={lc} transform="rotate(24 38 75)" />
        <ellipse cx={23} cy={67} rx={7} ry={3.5} fill={lc} transform="rotate(-30 23 67)" />
        <ellipse cx={37} cy={65} rx={7} ry={3.5} fill={lc} transform="rotate(24 37 65)" />
        <circle cx={30} cy={56} r={9} fill={lc} />
        <circle cx={25} cy={53} r={6} fill={lcD} opacity={0.25} />
      </>
    ),
    'young-adult': (
      <>
        <ellipse cx={30} cy={104} rx={12} ry={3} fill={groundColor} opacity={0.7} />
        <path d="M 28 103 C 28 90 29 76 29.5 62" stroke={stemColor} strokeWidth={3} fill="none" strokeLinecap="round" />
        <path d="M 32 103 C 32 90 31 76 30.5 62" stroke={stemColor} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <path d="M 29.5 76 Q 22 71 18 67" stroke={stemColor} strokeWidth={1.5} fill="none" strokeLinecap="round" />
        <path d="M 30.5 73 Q 38 68 42 64" stroke={stemColor} strokeWidth={1.5} fill="none" strokeLinecap="round" />
        <circle cx={16} cy={65} r={6} fill={lc} />
        <circle cx={44} cy={62} r={6} fill={lc} />
        <circle cx={30} cy={50} r={13} fill={lc} />
        <circle cx={24} cy={46} r={9} fill={lcD} opacity={0.2} />
        <circle cx={35} cy={47} r={8} fill={lc} opacity={0.6} />
      </>
    ),
    adult: (
      <>
        <ellipse cx={30} cy={105} rx={13} ry={3.5} fill={groundColor} opacity={0.7} />
        <path d="M 26 105 L 27 63 L 33 63 L 34 105 Z" fill={stemColor} />
        <path d="M 28 73 Q 18 66 14 59" stroke={stemColor} strokeWidth={2} fill="none" strokeLinecap="round" />
        <path d="M 32 71 Q 42 64 46 57" stroke={stemColor} strokeWidth={2} fill="none" strokeLinecap="round" />
        <path d="M 30 66 L 30 56" stroke={stemColor} strokeWidth={1.5} fill="none" strokeLinecap="round" />
        <circle cx={12} cy={56} r={8} fill={lc} />
        <circle cx={48} cy={54} r={8} fill={lc} />
        <circle cx={30} cy={46} r={16} fill={lc} />
        <circle cx={22} cy={42} r={11} fill={lcD} opacity={0.2} />
        <circle cx={38} cy={43} r={10} fill={lc} opacity={0.55} />
        <circle cx={30} cy={38} r={9} fill={lc} opacity={0.7} />
      </>
    ),
    'middle-aged': (
      <>
        <ellipse cx={30} cy={105} rx={15} ry={4} fill={groundColor} opacity={0.7} />
        <path d="M 25 105 L 26 59 L 34 59 L 35 105 Z" fill={stemColor} />
        <path d="M 27 96 Q 30 92 33 96" stroke="#7A5230" strokeWidth={0.8} fill="none" opacity={0.4} />
        <path d="M 27 81 Q 30 77 33 81" stroke="#7A5230" strokeWidth={0.8} fill="none" opacity={0.4} />
        <path d="M 27 73 Q 16 64 10 56" stroke={stemColor} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <path d="M 33 69 Q 44 60 50 52" stroke={stemColor} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <path d="M 28 63 Q 22 51 20 43" stroke={stemColor} strokeWidth={2} fill="none" strokeLinecap="round" />
        <path d="M 32 63 Q 38 51 40 43" stroke={stemColor} strokeWidth={2} fill="none" strokeLinecap="round" />
        <circle cx={8} cy={52} r={9} fill={lc} />
        <circle cx={52} cy={49} r={9} fill={lc} />
        <circle cx={18} cy={39} r={9} fill={lc} />
        <circle cx={42} cy={39} r={9} fill={lc} />
        <circle cx={30} cy={40} r={18} fill={lc} />
        <circle cx={20} cy={35} r={13} fill={lcD} opacity={0.18} />
        <circle cx={40} cy={37} r={12} fill={lc} opacity={0.5} />
        <circle cx={30} cy={30} r={10} fill={lc} opacity={0.65} />
      </>
    ),
    senior: (
      <>
        <ellipse cx={30} cy={105} rx={16} ry={4} fill={groundColor} opacity={0.7} />
        <path d="M 25 105 Q 18 102 14 106" stroke={stemColor} strokeWidth={2} fill="none" strokeLinecap="round" />
        <path d="M 35 105 Q 42 102 46 106" stroke={stemColor} strokeWidth={2} fill="none" strokeLinecap="round" />
        <path d="M 24 105 L 26 57 L 34 57 L 36 105 Z" fill={stemColor} />
        <path d="M 27 96 Q 30 92 33 96" stroke="#6A4520" strokeWidth={1} fill="none" opacity={0.35} />
        <path d="M 26 79 Q 30 75 34 79" stroke="#6A4520" strokeWidth={1} fill="none" opacity={0.35} />
        <path d="M 26 75 Q 12 63 6 53" stroke={stemColor} strokeWidth={3} fill="none" strokeLinecap="round" />
        <path d="M 34 71 Q 48 59 54 49" stroke={stemColor} strokeWidth={3} fill="none" strokeLinecap="round" />
        <path d="M 28 63 Q 22 51 20 43" stroke={stemColor} strokeWidth={2} fill="none" strokeLinecap="round" />
        <path d="M 32 63 Q 38 51 40 43" stroke={stemColor} strokeWidth={2} fill="none" strokeLinecap="round" />
        <circle cx={4} cy={49} r={10} fill={lc} />
        <circle cx={56} cy={46} r={10} fill={lc} />
        <circle cx={18} cy={39} r={10} fill={lc} />
        <circle cx={42} cy={39} r={10} fill={lc} />
        <circle cx={30} cy={36} r={20} fill={lc} />
        <circle cx={18} cy={30} r={15} fill={lcD} opacity={0.16} />
        <circle cx={42} cy={32} r={13} fill={lc} opacity={0.5} />
        <circle cx={30} cy={24} r={12} fill={lc} opacity={0.7} />
      </>
    ),
    elderly: (
      <>
        <ellipse cx={30} cy={105} rx={18} ry={4.5} fill={groundColor} opacity={0.7} />
        <path d="M 24 105 Q 14 101 10 107" stroke={stemColor} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <path d="M 36 105 Q 46 101 50 107" stroke={stemColor} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <path d="M 23 106 C 24 90 27 70 28 55 L 33 55 C 34 70 36 88 37 106 Z" fill={stemColor} />
        <path d="M 26 96 Q 30 91 34 95" stroke="#6A4520" strokeWidth={1.2} fill="none" opacity={0.35} />
        <path d="M 25 80 Q 30 75 35 79" stroke="#6A4520" strokeWidth={1.2} fill="none" opacity={0.35} />
        <path d="M 26 65 Q 30 60 34 64" stroke="#6A4520" strokeWidth={1} fill="none" opacity={0.3} />
        <path d="M 25 77 Q 8 63 2 49" stroke={stemColor} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        <path d="M 35 73 Q 52 59 58 45" stroke={stemColor} strokeWidth={3.5} fill="none" strokeLinecap="round" />
        <path d="M 27 63 Q 16 49 14 37" stroke={stemColor} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <path d="M 33 63 Q 44 49 46 37" stroke={stemColor} strokeWidth={2.5} fill="none" strokeLinecap="round" />
        <circle cx={0} cy={45} r={10} fill={lc} />
        <circle cx={58} cy={41} r={10} fill={lc} />
        <circle cx={12} cy={33} r={11} fill={lc} />
        <circle cx={48} cy={33} r={11} fill={lc} />
        <circle cx={30} cy={32} r={22} fill={lc} />
        <circle cx={16} cy={26} r={16} fill={lcD} opacity={0.15} />
        <circle cx={44} cy={28} r={15} fill={lc} opacity={0.45} />
        <circle cx={30} cy={20} r={14} fill={lc} opacity={0.7} />
        <circle cx={22} cy={18} r={9} fill={lcD} opacity={0.2} />
      </>
    ),
  };

  return (
    <div className="flex-shrink-0" style={{ width: w, height: h }}>
      <svg viewBox="0 0 60 110" width={w} height={h} style={{ overflow: 'visible' }}>
        {content[stage] ?? content['adult']}
      </svg>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Life-area config                                                           */
/* -------------------------------------------------------------------------- */

type LifeArea = 'Career' | 'Love' | 'Money' | 'Health';

const LIFE_AREAS: { key: LifeArea; icon: string; color: string }[] = [
  { key: 'Career', icon: '💼', color: '#5C2E0E' },
  { key: 'Love', icon: '❤️', color: '#C0392B' },
  { key: 'Money', icon: '💰', color: '#DAA520' },
  { key: 'Health', icon: '🌿', color: '#2E7D32' },
];

const PLANET_LIFE_EFFECTS: Record<string, Record<LifeArea, { text: string; status: 'good' | 'neutral' | 'challenging' }>> = {
  Sun: {
    Career: { text: 'Authority & leadership emerge', status: 'good' },
    Love: { text: 'Pride may affect bonds', status: 'neutral' },
    Money: { text: 'Steady government-linked gains', status: 'good' },
    Health: { text: 'Strong vitality & immunity', status: 'good' },
  },
  Moon: {
    Career: { text: 'Creative intuition peaks', status: 'good' },
    Love: { text: 'Deep emotional connections', status: 'good' },
    Money: { text: 'Fluctuating — save wisely', status: 'neutral' },
    Health: { text: 'Watch mental & emotional health', status: 'neutral' },
  },
  Mars: {
    Career: { text: 'Ambitious drive, bold moves', status: 'good' },
    Love: { text: 'Passion, but watch tempers', status: 'neutral' },
    Money: { text: 'Bold investments, calculated risk', status: 'neutral' },
    Health: { text: 'High energy; avoid injuries', status: 'good' },
  },
  Mercury: {
    Career: { text: 'Communication & trade thrive', status: 'good' },
    Love: { text: 'Intellectual bond strengthens', status: 'good' },
    Money: { text: 'Business & commerce favored', status: 'good' },
    Health: { text: 'Mind stays sharp & active', status: 'good' },
  },
  Jupiter: {
    Career: { text: 'Growth, wisdom & recognition', status: 'good' },
    Love: { text: 'Blessings & harmony abound', status: 'good' },
    Money: { text: 'Abundance flows naturally', status: 'good' },
    Health: { text: 'Robust constitution', status: 'good' },
  },
  Venus: {
    Career: { text: 'Creative & artistic success', status: 'good' },
    Love: { text: 'Romance & deep harmony', status: 'good' },
    Money: { text: 'Wealth & luxury accrue', status: 'good' },
    Health: { text: 'Overall well-being & beauty', status: 'good' },
  },
  Saturn: {
    Career: { text: 'Hard work pays slowly but surely', status: 'neutral' },
    Love: { text: 'Commitment tested; bonds deepen', status: 'neutral' },
    Money: { text: 'Slow, steady accumulation', status: 'neutral' },
    Health: { text: 'Bones & joints need attention', status: 'challenging' },
  },
  Rahu: {
    Career: { text: 'Sudden breakthroughs possible', status: 'neutral' },
    Love: { text: 'Unconventional connections', status: 'neutral' },
    Money: { text: 'Unexpected gains or losses', status: 'neutral' },
    Health: { text: 'Mysterious ailments — stay vigilant', status: 'challenging' },
  },
  Ketu: {
    Career: { text: 'Spiritual detachment from ambition', status: 'neutral' },
    Love: { text: 'Karmic bonds surface', status: 'neutral' },
    Money: { text: 'Liberation from materialism', status: 'neutral' },
    Health: { text: 'Spiritual healing & introspection', status: 'good' },
  },
};

/* -------------------------------------------------------------------------- */
/*  Circular progress ring                                                     */
/* -------------------------------------------------------------------------- */

function CircleProgress({ pct, planet }: { pct: number; planet: string }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = PLANET_COLOR[planet] ?? '#7A96AB';
  return (
    <div className="relative" style={{ width: 128, height: 128 }}>
      <svg width={128} height={128} viewBox="0 0 128 128" className="absolute inset-0">
        <circle cx={64} cy={64} r={r} fill="none" stroke="var(--border)" strokeWidth={8} />
        <circle
          cx={64} cy={64} r={r} fill="none"
          stroke={color} strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          style={{ transition: 'stroke-dasharray 1s ease' }}
        />
        <text x={64} y={82} textAnchor="middle" fontSize={11} fill="var(--text)" fontWeight="700">{planet}</text>
        <text x={64} y={96} textAnchor="middle" fontSize={10} fill="var(--text-muted)">{Math.round(pct)}%</text>
      </svg>
      <div
        className="absolute"
        style={{ left: '50%', top: '36%', transform: 'translate(-50%, -50%)' }}
      >
        <Planet3DInline planet={planet} size={36} />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Past tab — linen alternating timeline                                      */
/* -------------------------------------------------------------------------- */

type TimelineEntry =
  | { kind: 'phase'; phase: LifePhase; isRight: boolean }
  | { kind: 'milestone'; year: number; icon: string; title: string };

const AGE_MILESTONES = [
  { offset: 16, icon: '🏠', title: 'Family Milestone' },
  { offset: 24, icon: '🎓', title: 'Education Phase Ends' },
];

function buildEntries(phases: LifePhase[], birthYear: number): TimelineEntry[] {
  const sorted = [...phases].sort((a, b) => a.startYear - b.startYear);
  const phaseBoundaries = new Set(sorted.flatMap(p => [p.startYear, p.endYear]));
  const fits = AGE_MILESTONES
    .map(m => ({ ...m, year: birthYear + m.offset }))
    .filter(m => {
      const tooClose = [...phaseBoundaries].some(b => Math.abs(b - m.year) <= 1);
      return !tooClose && m.year < new Date().getFullYear();
    });

  const result: TimelineEntry[] = [];
  let phaseIdx = 0;
  let visibleIdx = 0;
  while (phaseIdx < sorted.length) {
    const phase = sorted[phaseIdx];
    result.push({ kind: 'phase', phase, isRight: visibleIdx % 2 === 1 });
    visibleIdx++;
    const milestone = fits.find(m => m.year > phase.startYear && m.year <= phase.endYear);
    if (milestone) {
      result.push({ kind: 'milestone', year: milestone.year, icon: milestone.icon, title: milestone.title });
      visibleIdx++;
    }
    phaseIdx++;
  }
  return result;
}

function WavyBackdrop() {
  return (
    <svg
      className="absolute left-0 top-0 w-full h-full pointer-events-none"
      preserveAspectRatio="none"
      viewBox="0 0 320 600"
    >
      <path
        d="M 120 40 C 200 80, 80 160, 180 200 C 280 240, 60 320, 160 360 C 260 400, 80 480, 180 520"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function PastTab({ data, chartId }: { data: JourneyData; chartId: string }) {
  const birthYear = data.birthYear;
  const currentYear = new Date().getFullYear();
  const pastPhases = data.phases.filter(p => p.isCurrent || p.startYear <= currentYear);
  const entries = buildEntries(pastPhases, birthYear);
  const showWavy = entries.length >= 3;

  return (
    <div className="px-4 pb-24 pt-4">
      {/* Birth marker */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-3 mb-8 pl-1"
      >
        <PlantStageChar age={0} size="lg" />
        <div>
          <p className="text-[11px] text-text-muted">In {birthYear},</p>
          <p className="text-[15px] font-bold text-text">You were born</p>
        </div>
      </motion.div>

      <div className="relative">
        {/* Decorative wavy serpentine line */}
        {showWavy && <WavyBackdrop />}

        <div className="space-y-5 relative">
          {entries.map((entry, i) => {
            if (entry.kind === 'milestone') {
              const milestoneAge = entry.year - birthYear;
              return (
                <motion.div
                  key={`m-${entry.year}`}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.07 }}
                  className="flex items-center gap-3 pl-1"
                >
                  <div className="relative flex-shrink-0">
                    <PlantStageChar age={milestoneAge} size="lg" />
                    <span className="absolute -bottom-1 -right-1 text-base leading-none">{entry.icon}</span>
                  </div>
                  <div>
                    <p className="text-[11px] text-text-muted">{entry.year}</p>
                    <p className="text-[15px] font-bold text-text leading-tight">{entry.title}</p>
                  </div>
                </motion.div>
              );
            }

            const { phase, isRight } = entry;
            const accentColor = PLANET_COLOR[phase.planet] ?? '#7A96AB';
            return (
              <motion.div
                key={`p-${phase.index}`}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.07 }}
                className="space-y-2"
              >
                {/* Dasha label — alternates left / right */}
                <div className={`flex items-center gap-2 ${isRight ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex items-center gap-1.5 ${isRight ? 'flex-row-reverse' : ''}`}>
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: accentColor + '22', border: `1.5px solid ${accentColor}44` }}
                    >
                      <PlanetOrb2D planet={phase.planet} size={18} pulse={false} />
                    </div>
                    <p className="text-[12px] text-text-muted">
                      During{' '}
                      <span className="font-bold text-text">{phase.planet} Mahadasha</span>
                    </p>
                  </div>
                </div>

                {/* Event card */}
                <Link
                  href={`/life-journey/phase?chart=${chartId}&index=${phase.index}`}
                  className="block no-underline"
                >
                  <div
                    className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-transform bg-surface border ${phase.isCurrent ? 'border-primary/40 shadow-[0_4px_16px_rgba(212, 175, 55,0.12)]' : 'border-border'}`}
                    style={phase.isCurrent ? { borderWidth: '2px' } : {}}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="text-[14px] font-semibold text-text truncate">{phase.title}</p>
                        {phase.isCurrent && (
                          <span
                            className="flex-shrink-0 text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary text-white"
                          >
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-text-muted">
                        Age {phase.startAge}–{phase.endAge} · {phase.startYear}–{phase.endYear}
                      </p>
                    </div>
                    <PlantStageChar age={phase.startAge} />
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none"
                      stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"
                      className="flex-shrink-0"
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Future tab — forward timeline up to age 120, with sunset marker at 80     */
/* -------------------------------------------------------------------------- */

function FutureTab({ data, chartId }: { data: JourneyData; chartId: string }) {
  const birthYear = data.birthYear;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentAge = currentYear - birthYear;

  const futurePhases = [...data.phases]
    .filter(p => p.startYear > currentYear && p.startAge <= MAX_HUMAN_AGE)
    .sort((a, b) => a.startYear - b.startYear);

  if (futurePhases.length === 0) {
    return (
      <div className="px-6 pt-12 pb-24 text-center">
        <div className="text-5xl mb-4">✨</div>
        <p className="text-[15px] font-bold text-text mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          Your visible Vimshottari cycle is complete.
        </p>
        <p className="text-[13px] text-text-muted">
          The 120-year wheel turns onward — beyond what the dasha map shows.
        </p>
      </div>
    );
  }


  // Find the index where dimmed treatment starts (first phase with startAge > AVG_HUMAN_AGE)
  const dimStartIdx = futurePhases.findIndex(p => p.startAge > AVG_HUMAN_AGE);
  const showWavy = futurePhases.length >= 3;

  return (
    <div className="px-4 pb-24 pt-4">
      {/* Today marker */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-center gap-3 mb-8 pl-1"
      >
        <PlantStageChar age={currentAge} size="lg" />
        <div>
          <p className="text-[11px] text-text-muted">In {currentYear},</p>
          <p className="text-[15px] font-bold text-text">You are here · Age {currentAge}</p>
        </div>
      </motion.div>

      <div className="relative">
        {showWavy && <WavyBackdrop />}

        <div className="space-y-5 relative">
          {futurePhases.map((phase, i) => {
            const accentColor = PLANET_COLOR[phase.planet] ?? '#7A96AB';
            const isRight = i % 2 === 1;
            const isDimmed = phase.startAge > AVG_HUMAN_AGE;
            // Sunset row appears once, just before the first dimmed phase
            const showSunsetBefore = dimStartIdx >= 0 && i === dimStartIdx;

            return (
              <div key={`fp-${phase.index}`}>
                {showSunsetBefore && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.07 }}
                    className="flex items-center gap-3 pl-1 mb-5"
                  >
                    <span className="text-3xl flex-shrink-0">🌅</span>
                    <div>
                      <p className="text-[11px] text-text-muted">Around age {AVG_HUMAN_AGE}</p>
                      <p className="text-[13px] font-semibold text-text leading-tight" style={{ fontStyle: 'italic' }}>
                        Beyond this, the cosmic blueprint thins.
                      </p>
                    </div>
                  </motion.div>
                )}

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: isDimmed ? 0.55 : 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.07 }}
                  className="space-y-2"
                >
                  {/* Dasha label — alternates left / right */}
                  <div className={`flex items-center gap-2 ${isRight ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-center gap-1.5 ${isRight ? 'flex-row-reverse' : ''}`}>
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: accentColor + '22', border: `1.5px solid ${accentColor}44` }}
                      >
                        <PlanetOrb2D planet={phase.planet} size={18} pulse={false} />
                      </div>
                      <p className="text-[12px] text-text-muted">
                        Entering{' '}
                        <span className="font-bold text-text">{phase.planet} Mahadasha</span>
                      </p>
                    </div>
                  </div>

                  {/* Event card */}
                  <Link
                    href={`/life-journey/phase?chart=${chartId}&index=${phase.index}`}
                    className="block no-underline"
                  >
                    <div
                      className="flex items-center gap-3 rounded-2xl px-4 py-3.5 active:scale-[0.98] transition-transform bg-surface border border-border"
                      style={isDimmed ? { borderStyle: 'dashed' } : {}}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-[14px] font-semibold text-text truncate">{phase.title}</p>
                        </div>
                        <p className="text-[11px] text-text-muted">
                          Age {phase.startAge}–{phase.endAge} · {phase.startYear}–{phase.endYear}
                        </p>
                      </div>
                      <PlantStageChar age={phase.startAge} />
                      <svg
                        width="16" height="16" viewBox="0 0 24 24" fill="none"
                        stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round"
                        className="flex-shrink-0"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  </Link>
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Present tab — current dasha + life areas                                  */
/* -------------------------------------------------------------------------- */

type DashaPart = { planet?: string; startDate?: string; endDate?: string };
type PratyantarPeriod = { planet?: string; startDate?: string; endDate?: string; isActive?: boolean };

function fmtShortDate(iso?: string, fallback?: string): string {
  if (!iso) return fallback ?? '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return fallback ?? '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

// Static short text per (planet, area) for pratyantardasha timeline
const PRATYANTAR_TEXT: Record<string, Record<string, string>> = {
  Career: {
    Sun: 'You may feel a drive toward leadership and recognition.',
    Moon: 'Intuition guides your professional decisions.',
    Mars: 'Bold ambition pushes your career forward.',
    Mercury: 'Clear thinking and communication help you excel.',
    Jupiter: 'Growth and wisdom bring new opportunities.',
    Venus: 'Collaboration and charm open doors at work.',
    Saturn: 'Focused discipline brings steady results.',
    Rahu: 'Unconventional ideas may reshape your path.',
    Ketu: 'Deep reflection helps clarify your true purpose.',
  },
  Love: {
    Sun: 'Self-expression naturally strengthens your bond.',
    Moon: 'Deep emotional sensitivity enriches connection.',
    Mars: 'Passion runs high — channel it with care.',
    Mercury: 'Open conversations deepen understanding.',
    Jupiter: 'Warmth and generosity enrich your relationship.',
    Venus: 'Romance and harmony naturally flourish.',
    Saturn: 'Commitment and patience strengthen trust.',
    Rahu: 'Unexpected attraction or unconventional bonds.',
    Ketu: 'Karmic connections surface for healing.',
  },
  Money: {
    Sun: 'Authority figures may bring financial opportunity.',
    Moon: 'Financial intuition peaks — trust your instincts.',
    Mars: 'Bold moves may yield quick gains or losses.',
    Mercury: 'Trade and smart planning improve finances.',
    Jupiter: 'Abundance and lucky breaks are possible.',
    Venus: 'Gains from creativity and luxury spending.',
    Saturn: 'Slow, steady saving builds lasting wealth.',
    Rahu: 'Sudden windfalls or unexpected expenses.',
    Ketu: 'Liberation from material attachment is wise.',
  },
  Health: {
    Sun: 'Vitality and immunity are naturally strong.',
    Moon: 'Emotional balance supports overall well-being.',
    Mars: 'High energy — channel it through exercise.',
    Mercury: 'Mental clarity and nervous system need focus.',
    Jupiter: 'Robust constitution and healing energy.',
    Venus: 'Rest and gentle routines restore your energy.',
    Saturn: 'Bones and joints need gentle attention.',
    Rahu: 'Watch for unusual symptoms — stay vigilant.',
    Ketu: 'Spiritual practices support deep healing.',
  },
};

function daysBetween(iso?: string): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.ceil((d.getTime() - Date.now()) / 86_400_000));
}

const SUB_TABS = ['Today', 'Dasha Phase', 'Next Signs', 'Do / Avoid'] as const;
type SubTab = typeof SUB_TABS[number];

function parsePoints(story: string): string[] {
  try {
    const parsed = JSON.parse(story) as unknown;
    if (Array.isArray(parsed)) return (parsed as unknown[]).map(s => String(s));
  } catch { /* legacy paragraph */ }
  return [story];
}

interface AreaInsightRow {
  area: LifeArea;
  status: 'good' | 'neutral' | 'challenging';
  brief: string;
  story: string;
  key_insights: string[];
}

function PresentTab({ data, activeChart, chartId }: { data: JourneyData; activeChart: unknown; chartId: string }) {
  type ChartWithDasha = {
    dasha_data?: {
      vimshottari?: {
        currentMahadasha?: DashaPart;
        currentAntardasha?: DashaPart & { subPeriods?: PratyantarPeriod[] };
        mahadashas?: Array<DashaPart & { isActive?: boolean }>;
      };
    };
  };
  const chart = activeChart as ChartWithDasha | null;
  const current = data.phases.find(p => p.isCurrent) ?? data.phases[data.phases.length - 1];
  const [activeArea, setActiveArea] = useState<LifeArea>('Career');
  const [subTab, setSubTab] = useState<SubTab>('Today');
  const selectArea = (area: LifeArea) => {
    setActiveArea(area);
    setSubTab('Today');
  };
  const [expandedArea, setExpandedArea] = useState<LifeArea | null>(null);
  const [eventIndex, setEventIndex] = useState(0);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { showSuccess } = useTokenToast();

  // Live Sade Sati — recomputes from current Saturn transit each load (the value
  // stored in dosha_data is frozen at chart-generate time and goes stale).
  const sadeSatiQuery = useQuery({
    queryKey: ['transits', 'sade-sati', chartId],
    enabled: !!chartId && !!chart,
    staleTime: 6 * 3600 * 1000,
    queryFn: async () => {
      const cd = (activeChart as { chart_data?: { planets?: Array<{ planet?: string; name?: string; sign?: string }> } } | null)?.chart_data;
      const moonSign = (cd?.planets ?? []).find((p) => (p.planet ?? p.name) === 'Moon')?.sign;
      if (!moonSign) return null;
      const r = await fetch(`/api/transits/sade-sati?moonSign=${encodeURIComponent(moonSign)}`);
      if (!r.ok) return null;
      const j = await r.json();
      return (j?.data ?? null) as null | {
        active: boolean;
        phase: 'rising' | 'peak' | 'setting' | 'none';
        endDate: string | null;
        saturnSign?: string;
        moonSign?: string;
      };
    },
  });

  // Pull AI-generated life-area insights for the current phase. Cached server-side
  // per (chart, phase, area), so revisits are instant.
  const { data: insightsData } = useQuery<AreaInsightRow[]>({
    queryKey: ['life-areas', chartId, current?.index ?? 0],
    queryFn: async () => {
      const r = await fetch('/api/life-journey/life-areas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId, phaseIndex: current?.index ?? 0 }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? 'Failed');
      return j.data as AreaInsightRow[];
    },
    enabled: !!chartId && !!current,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  if (!current) return <div className="py-12 text-center text-text-muted">No current phase found.</div>;

  const planet = current.planet;
  const fallback = PLANET_LIFE_EFFECTS[planet] ?? PLANET_LIFE_EFFECTS.Jupiter;
  // Build a lookup; insights from API take priority, fallback to static text
  const areaMap: Record<LifeArea, AreaInsightRow> = (['Career', 'Love', 'Money', 'Health'] as LifeArea[])
    .reduce((acc, key) => {
      const row = insightsData?.find(r => r.area === key);
      acc[key] = row ?? {
        area: key,
        status: fallback[key].status,
        brief: fallback[key].text,
        story: '',
        key_insights: [],
      };
      return acc;
    }, {} as Record<LifeArea, AreaInsightRow>);
  const insightsLoading = !insightsData;

  // AI story + do/avoid for active area (antardasha-level, cached in DB)
  const insightKey = ['life-journey-insight', chartId, activeArea] as const;
  const { data: areaInsight, isLoading: areaInsightLoading } = useQuery({
    queryKey: insightKey,
    queryFn: async () => {
      const r = await fetch('/api/life-journey/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId, area: activeArea }),
      });
      const res = await r.json() as { success: boolean; data?: { title: string; story: string; doItems: string[]; avoidItems: string[] } };
      if (!res.success || !res.data) throw new Error('Failed');
      return res.data;
    },
    enabled: !!chartId && !!current && (subTab === 'Today' || subTab === 'Do / Avoid'),
    staleTime: Infinity,
    gcTime: Infinity,
  });

  // Life events for "Does This Feel Like You?" cards
  interface JourneyEventItem { id: string; short: string; story: string; feedback: 'agree' | 'maybe' | 'disagree' | null; }
  interface PhaseDataResult { events: JourneyEventItem[]; }
  const eventsKey = ['life-journey-phase', chartId, current?.index ?? 0] as const;
  const { data: phaseData } = useQuery<PhaseDataResult>({
    queryKey: eventsKey,
    queryFn: async () => {
      const r = await fetch('/api/life-journey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartId, phaseIndex: current?.index ?? 0 }),
      });
      const res = await r.json() as { success: boolean; data?: PhaseDataResult };
      if (!res.success || !res.data) throw new Error('Failed');
      return res.data;
    },
    enabled: !!chartId && !!current && subTab === 'Do / Avoid',
    staleTime: Infinity,
    gcTime: Infinity,
  });

  async function handleEventFeedback(eventId: string, kind: 'agree' | 'maybe' | 'disagree') {
    if (busyEventId) return;
    setBusyEventId(eventId);
    try {
      const res = await fetch('/api/life-journey/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, feedback: kind }),
      });
      const body = await res.json() as { success: boolean; data?: { id: string; short_text: string; story_text: string; feedback: JourneyEventItem['feedback'] } };
      if (!body.success || !body.data) return;
      const u = body.data;
      queryClient.setQueryData<PhaseDataResult>(eventsKey, prev =>
        prev ? { ...prev, events: prev.events.map(e => e.id === eventId ? { id: u.id, short: u.short_text, story: u.story_text, feedback: u.feedback } : e) } : prev
      );
      if (kind === 'disagree') {
        showSuccess('Thanks for the feedback', "We'll make this more accurate by tomorrow. Come back to see your fresh reading.");
      }
    } catch (e) { console.error('[insight feedback]', e); }
    finally { setBusyEventId(null); }
  }

  const events = phaseData?.events ?? [];
  const currentEvent = events[eventIndex];

  const vimshottari = chart?.dasha_data?.vimshottari;
  const md = vimshottari?.currentMahadasha;
  const ad = vimshottari?.currentAntardasha;
  const pratyantars: PratyantarPeriod[] = ad?.subPeriods ?? [];

  const allMahadashas = vimshottari?.mahadashas ?? [];
  const currentMDIdx = allMahadashas.findIndex(m => m.isActive);
  const nextMDPlanet = currentMDIdx >= 0 && currentMDIdx + 1 < allMahadashas.length
    ? allMahadashas[currentMDIdx + 1]?.planet : undefined;

  const mdStart = fmtShortDate(md?.startDate, `${current.startYear}`);
  const mdEnd = fmtShortDate(md?.endDate, `${current.endYear}`);
  const newChapterDays = daysBetween(md?.endDate);

  const adStart = fmtShortDate(ad?.startDate);
  const adEnd = fmtShortDate(ad?.endDate);
  const adDaysLeft = daysBetween(ad?.endDate);
  const adPlanet = ad?.planet ?? planet;

  // Sade Sati derived labels
  const SS_SIGNS = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces'] as const;
  const ss = sadeSatiQuery.data;
  const ssPhaseLabel = ss?.phase === 'rising' ? 'Rising' : ss?.phase === 'peak' ? 'Peak' : ss?.phase === 'setting' ? 'Ending' : '';
  const ssEnd = ss?.endDate ? fmtShortDate(ss.endDate) : '';
  let dhaiyaLabel = '';
  if (ss?.saturnSign && ss?.moonSign) {
    const moonIdx = (SS_SIGNS as readonly string[]).indexOf(ss.moonSign);
    const satIdx = (SS_SIGNS as readonly string[]).indexOf(ss.saturnSign);
    if (moonIdx >= 0 && satIdx >= 0) {
      const houseFromMoon = ((satIdx - moonIdx + 12) % 12) + 1;
      if (houseFromMoon === 4) dhaiyaLabel = 'Kantaka Shani';
      else if (houseFromMoon === 8) dhaiyaLabel = 'Dhaiya (Ashtama Shani)';
    }
  }

  // Antardasha progress ring
  const adTotal = ad?.startDate && ad?.endDate
    ? new Date(ad.endDate).getTime() - new Date(ad.startDate).getTime()
    : 0;
  const adElapsed = ad?.startDate
    ? Date.now() - new Date(ad.startDate).getTime()
    : 0;
  const adPct = adTotal > 0 ? Math.min(Math.max((adElapsed / adTotal) * 100, 2), 98) : 30;
  const ringCirc = 2 * Math.PI * 46;

  const STATUS_TAG: Record<'good' | 'neutral' | 'challenging', { label: string; color: string }> = {
    good: { label: 'Good', color: '#4A8A7A' },
    neutral: { label: 'Neutral', color: '#7A96AB' },
    challenging: { label: 'Challenging', color: '#C26870' },
  };

  const currentPtIdx = pratyantars.findIndex(pt => pt.isActive === true);
  const futurePratyantars = pratyantars.slice(currentPtIdx >= 0 ? currentPtIdx + 1 : 0).slice(0, 4);
  const nextMD = currentMDIdx >= 0 && currentMDIdx + 1 < allMahadashas.length ? allMahadashas[currentMDIdx + 1] : null;

  return (
    <>
      {/* ── Top section ── */}
      <div className="px-4 pb-6 pt-2">
        {/* Scroll hint */}
        <div className="flex items-center justify-center gap-1 mb-2">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5" strokeLinecap="round">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
          <p className="j-eyebrow">SCROLL TO SEE PAST CHAPTER</p>
        </div>

        {/* Title */}
        <div className="text-center mb-4">
          <h2 className="text-[22px] font-bold text-text j-display">Your Current Life Chapter</h2>
          {newChapterDays !== null && (
            <p className="text-[13px] mt-1 text-text-muted">
              A new chapter begins in <span className="font-bold text-text">{newChapterDays}</span> days
            </p>
          )}
        </div>

        {/* Animated 3D planet of the current dasha lord */}
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="flex justify-center my-2"
        >
          <div className="relative w-56 h-56">
            <DashaPlanet3D planet={planet} />
            <div className="absolute inset-x-0 bottom-2 text-center pointer-events-none">
              <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-text-muted">
                {planet} Mahadasha
              </p>
            </div>
          </div>
        </motion.div>

        {/* 2x2 life-area grid */}
        <LayoutGroup>
          <div className="grid grid-cols-2 gap-3 mt-4">
            {LIFE_AREAS.map((area, i) => {
              const insight = areaMap[area.key];
              const status = STATUS_TAG[insight.status];
              const isExpanded = expandedArea === area.key;
              return (
                <motion.button
                  key={area.key}
                  onClick={() => {
                    selectArea(area.key);
                    setExpandedArea(isExpanded ? null : area.key);
                  }}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.06, layout: { duration: 0.32, ease: [0.32, 0.72, 0, 1] } }}
                  layout
                  className="rounded-2xl p-3.5 text-left border-none cursor-pointer bg-surface border border-border overflow-hidden"
                  style={{
                    borderColor: isExpanded ? 'var(--primary)' : undefined,
                    gridColumn: isExpanded ? 'span 2' : 'auto',
                    transition: 'background-color 0.2s ease, border-color 0.2s ease',
                  }}
                >
                  <motion.div layout="position" className="mb-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-base flex-shrink-0">{area.icon}</span>
                      <span className="text-[11px] font-bold text-text tracking-wider">{area.key.toUpperCase()}</span>
                      <motion.svg
                        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2.5"
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
                        className="ml-auto flex-shrink-0"
                      >
                        <polyline points="6 9 12 15 18 9"/>
                      </motion.svg>
                    </div>
                    <span
                      className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: status.color + '18', color: status.color }}
                    >
                      {status.label}
                    </span>
                  </motion.div>
                  <motion.p
                    layout="position"
                    className="text-[12px] leading-snug text-text"
                    style={{ fontFamily: isExpanded ? 'var(--font-display)' : undefined }}
                  >
                    {insightsLoading && !insight.brief ? (
                      <span className="inline-block w-3/4 h-3 rounded animate-pulse bg-surface-2" />
                    ) : insight.brief}
                  </motion.p>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key="story"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeOut', delay: 0.08 }}
                      >
                        <div className="pt-3 mt-3 border-t border-border">
                          {insight.story && (
                            <ul className="space-y-1.5 mb-3 list-none p-0 m-0">
                              {parsePoints(insight.story).map((pt, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span className="flex-shrink-0 mt-[3px] text-[10px] text-accent">◆</span>
                                  <span className="text-[12px] leading-snug flex-1 text-text">{pt}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                          {insight.key_insights.length > 0 && (
                            <div className="space-y-1.5">
                              {insight.key_insights.map((tip, idx) => (
                                <div key={idx} className="flex gap-2 items-start">
                                  <span className="text-[10px] mt-0.5 text-primary">✦</span>
                                  <p className="text-[11.5px] leading-snug flex-1 text-text-muted">{tip}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {insightsLoading && !insight.story && (
                            <p className="text-[11px] italic text-text-muted">✨ Reading the stars for you…</p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      {/* ── Bottom section ── */}
      <div className="bg-bg pb-24">
        {/* Category strip */}
        <div className="flex border-b border-border">
          {LIFE_AREAS.map(a => (
            <button
              key={a.key}
              onClick={() => selectArea(a.key)}
              className="flex-1 py-3 text-[13px] transition-all border-none bg-transparent cursor-pointer"
              style={{
                borderBottom: activeArea === a.key ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeArea === a.key ? 'var(--text)' : 'var(--text-muted)',
                fontWeight: activeArea === a.key ? 700 : 500,
              }}
            >
              {a.key}
            </button>
          ))}
        </div>

        {/* Decorative header */}
        <div className="px-4 lg:px-8 mt-5">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-10 h-px bg-border-strong" />
            <span className="text-xs text-accent">✦</span>
            <span className="j-eyebrow">
              {activeArea.toUpperCase()} IN THIS DASHA
            </span>
            <span className="text-xs text-accent">✦</span>
            <div className="w-10 h-px bg-border-strong" />
          </div>
        </div>

        {/* Antardasha progress row */}
        <div className="flex items-center justify-center gap-6 px-4 lg:px-8 mb-3">
          <div className="text-center">
            <p className="text-[10px] text-text-muted">Started on</p>
            <p className="text-sm font-semibold text-text">{adStart}</p>
          </div>
          <div className="relative w-24 h-24">
            <div
              className="absolute inset-0 rounded-full overflow-hidden flex items-center justify-center bg-surface-2"
            >
              <Planet3DInline planet={adPlanet} size={68} />
            </div>
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="46" fill="none" stroke="var(--border)" strokeWidth="3" />
              <circle
                cx="50" cy="50" r="46" fill="none" stroke="var(--success)" strokeWidth="3"
                strokeDasharray={`${(adPct / 100) * ringCirc} ${ringCirc}`}
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-text-muted">Ends on</p>
            <p className="text-sm font-semibold text-text">{adEnd}</p>
          </div>
        </div>

        {/* Antardasha label */}
        <div className="text-center mb-1 px-4">
          <h3 className="text-base font-bold text-text">{adPlanet} Pratayantar</h3>
          <p className="text-xs text-text-muted">
            {adDaysLeft !== null ? `${adDaysLeft} days left` : ''}
            {nextMDPlanet ? ` · Next: ${nextMDPlanet}` : ''}
          </p>
        </div>
        {/* Sub-tab bar */}
        <div className="mx-4 lg:mx-8 mb-4">
          <div className="flex rounded-2xl p-1 gap-0.5 overflow-x-auto bg-surface-2">
            {SUB_TABS.map(t => (
              <button
                key={t}
                onClick={() => setSubTab(t)}
                className="flex-shrink-0 flex-1 py-2.5 rounded-xl text-[11px] font-medium whitespace-nowrap px-3 transition-all border-none cursor-pointer"
                style={{
                  backgroundColor: subTab === t ? 'var(--surface)' : 'transparent',
                  color: subTab === t ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: subTab === t ? 'var(--shadow-sm)' : undefined,
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* ── Sub-tab bodies ── */}
        <div className="px-4 lg:px-8 space-y-3">

          {/* TODAY */}
          {subTab === 'Today' && (
            <div className="rounded-2xl p-4 bg-surface border border-border">
              {/* Date context pills */}
              <div className="flex gap-2 flex-wrap mb-3">
                <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold bg-primary-soft text-primary-ink border border-border">
                  🪐 {planet} Mahadasha · {mdStart} – {mdEnd}
                </span>
                <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold bg-surface-2 text-text border border-border">
                  {adPlanet} Antardasha · {adStart} – {adEnd}{adDaysLeft !== null ? ` · ${adDaysLeft}d left` : ''}
                </span>
                {ss?.active && (
                  <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold border" style={{ background: '#FBE9D6', color: '#8A5A2B', borderColor: '#E8C9A1' }}>
                    ♄ Sade Sati · {ssPhaseLabel}{ssEnd ? ` · ends ${ssEnd}` : ''}
                  </span>
                )}
                {dhaiyaLabel && (
                  <span className="text-[10px] px-2.5 py-1 rounded-full font-semibold border" style={{ background: '#FBE9D6', color: '#8A5A2B', borderColor: '#E8C9A1' }}>
                    ♄ {dhaiyaLabel}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{LIFE_AREAS.find(a => a.key === activeArea)?.icon}</span>
                <div>
                  <p className="j-eyebrow">In this dasha</p>
                  <p className="text-[13px] font-bold text-text">{activeArea}</p>
                </div>
              </div>
              <div className="w-full h-px mb-3 bg-border" />
              {areaInsightLoading ? (
                <div className="space-y-2">
                  <div className="h-5 w-3/4 rounded animate-pulse bg-surface-2" />
                  <div className="h-3 w-full rounded animate-pulse bg-surface-2" />
                  <div className="h-3 w-5/6 rounded animate-pulse bg-surface-2" />
                </div>
              ) : areaInsight ? (
                <>
                  <h3 className="text-[17px] font-bold leading-snug mb-3 text-text">{areaInsight.title}</h3>
                  <ul className="space-y-2 list-none p-0 m-0">
                    {parsePoints(areaInsight.story).map((pt, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="flex-shrink-0 mt-[3px] text-[11px] text-primary">◆</span>
                        <span className="text-[13px] leading-snug flex-1 text-text">{pt}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-[13px] leading-relaxed text-text">
                  Today&apos;s energy from {adPlanet} antardasha within {planet} mahadasha. {areaMap[activeArea].brief}.
                </p>
              )}
              <div className="mt-3 pt-3 border-t border-border">
                <Link href="/chat" className="flex items-center justify-between no-underline text-primary">
                  <span className="text-[13px] font-medium">Need more help? Talk to astrologer.</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                </Link>
              </div>
            </div>
          )}

          {/* DASHA PHASE */}
          {subTab === 'Dasha Phase' && (
            <>
              {/* Mahadasha header */}
              <div className="rounded-2xl px-4 py-3 flex items-center justify-between bg-primary-ink">
                <div>
                  <p className="j-eyebrow text-white mb-0.5">MAHADASHA</p>
                  <p className="text-[15px] font-bold text-white">{planet}</p>
                  <p className="text-[10px] text-white">{mdStart} → {mdEnd}</p>
                </div>
                {newChapterDays !== null && (
                  <div className="text-right">
                    <p className="text-[22px] font-bold text-white leading-none">{newChapterDays}</p>
                    <p className="text-[9px] text-white">days to next<br/>chapter</p>
                  </div>
                )}
              </div>

              {/* Pratyantar timeline */}
              <div className="rounded-2xl p-4 bg-surface border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className="j-eyebrow">SUB-PERIODS IN {adPlanet.toUpperCase()} ANTARDASHA</span>
                </div>
                {pratyantars.length === 0 ? (
                  <p className="text-[13px] text-text-muted">
                    {current.title}. You are {Math.max(1, new Date().getFullYear() - current.startYear + 1)} of {current.endYear - current.startYear} years into this phase.
                  </p>
                ) : (
                  <div className="relative">
                    <div className="absolute left-[7px] top-3 bottom-3 w-px bg-border" />
                    <div className="space-y-4">
                      {pratyantars.map((pt, idx) => {
                        const isCurrent = pt.isActive === true;
                        const isPast = !isCurrent && !!pt.endDate && new Date(pt.endDate) < new Date();
                        const ptPlanet = pt.planet ?? '';
                        const shortText = PRATYANTAR_TEXT[activeArea]?.[ptPlanet] ?? `${ptPlanet} energy shapes this period.`;
                        return (
                          <div key={idx} className="flex gap-4">
                            <div className="flex-shrink-0 mt-1">
                              <div className="w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center"
                                style={{ backgroundColor: isCurrent ? 'var(--primary)' : isPast ? 'var(--primary)' : 'var(--surface)', borderColor: isCurrent || isPast ? 'var(--primary)' : 'var(--border-strong)' }}>
                                {isCurrent && <div className="w-2 h-2 rounded-full bg-surface" />}
                              </div>
                            </div>
                            <div className={`flex-1 pb-1 ${isCurrent ? 'rounded-xl p-3 -mt-2 -ml-1' : ''}`}
                              style={isCurrent ? { backgroundColor: 'var(--primary-soft)', border: '1px solid var(--primary)' } : {}}>
                              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                <span className="text-[11px] font-bold" style={{ color: isPast ? 'var(--text-muted)' : 'var(--text)' }}>{ptPlanet}</span>
                                <span className="text-[10px]" style={{ color: isPast ? 'var(--text-dim)' : 'var(--text-muted)' }}>
                                  {fmtShortDate(pt.startDate)} – {fmtShortDate(pt.endDate)}
                                </span>
                                {isCurrent && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary text-white">NOW</span>}
                              </div>
                              <p className="text-[12px] leading-snug" style={{ color: isPast ? 'var(--text-muted)' : 'var(--text)' }}>{shortText}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* NEXT SIGNS */}
          {subTab === 'Next Signs' && (
            <>
              {/* Current antardasha winding down */}
              <div className="rounded-2xl p-4 bg-surface border border-border">
                <p className="j-eyebrow mb-2">CURRENT ANTARDASHA ENDING</p>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-[16px] font-bold text-text">{adPlanet} Antardasha</p>
                    <p className="text-[11px] text-text-muted">{adStart} → {adEnd}</p>
                  </div>
                  {adDaysLeft !== null && (
                    <div className="text-right px-3 py-2 rounded-xl"
                      style={{
                        backgroundColor: adDaysLeft < 60 ? 'var(--danger-soft)' : 'var(--surface-2)',
                        border: `1px solid ${adDaysLeft < 60 ? 'var(--danger)' : 'var(--border)'}`,
                      }}>
                      <p className="text-[20px] font-bold leading-none" style={{ color: adDaysLeft < 60 ? 'var(--danger)' : 'var(--text)' }}>{adDaysLeft}</p>
                      <p className="text-[9px] text-text-muted">days left</p>
                    </div>
                  )}
                </div>
                <p className="text-[12px] leading-relaxed text-text">
                  {PRATYANTAR_TEXT[activeArea]?.[adPlanet] ?? `${adPlanet} energy shapes this period.`}
                </p>
              </div>

              {/* Future pratyantars */}
              {futurePratyantars.length > 0 && (
                <div className="rounded-2xl p-4 bg-surface border border-border">
                  <p className="j-eyebrow mb-3">UPCOMING SUB-PERIODS</p>
                  <div className="space-y-3">
                    {futurePratyantars.map((pt, idx) => {
                      const ptPlanet = pt.planet ?? '';
                      return (
                        <div key={idx} className="flex gap-3 items-start">
                          <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                            style={{ backgroundColor: idx === 0 ? 'var(--primary)' : 'var(--surface-2)', color: idx === 0 ? '#fff' : 'var(--primary)' }}>
                            {idx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-bold text-text">{ptPlanet}</span>
                              <span className="text-[10px] text-text-muted">{fmtShortDate(pt.startDate)} – {fmtShortDate(pt.endDate)}</span>
                              {idx === 0 && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary text-white">NEXT</span>}
                            </div>
                            <p className="text-[11px] mt-0.5 text-text">
                              {PRATYANTAR_TEXT[activeArea]?.[ptPlanet] ?? `${ptPlanet} energy shapes this period.`}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Upcoming Mahadasha change */}
              {nextMDPlanet && (
                <div className="rounded-2xl p-4 bg-primary-ink border border-border">
                  <p className="j-eyebrow text-white/50 mb-2">UPCOMING MAHADASHA</p>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-[18px] font-bold text-white">{nextMDPlanet} Mahadasha</p>
                      <p className="text-[11px] text-white/55">
                        Starts {mdEnd}{nextMD?.endDate ? ` · ends ${fmtShortDate(nextMD.endDate)}` : ''}
                      </p>
                    </div>
                    {newChapterDays !== null && (
                      <div className="text-right">
                        <p className="text-[22px] font-bold text-white leading-none">{newChapterDays}</p>
                        <p className="text-[9px] text-white/50">days away</p>
                      </div>
                    )}
                  </div>
                  <div className="w-full h-px mb-2 bg-white/10" />
                  <p className="text-[12px] leading-relaxed text-white/75">
                    {PLANET_LIFE_EFFECTS[nextMDPlanet]?.[activeArea]?.text ?? `${nextMDPlanet} mahadasha brings new ${activeArea.toLowerCase()} themes.`}
                  </p>
                </div>
              )}
            </>
          )}

          {/* DO / AVOID */}
          {subTab === 'Do / Avoid' && (
            <>
              {/* Deadline banner */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary-soft border border-primary/30">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <p className="text-[11px] text-primary">
                  <span className="font-bold">{adPlanet} antardasha ends {adEnd}</span>
                  {adDaysLeft !== null ? ` · ${adDaysLeft} days to act on these` : ''}
                </p>
              </div>

              <div className="rounded-2xl p-4 bg-surface border border-border">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm">⚖️</span>
                  <span className="j-eyebrow">WHAT TO DO / AVOID IN {adPlanet.toUpperCase()} ANTARDASHA</span>
                </div>
                {areaInsightLoading ? (
                  <div className="space-y-2">
                    {[0,1,2,3,4,5].map(i => (
                      <div key={i} className="h-4 rounded animate-pulse bg-surface-2" style={{ width: `${70 + (i % 3) * 8}%` }} />
                    ))}
                  </div>
                ) : areaInsight ? (
                  <div className="space-y-2">
                    {areaInsight.doItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <svg className="flex-shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="11" stroke="var(--success)" strokeWidth="1.5"/>
                          <path d="M7 12l4 4 6-6" stroke="var(--success)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        <p className="text-[13px] leading-snug text-text">{item}</p>
                      </div>
                    ))}
                    <div className="h-px my-1 bg-border" />
                    {areaInsight.avoidItems.map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <svg className="flex-shrink-0 mt-0.5" width="14" height="14" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="11" stroke="var(--danger)" strokeWidth="1.5"/>
                          <path d="M8 8l8 8M16 8l-8 8" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                        <p className="text-[13px] leading-snug text-text">{item}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-text-muted">
                    Do: align {activeArea.toLowerCase()} actions with {adPlanet} energy. Avoid: impulsive decisions during transitions.
                  </p>
                )}
              </div>

              {/* Does This Feel Like You? */}
              {events.length > 0 && (
                <div>
                  <div className="flex items-center justify-center gap-2 my-4">
                    <div className="flex-1 h-px bg-border" />
                    <span className="text-xs text-accent">✦</span>
                    <span className="j-eyebrow">DOES THIS FEEL LIKE YOU?</span>
                    <span className="text-xs text-accent">✦</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <AnimatePresence mode="wait">
                    {currentEvent && (
                      <motion.div
                        key={currentEvent.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.22 }}
                        className="rounded-2xl p-4 bg-surface border border-border"
                      >
                        <p className="text-[15px] font-semibold leading-snug mb-3 text-text">
                          {currentEvent.short}
                        </p>
                        <div className="flex items-center gap-2 flex-wrap">
                          {(['agree', 'maybe', 'disagree'] as const).map(kind => {
                            const cfg = {
                              agree: { label: 'Agree', color: 'var(--success)', icon: '♡' },
                              maybe: { label: 'Maybe', color: 'var(--text-muted)', icon: '◑' },
                              disagree: { label: 'Disagree', color: 'var(--danger)', icon: '◇' },
                            }[kind];
                            const isActive = currentEvent.feedback === kind;
                            return (
                              <button key={kind} onClick={() => handleEventFeedback(currentEvent.id, kind)}
                                disabled={!!busyEventId}
                                className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-full border-none cursor-pointer transition-all bg-surface-2"
                                style={{
                                  background: isActive ? cfg.color + '18' : undefined,
                                  color: isActive ? cfg.color : 'var(--text-muted)',
                                  border: `1px solid ${isActive ? cfg.color + '55' : 'var(--border)'}`,
                                  opacity: busyEventId ? 0.5 : 1,
                                }}>
                                <span>{cfg.icon}</span>{cfg.label}
                              </button>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="flex items-center justify-center gap-1.5 mt-3">
                    {events.map((_, i) => (
                      <button key={i} onClick={() => setEventIndex(i)}
                        className="rounded-full border-none cursor-pointer p-0 transition-all"
                        style={{ width: i === eventIndex ? 16 : 6, height: 6, backgroundColor: i === eventIndex ? 'var(--primary)' : 'var(--border-strong)' }} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

function LifeJourneySkeleton() {
  return (
    <div className="min-h-screen pb-24 bg-bg">
      {/* Header skeleton */}
      <div className="px-4 py-3 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-surface-2" />
        <div className="flex-1 flex justify-center">
          <div className="h-8 w-32 rounded-full bg-surface-2" />
        </div>
        <div className="w-9 h-9 rounded-full bg-surface-2" />
      </div>
      {/* Hero skeleton */}
      <div className="px-5 pt-6 pb-2 space-y-2">
        <div className="h-8 w-3/4 rounded-lg animate-pulse bg-surface" />
        <div className="h-8 w-2/3 rounded-lg animate-pulse bg-surface" />
        <div className="h-4 w-1/2 mt-2 rounded-md animate-pulse bg-surface" />
      </div>
      {/* Phase cards skeleton */}
      <div className="px-5 pt-6 space-y-4">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex gap-3">
            <div className="w-8 h-8 rounded-full flex-shrink-0 animate-pulse bg-surface" style={{ animationDelay: `${i * 0.1}s` }} />
            <div className="flex-1 space-y-2">
              <div className="h-5 w-2/5 rounded-md animate-pulse bg-surface" style={{ animationDelay: `${i * 0.1}s` }} />
              <div className="rounded-2xl p-4 space-y-2 animate-pulse bg-surface" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="h-3 w-full rounded bg-surface-2" />
                <div className="h-3 w-4/5 rounded bg-surface-2" />
                <div className="h-3 w-3/5 rounded bg-surface-2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LifeJourneyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeChartId, activeChart, dataReady } = useActiveChart();
  const chartId = searchParams.get('chart') || activeChartId;
  const initialTab = (['present', 'future'] as const).find(t => t === searchParams.get('tab')) ?? 'past';
  const [tab, setTab] = useState<'past' | 'present' | 'future'>(initialTab);

  const { data, isLoading: loading, error: queryError } = useQuery<JourneyData>({
    queryKey: ['life-journey', chartId],
    queryFn: async () => {
      const r = await fetch(`/api/life-journey?chartId=${chartId}`);
      const res = await r.json();
      if (!res.success) throw new Error(res.error ?? 'Failed to load');
      return res.data as JourneyData;
    },
    enabled: !!chartId,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const error = queryError instanceof Error ? queryError.message : queryError ? 'Failed to load life journey' : '';

  // While the store is hydrating profiles/charts, show a skeleton instead of the empty state
  if (!dataReady) {
    return <LifeJourneySkeleton />;
  }

  if (!chartId) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 bg-bg">
        <div className="text-center max-w-xs">
          <div className="text-5xl mb-4">🌱</div>
          <h2 className="text-lg font-bold mb-2 text-text j-display">No Birth Chart Found</h2>
          <p className="text-sm mb-5 text-text-muted">Generate your Kundli to unlock your Life Journey.</p>
          <Link href="/kundli/generate"
            className="inline-block px-6 py-3 rounded-full text-sm font-bold no-underline text-white bg-primary">
            Generate Kundli →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg">
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-surface border-b border-border"
        style={{ backdropFilter: 'blur(20px)' }}
      >
        <button
          onClick={() => router.back()}
          className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full border-none cursor-pointer bg-surface-2"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
        </button>

        {/* Tab pills — centered */}
        <div className="flex-1 flex justify-center">
          <div className="flex rounded-full p-0.5 gap-0.5 bg-surface-2">
            {(['past', 'present', 'future'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className="px-4 py-1.5 rounded-full text-[12px] font-semibold border-none cursor-pointer transition-all"
                style={{
                  backgroundColor: tab === t ? 'var(--surface)' : 'transparent',
                  color: tab === t ? 'var(--text)' : 'var(--text-muted)',
                  boxShadow: tab === t ? 'var(--shadow-sm)' : undefined,
                }}
              >
                {t === 'past' ? 'Past' : t === 'present' ? 'My Life' : 'Future'}
              </button>
            ))}
          </div>
        </div>

        {/* Share button */}
        <button
          onClick={() => {
            const url = typeof window !== 'undefined' ? window.location.href : '';
            if (typeof navigator !== 'undefined' && navigator.share) {
              navigator.share({ title: 'My Life Journey', url }).catch(() => {});
            } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
              navigator.clipboard.writeText(url).catch(() => {});
            }
          }}
          aria-label="Share"
          className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer bg-surface-2"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
          </svg>
        </button>
      </div>

      {/* Hero */}
      <div className="px-5 pt-6 pb-2">
        <motion.h2
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-[24px] font-extrabold leading-tight mb-1 text-text j-display"
        >
          {tab === 'past'
            ? 'This is your past,\nexplained.'
            : tab === 'future'
              ? 'This is your future,\nforetold.'
              : 'Your cosmic\nmoment now.'}
        </motion.h2>
        <p className="text-[13px] leading-relaxed text-text-muted">
          {tab === 'past' ? (
            <>Your kundli and dasha have revealed <span className="text-primary font-semibold">important past events.</span></>
          ) : tab === 'future' ? (
            <>The Vimshottari wheel turns ahead — <span className="text-primary font-semibold">planetary periods yet to unfold.</span></>
          ) : (
            'Your current planetary period and how it shapes every area of your life.'
          )}
        </p>
      </div>

      {/* Content */}
      {loading && (
        <div className="px-4 space-y-3 py-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {error && !loading && (
        <div className="text-center py-12">
          <p className="text-sm text-danger">{error}</p>
          <button onClick={() => window.location.reload()}
            className="mt-3 text-sm border-none bg-transparent cursor-pointer text-text-muted">
            Try again
          </button>
        </div>
      )}

      {!loading && !error && data && (
        tab === 'past'
          ? <PastTab data={data} chartId={chartId} />
          : tab === 'future'
            ? <FutureTab data={data} chartId={chartId} />
            : <PresentTab data={data} activeChart={activeChart} chartId={chartId} />
      )}
    </div>
  );
}

export default function LifeJourneyPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LifeJourneyContent />
    </Suspense>
  );
}
