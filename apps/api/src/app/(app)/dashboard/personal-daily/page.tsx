'use client';

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { usePersonalDailyQuery } from '@/hooks/queries/usePersonalDailyQuery';
import { useActiveChart } from '@/hooks/useActiveChart';

function DawnGlow() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-[45vh]"
      style={{
        background:
          'radial-gradient(ellipse 90% 100% at 50% 0%, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.05) 40%, transparent 75%)',
      }}
    />
  );
}

function TwinkleStars() {
  const stars = [
    { top: 6,  left: 12, delay: 0.0, duration: 4.2, size: 2 },
    { top: 14, left: 78, delay: 1.4, duration: 3.6, size: 1 },
    { top: 22, left: 44, delay: 2.8, duration: 5.0, size: 2 },
    { top: 8,  left: 64, delay: 4.0, duration: 4.4, size: 1 },
    { top: 30, left: 22, delay: 0.6, duration: 3.8, size: 2 },
    { top: 18, left: 90, delay: 3.2, duration: 4.6, size: 1 },
    { top: 38, left: 56, delay: 1.0, duration: 5.2, size: 1 },
    { top: 10, left: 30, delay: 2.4, duration: 3.4, size: 2 },
    { top: 46, left: 74, delay: 5.0, duration: 4.0, size: 1 },
    { top: 28, left: 6,  delay: 3.6, duration: 4.8, size: 2 },
    { top: 36, left: 38, delay: 0.2, duration: 5.4, size: 1 },
    { top: 52, left: 86, delay: 4.4, duration: 3.6, size: 1 },
    { top: 60, left: 18, delay: 2.0, duration: 4.4, size: 2 },
    { top: 56, left: 50, delay: 5.6, duration: 3.8, size: 1 },
    { top: 64, left: 68, delay: 1.6, duration: 5.0, size: 1 },
    { top: 72, left: 28, delay: 4.8, duration: 4.2, size: 2 },
    { top: 78, left: 82, delay: 2.6, duration: 3.6, size: 1 },
    { top: 86, left: 14, delay: 3.0, duration: 4.6, size: 1 },
    { top: 82, left: 56, delay: 0.4, duration: 5.2, size: 2 },
    { top: 90, left: 72, delay: 5.4, duration: 4.0, size: 1 },
  ];

  return (
    <div className="pd-stars pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {stars.map((s, i) => (
        <span
          key={i}
          style={{
            position: 'absolute',
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            borderRadius: '50%',
            background: 'rgba(255,255,255,0.9)',
            boxShadow: '0 0 4px rgba(255,255,255,0.55)',
            animation: `pd-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
            opacity: 0.2,
          }}
        />
      ))}
      <style>{`
        @keyframes pd-twinkle {
          0%, 100% { opacity: 0.15; transform: scale(0.85); }
          50%      { opacity: 0.85; transform: scale(1.1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pd-stars span { animation: none !important; opacity: 0.4 !important; }
        }
      `}</style>
    </div>
  );
}

export default function PersonalDailyPage() {
  const { activeChartId } = useActiveChart();
  const { data: reading, isLoading } = usePersonalDailyQuery(activeChartId, undefined);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="relative isolate min-h-screen bg-bg">
      <DawnGlow />
      <TwinkleStars />
      <div className="px-4 py-6 max-w-lg mx-auto">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 mb-6 no-underline text-text-muted">
        <ArrowLeft size={16} />
        <span className="text-sm">Back</span>
      </Link>

      <div className="mb-6">

        <p className="text-text text-xl font-bold leading-tight mb-1">Your Personal Daily Reading</p>
        <p className="text-[11px] text-text-muted">{today}</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[80, 120, 200, 60].map((h, i) => (
            <div key={i} className="rounded-2xl bg-surface-2 animate-pulse" style={{ height: h }} />
          ))}
        </div>
      ) : reading ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-4"
        >
          {reading.headline && (
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
              <p className="text-[11px] font-semibold text-warning mb-2">✦ {reading.headline}</p>
              <p className="text-text text-base leading-relaxed">{reading.general}</p>
            </div>
          )}

          {((reading.positive_points && reading.positive_points.length > 0) ||
            (reading.issues && reading.issues.length > 0)) && (
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm space-y-2">
              {reading.positive_points?.map((pt, i) => (
                <div key={`p-${i}`} className="flex items-start gap-2">
                  <span className="text-green-500 text-sm mt-0.5 flex-shrink-0">✦</span>
                  <p className="text-text text-sm leading-relaxed">{pt}</p>
                </div>
              ))}
              {reading.issues?.map((issue, i) => (
                <div key={`i-${i}`} className="flex items-start gap-2">
                  <span className="text-amber-500 text-sm mt-0.5 flex-shrink-0">⚠</span>
                  <p className="text-text-muted text-sm leading-relaxed">{issue}</p>
                </div>
              ))}
            </div>
          )}

          {(['career', 'love', 'health'] as const).map(area => {
            const config = {
              career: { icon: '💼', label: 'CAREER' },
              love:   { icon: '❤️',  label: 'LOVE'   },
              health: { icon: '🛡️',  label: 'HEALTH' },
            };
            const text = reading[area];
            if (!text) return null;
            const { icon, label } = config[area];
            return (
              <div key={area} className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
                <div className="text-center mb-3">
                  <p className="j-eyebrow">{label}</p>
                  <p className="text-2xl mt-1 leading-none">{icon}</p>
                </div>
                <p className="text-text text-sm leading-relaxed text-center">{text}</p>
              </div>
            );
          })}

          <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
            <p className="j-eyebrow mb-3">Today's Lucky Picks</p>
            <div className="grid grid-cols-3 gap-3">
              {reading.luckyColor && (
                <div className="text-center">
                  <p className="text-2xl mb-1">🎨</p>
                  <p className="j-eyebrow mb-0.5">Color</p>
                  <p className="text-xs font-semibold text-text">{reading.luckyColor}</p>
                </div>
              )}
              {reading.luckyNumber !== undefined && (
                <div className="text-center">
                  <p className="text-2xl mb-1">🔢</p>
                  <p className="j-eyebrow mb-0.5">Number</p>
                  <p className="text-xs font-semibold text-text">{reading.luckyNumber}</p>
                </div>
              )}
              {reading.luckyDirection && (
                <div className="text-center">
                  <p className="text-2xl mb-1">🧭</p>
                  <p className="j-eyebrow mb-0.5">Direction</p>
                  <p className="text-xs font-semibold text-text">{reading.luckyDirection}</p>
                </div>
              )}
            </div>
          </div>

          {reading.remedy && (
            <div className="bg-surface border border-border rounded-2xl p-4 shadow-sm">
              <p className="text-[11px] font-semibold text-warning mb-2">🪷 Today's Remedy</p>
              <p className="text-text text-sm leading-relaxed">{reading.remedy}</p>
              {reading.remedy_mantra && (
                <p className="mt-2 text-[13px] italic text-warning font-medium leading-relaxed">{reading.remedy_mantra}</p>
              )}
            </div>
          )}
        </motion.div>
      ) : (
        <div className="text-center py-16">
          <p className="text-sm text-text-muted">Your personal reading is not available yet.</p>
          <p className="text-xs text-text-muted mt-1">Generate your birth chart to unlock daily readings.</p>
        </div>
      )}
      </div>
    </div>
  );
}
