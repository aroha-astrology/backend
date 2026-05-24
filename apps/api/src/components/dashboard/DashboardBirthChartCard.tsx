'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { NorthIndianChart } from '@/components/charts/NorthIndianChart';
import { SouthIndianChart } from '@/components/charts/SouthIndianChart';
import { PillTabs } from '@/components/ui/tabs';
import { useStore } from '@/store/useStore';
import {
  BIRTH_CHART_TABS,
  resolveBirthChart,
  type BirthChartType,
} from '@/lib/birthChartResolver';
import type { ChartData } from '@aroha-astrology/shared';

interface Props {
  chartData: ChartData;
  divisionalCharts: Record<string, unknown> | null | undefined;
  kundliChartId: string | null;
  activeProfile: { name?: string | null; pob?: string | null } | null;
}

export function DashboardBirthChartCard({
  chartData,
  divisionalCharts,
  kundliChartId,
  activeProfile,
}: Props) {
  const [type, setType] = useState<BirthChartType>('lagna');
  const [style, setStyle] = useState<'north' | 'south'>('north');
  const reduceMotion = useStore((s) => s.reduceMotion);
  const setReduceMotion = useStore((s) => s.setReduceMotion);

  const handleTypeChange = (key: string) => {
    setType(key as BirthChartType);
  };

  const handleStyleChange = (key: 'north' | 'south') => {
    setStyle(key);
  };

  const resolved = useMemo(
    () => resolveBirthChart(type, chartData, divisionalCharts),
    [type, chartData, divisionalCharts],
  );

  return (
    <div
      className="block rounded-2xl p-5 border border-border backdrop-blur-[8px] shadow-[0_0_18px_rgba(212,175,55,0.10)] mb-4"
      style={{ background: 'var(--card-bg)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="j-display text-[15px] text-text font-semibold uppercase tracking-[0.10em] flex items-center gap-2">
          <span className="text-accent">⊙</span>
          Your Birth Chart
        </h3>
        <div className="flex items-center gap-3">
          {/* Motion toggle */}
          <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Toggle chart animations">
            <span className="text-[10px] text-text-muted">Motion</span>
            <button
              type="button"
              role="switch"
              aria-checked={!reduceMotion}
              onClick={() => setReduceMotion(!reduceMotion)}
              className={`relative h-4 w-7 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/40 ${
                !reduceMotion ? 'bg-primary' : 'bg-surface-2 border border-border'
              }`}
            >
              <span
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-md transition-all duration-200 ${
                  !reduceMotion ? 'left-[14px]' : 'left-0.5'
                }`}
              />
            </button>
          </label>
          {activeProfile?.name && (
            <span className="text-[11px] font-semibold text-accent uppercase tracking-[0.10em] truncate max-w-[120px]">
              {activeProfile.name}
            </span>
          )}
        </div>
      </div>

      {/* Chart-type tabs */}
      <PillTabs
        layoutId="birthChartType"
        tabs={BIRTH_CHART_TABS.map((t) => ({ key: t.key, label: t.label }))}
        active={type}
        onChange={handleTypeChange}
      />

      {/* Style tabs (North / South) */}
      <div className="mt-2 flex justify-center">
        <div
          role="tablist"
          aria-label="Chart style"
          className="inline-flex items-center rounded-full p-0.5 border border-border"
          style={{ background: 'var(--surface-2)' }}
        >
          {(['north', 'south'] as const).map((s) => {
            const isActive = style === s;
            return (
              <button
                key={s}
                role="tab"
                aria-selected={isActive}
                onClick={() => handleStyleChange(s)}
                className="relative px-3 py-1 text-[11px] font-medium rounded-full cursor-pointer select-none transition-colors"
                style={{
                  color: isActive ? '#11131A' : 'var(--text-muted)',
                }}
              >
                {isActive && (
                  <motion.span
                    layoutId="birthChartStyle"
                    className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,#D4AF37,#B8893F)] shadow-[0_0_10px_rgba(212,175,55,0.40)]"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{s === 'north' ? 'North' : 'South'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Chart canvas */}
      <div className="flex justify-center mt-3 min-h-[280px]">
        <AnimatePresence mode="wait" initial={false}>
          {resolved.ready && resolved.data ? (
            <motion.div
              key={`${type}-${style}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full flex justify-center"
            >
              {style === 'north' ? (
                <NorthIndianChart
                  chartData={resolved.data}
                  ascendantHouse={resolved.ascHouse}
                  title={resolved.title}
                />
              ) : (
                <SouthIndianChart
                  chartData={resolved.data}
                  ascendantHouse={resolved.ascHouse}
                  title={resolved.title}
                />
              )}
            </motion.div>
          ) : (
            <ChartSkeleton key={`skel-${type}`} title={resolved.title} />
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="mt-4 flex items-center justify-between text-[12px]">
        {activeProfile?.pob ? (
          <span className="inline-flex items-center gap-1.5 text-text-muted truncate max-w-[60%]">
            <span className="text-accent">📍</span>
            {activeProfile.pob}
          </span>
        ) : <span />}
        {kundliChartId ? (
          <Link href={`/kundli/${kundliChartId}`} className="font-semibold text-accent no-underline">
            Explore Full Chart →
          </Link>
        ) : <span />}
      </div>
    </div>
  );
}

function ChartSkeleton({ title }: { title: string }) {
  return (
    <div className="w-full max-w-[400px] aspect-square relative overflow-hidden rounded-2xl border border-border bg-surface-2">
      <motion.div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(212, 175, 55, 0.10) 50%, transparent 100%)',
        }}
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-text-muted">
        <span className="text-[10px] uppercase tracking-[0.18em] text-accent/80">{title}</span>
        <div className="flex items-center gap-2 text-[11px]">
          <motion.span
            className="w-1.5 h-1.5 rounded-full bg-primary"
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
          />
          Drawing chart…
        </div>
      </div>
    </div>
  );
}
