'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem } from '@/components/ui/motion-primitives';
import { cardHover } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loading } from '@/components/ui/loading';
import { Modal } from '@/components/ui/modal';
import { useStore } from '@/store/useStore';
import { useActiveChart } from '@/hooks/useActiveChart';
import { useHoroscopeQuery, useMonthlyHoroscopeQuery } from '@/hooks/queries/useHoroscopeQuery';

/* -------------------------------------------------------------------------- */
/*  Types & Constants                                                         */
/* -------------------------------------------------------------------------- */

interface RashiInfo {
  id: string;
  name: string;
  english: string;
  emoji: string;
  dateRange: string;
}

const RASHIS: RashiInfo[] = [
  { id: 'mesha', name: 'Mesha', english: 'Aries', emoji: '&#9800;', dateRange: 'Mar 21 - Apr 19' },
  { id: 'vrishabha', name: 'Vrishabha', english: 'Taurus', emoji: '&#9801;', dateRange: 'Apr 20 - May 20' },
  { id: 'mithuna', name: 'Mithuna', english: 'Gemini', emoji: '&#9802;', dateRange: 'May 21 - Jun 20' },
  { id: 'karka', name: 'Karka', english: 'Cancer', emoji: '&#9803;', dateRange: 'Jun 21 - Jul 22' },
  { id: 'simha', name: 'Simha', english: 'Leo', emoji: '&#9804;', dateRange: 'Jul 23 - Aug 22' },
  { id: 'kanya', name: 'Kanya', english: 'Virgo', emoji: '&#9805;', dateRange: 'Aug 23 - Sep 22' },
  { id: 'tula', name: 'Tula', english: 'Libra', emoji: '&#9806;', dateRange: 'Sep 23 - Oct 22' },
  { id: 'vrischika', name: 'Vrischika', english: 'Scorpio', emoji: '&#9807;', dateRange: 'Oct 23 - Nov 21' },
  { id: 'dhanu', name: 'Dhanu', english: 'Sagittarius', emoji: '&#9808;', dateRange: 'Nov 22 - Dec 21' },
  { id: 'makara', name: 'Makara', english: 'Capricorn', emoji: '&#9809;', dateRange: 'Dec 22 - Jan 19' },
  { id: 'kumbha', name: 'Kumbha', english: 'Aquarius', emoji: '&#9810;', dateRange: 'Jan 20 - Feb 18' },
  { id: 'meena', name: 'Meena', english: 'Pisces', emoji: '&#9811;', dateRange: 'Feb 19 - Mar 20' },
];

interface DailyPrediction {
  general: string;
  career: string;
  love: string;
  health: string;
  luckyColor: string;
  luckyNumber: number;
  luckyDirection: string;
}

interface MonthlyPrediction {
  theme: string;
  week1: string;
  week2: string;
  week3: string;
  week4: string;
  career: number;
  love: number;
  health: number;
  finance: number;
  family: number;
}

type TabKey = 'general' | 'career' | 'love' | 'health';

const TAB_ICONS: Record<TabKey, string> = {
  general: '✦',
  career: '💼',
  love: '♥',
  health: '☯',
};

/* -------------------------------------------------------------------------- */
/*  Rating Bar                                                                */
/* -------------------------------------------------------------------------- */

function RatingBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-text-secondary w-14 capitalize">{label}</span>
      <div className="flex gap-0.5 flex-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-1.5 flex-1 rounded-full transition-all"
            style={{
              background: i < value
                ? 'linear-gradient(90deg, var(--primary), #b08050)'
                : 'rgba(0,0,0,0.08)',
            }}
          />
        ))}
      </div>
      <span className="text-[10px] text-text-secondary w-4 text-right">{value}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rashi Card (Daily)                                                        */
/* -------------------------------------------------------------------------- */

function RashiCard({
  rashi,
  prediction,
  isPersonalized,
  onClick,
}: {
  rashi: RashiInfo;
  prediction: DailyPrediction | null;
  isPersonalized?: boolean;
  onClick?: () => void;
}) {
  const [tab, setTab] = useState<TabKey>('general');
  const [speaking, setSpeaking] = useState(false);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'career', label: 'Career' },
    { key: 'love', label: 'Love' },
    { key: 'health', label: 'Health' },
  ];

  function readAloud() {
    if (!prediction) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const text = `${rashi.name}, ${rashi.english}. ${prediction[tab]}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <motion.div {...cardHover} className="h-full" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div
        className={`rounded-2xl p-4 h-full relative overflow-hidden transition-all duration-300 ${isPersonalized ? 'glass-3' : 'glass-1'}`}
        style={{
          border: isPersonalized ? '1px solid rgba(212, 175, 55,0.40)' : '1px solid rgba(212, 175, 55,0.12)',
          boxShadow: isPersonalized ? '0 0 40px rgba(212, 175, 55,0.10)' : 'none',
        }}
      >
        {isPersonalized && (
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />
        )}
        {isPersonalized && (
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(212, 175, 55,0.07) 0%, transparent 60%)',
          }} />
        )}

        <div className="relative">
          <div className="flex items-start gap-2.5 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{
                background: isPersonalized ? 'rgba(212, 175, 55,0.12)' : 'rgba(0,0,0,0.04)',
                border: isPersonalized ? '1px solid rgba(212, 175, 55,0.30)' : '1px solid rgba(0,0,0,0.10)',
              }}
            >
              <span dangerouslySetInnerHTML={{ __html: rashi.emoji }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <p className="text-sm font-bold text-text font-[family-name:var(--font-serif)] leading-tight">
                  {rashi.name}
                </p>
                <span className="text-xs font-normal text-text-secondary">({rashi.english})</span>
                {isPersonalized && (
                  <Badge variant="gold" size="xs" className="ml-auto flex-shrink-0">Your Sign</Badge>
                )}
              </div>
              <p className="text-[10px] text-text-secondary mt-0.5">{rashi.dateRange}</p>
            </div>
          </div>

          {prediction ? (
            <>
              <div
                className="flex gap-0.5 rounded-xl p-0.5 mb-3"
                style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }}
              >
                {tabs.map((t) => (
                  <motion.button
                    key={t.key}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setTab(t.key); }}
                    whileTap={{ scale: 0.95 }}
                    className="flex-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold transition-all cursor-pointer border-none"
                    style={{
                      background: tab === t.key ? 'rgba(212, 175, 55,0.15)' : 'transparent',
                      color: tab === t.key ? 'var(--primary)' : 'var(--text-secondary)',
                      border: tab === t.key ? '1px solid rgba(212, 175, 55,0.30)' : '1px solid transparent',
                    }}
                  >
                    <span className="mr-0.5">{TAB_ICONS[t.key]}</span>
                    {t.label}
                  </motion.button>
                ))}
              </div>

              <AnimatePresence mode="wait">
                <motion.p
                  key={tab}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.2 }}
                  className="mb-3 min-h-[52px] text-[12px] leading-relaxed text-text-secondary"
                >
                  {prediction[tab]}
                </motion.p>
              </AnimatePresence>

              <div className="flex flex-wrap gap-1.5 mb-3">
                <div
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{ background: 'rgba(212, 175, 55,0.10)', border: '1px solid rgba(212, 175, 55,0.22)', color: 'var(--text)' }}
                >
                  🎨 Color: {prediction.luckyColor}
                </div>
                <div
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{ background: 'rgba(168,127,255,0.10)', border: '1px solid rgba(168,127,255,0.22)', color: '#a87fff' }}
                >
                  🔢 Number: {prediction.luckyNumber}
                </div>
                <div
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold"
                  style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.20)', color: '#10b981' }}
                >
                  🧭 {prediction.luckyDirection}
                </div>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); readAloud(); }}
                className="w-full text-[11px]"
              >
                {speaking ? (
                  <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                    ⏹ Stop Reading
                  </motion.span>
                ) : '🔊 Read Aloud'}
              </Button>
            </>
          ) : (
            <Loading size="sm" className="py-4" />
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Monthly Rashi Card                                                        */
/* -------------------------------------------------------------------------- */

function MonthlyRashiCard({
  rashi,
  prediction,
  isPersonalized,
  onClick,
}: {
  rashi: RashiInfo;
  prediction: MonthlyPrediction | null;
  isPersonalized?: boolean;
  onClick?: () => void;
}) {
  return (
    <motion.div {...cardHover} className="h-full" onClick={onClick} style={{ cursor: onClick ? 'pointer' : 'default' }}>
      <div
        className={`rounded-2xl p-4 h-full relative overflow-hidden transition-all duration-300 ${isPersonalized ? 'glass-3' : 'glass-1'}`}
        style={{
          border: isPersonalized ? '1px solid rgba(212, 175, 55,0.40)' : '1px solid rgba(212, 175, 55,0.12)',
          boxShadow: isPersonalized ? '0 0 40px rgba(212, 175, 55,0.10)' : 'none',
        }}
      >
        {isPersonalized && (
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />
        )}
        {isPersonalized && (
          <div className="absolute inset-0 pointer-events-none" style={{
            background: 'radial-gradient(ellipse at 50% 0%, rgba(212, 175, 55,0.07) 0%, transparent 60%)',
          }} />
        )}

        <div className="relative">
          <div className="flex items-start gap-2.5 mb-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
              style={{
                background: isPersonalized ? 'rgba(212, 175, 55,0.12)' : 'rgba(0,0,0,0.04)',
                border: isPersonalized ? '1px solid rgba(212, 175, 55,0.30)' : '1px solid rgba(0,0,0,0.10)',
              }}
            >
              <span dangerouslySetInnerHTML={{ __html: rashi.emoji }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <p className="text-sm font-bold text-text font-[family-name:var(--font-serif)] leading-tight">
                  {rashi.name}
                </p>
                <span className="text-xs font-normal text-text-secondary">({rashi.english})</span>
                {isPersonalized && (
                  <Badge variant="gold" size="xs" className="ml-auto flex-shrink-0">Your Sign</Badge>
                )}
              </div>
              <p className="text-[10px] text-text-secondary mt-0.5">{rashi.dateRange}</p>
            </div>
          </div>

          {prediction ? (
            <>
              {/* Theme */}
              <p className="text-[12px] leading-relaxed text-text-secondary mb-3 line-clamp-2">
                {prediction.theme}
              </p>

              {/* Rating bars */}
              <div
                className="rounded-xl p-2.5 mb-2 space-y-1.5"
                style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}
              >
                <RatingBar label="Career" value={prediction.career} />
                <RatingBar label="Love" value={prediction.love} />
                <RatingBar label="Health" value={prediction.health} />
                <RatingBar label="Finance" value={prediction.finance} />
                <RatingBar label="Family" value={prediction.family} />
              </div>

              <p className="text-[10px] text-text-secondary/60 text-center">Tap for weekly breakdown</p>
            </>
          ) : (
            <Loading size="sm" className="py-4" />
          )}
        </div>
      </div>
    </motion.div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Rashi Modal (Daily)                                                       */
/* -------------------------------------------------------------------------- */

function RashiModal({
  rashi,
  prediction,
  isPersonalized,
  onClose,
}: {
  rashi: RashiInfo;
  prediction: DailyPrediction | null;
  isPersonalized?: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabKey>('general');
  const [speaking, setSpeaking] = useState(false);

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'general', label: 'General' },
    { key: 'career', label: 'Career' },
    { key: 'love', label: 'Love' },
    { key: 'health', label: 'Health' },
  ];

  function readAloud() {
    if (!prediction) return;
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(`${rashi.name}, ${rashi.english}. ${prediction[tab]}`);
    utterance.lang = 'en-IN';
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <Modal isOpen onClose={onClose} className="max-w-xl">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
            style={{
              background: isPersonalized ? 'rgba(212, 175, 55,0.12)' : 'rgba(0,0,0,0.04)',
              border: isPersonalized ? '1px solid rgba(212, 175, 55,0.30)' : '1px solid var(--border)',
            }}
          >
            <span dangerouslySetInnerHTML={{ __html: rashi.emoji }} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-text font-[family-name:var(--font-serif)]">
                {rashi.name}
                <span className="text-sm font-normal text-text-secondary ml-2">({rashi.english})</span>
              </h2>
              {isPersonalized && <Badge variant="gold" size="xs">Your Sign</Badge>}
            </div>
            <p className="text-[11px] text-text-secondary mt-0.5">☽ Moon Sign · {rashi.dateRange}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-text-secondary hover:text-text transition-colors flex-shrink-0 ml-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {prediction ? (
        <>
          <div
            className="flex gap-0.5 rounded-xl p-0.5 mb-4"
            style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)' }}
          >
            {tabs.map((t) => (
              <motion.button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                whileTap={{ scale: 0.95 }}
                className="flex-1 rounded-lg px-2 py-2 text-[11px] font-semibold transition-all cursor-pointer border-none"
                style={{
                  background: tab === t.key ? 'rgba(212, 175, 55,0.15)' : 'transparent',
                  color: tab === t.key ? 'var(--primary)' : 'var(--text-secondary)',
                  border: tab === t.key ? '1px solid rgba(212, 175, 55,0.30)' : '1px solid transparent',
                }}
              >
                <span className="mr-1">{TAB_ICONS[t.key]}</span>
                {t.label}
              </motion.button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.p
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="text-sm leading-relaxed text-text-secondary mb-5 min-h-[80px]"
            >
              {prediction[tab]}
            </motion.p>
          </AnimatePresence>

          <div
            className="flex flex-wrap gap-2 mb-5 rounded-xl p-3"
            style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}
          >
            <span className="text-[10px] text-text-secondary w-full mb-1 font-semibold tracking-wider uppercase">Lucky for Today</span>
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
              style={{ background: 'rgba(212, 175, 55,0.10)', border: '1px solid rgba(212, 175, 55,0.22)', color: 'var(--text)' }}
            >
              🎨 {prediction.luckyColor}
            </div>
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
              style={{ background: 'rgba(168,127,255,0.10)', border: '1px solid rgba(168,127,255,0.22)', color: '#a87fff' }}
            >
              🔢 {prediction.luckyNumber}
            </div>
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold"
              style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.20)', color: '#10b981' }}
            >
              🧭 {prediction.luckyDirection}
            </div>
          </div>

          <Button variant="ghost" size="sm" onClick={readAloud} className="w-full text-[12px]">
            {speaking ? (
              <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                ⏹ Stop Reading
              </motion.span>
            ) : '🔊 Read Aloud'}
          </Button>
        </>
      ) : (
        <Loading size="sm" className="py-8" />
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Monthly Rashi Modal                                                       */
/* -------------------------------------------------------------------------- */

function MonthlyRashiModal({
  rashi,
  prediction,
  isPersonalized,
  monthLabel,
  onClose,
}: {
  rashi: RashiInfo;
  prediction: MonthlyPrediction | null;
  isPersonalized?: boolean;
  monthLabel: string;
  onClose: () => void;
}) {
  return (
    <Modal isOpen onClose={onClose} className="max-w-xl">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
            style={{
              background: isPersonalized ? 'rgba(212, 175, 55,0.12)' : 'rgba(0,0,0,0.04)',
              border: isPersonalized ? '1px solid rgba(212, 175, 55,0.30)' : '1px solid var(--border)',
            }}
          >
            <span dangerouslySetInnerHTML={{ __html: rashi.emoji }} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-text font-[family-name:var(--font-serif)]">
                {rashi.name}
                <span className="text-sm font-normal text-text-secondary ml-2">({rashi.english})</span>
              </h2>
              {isPersonalized && <Badge variant="gold" size="xs">Your Sign</Badge>}
            </div>
            <p className="text-[11px] text-text-secondary mt-0.5">☽ Monthly Forecast · {monthLabel}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1.5 text-text-secondary hover:text-text transition-colors flex-shrink-0 ml-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {prediction ? (
        <>
          {/* Theme */}
          <div
            className="rounded-xl p-3 mb-4"
            style={{ background: 'rgba(212, 175, 55,0.06)', border: '1px solid rgba(212, 175, 55,0.18)' }}
          >
            <p className="text-[11px] font-semibold text-primary/80 uppercase tracking-wider mb-1">Monthly Theme</p>
            <p className="text-sm leading-relaxed text-text-secondary">{prediction.theme}</p>
          </div>

          {/* Weekly breakdown */}
          <div className="space-y-3 mb-5">
            {(['week1', 'week2', 'week3', 'week4'] as const).map((week, i) => (
              <div
                key={week}
                className="rounded-xl p-3"
                style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}
              >
                <p className="text-[10px] font-semibold text-primary/70 uppercase tracking-wider mb-1">Week {i + 1}</p>
                <p className="text-[12px] leading-relaxed text-text-secondary">{prediction[week]}</p>
              </div>
            ))}
          </div>

          {/* Rating bars */}
          <div
            className="rounded-xl p-3 space-y-2"
            style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.07)' }}
          >
            <p className="text-[10px] font-semibold text-text-secondary/60 uppercase tracking-wider mb-2">Monthly Outlook</p>
            <RatingBar label="Career" value={prediction.career} />
            <RatingBar label="Love" value={prediction.love} />
            <RatingBar label="Health" value={prediction.health} />
            <RatingBar label="Finance" value={prediction.finance} />
            <RatingBar label="Family" value={prediction.family} />
          </div>
        </>
      ) : (
        <Loading size="sm" className="py-8" />
      )}
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Page                                                                 */
/* -------------------------------------------------------------------------- */

function toDateString(d: Date): string {
  // Use local date parts — toISOString() is UTC and gives yesterday's date for IST users at midnight
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getISTNow(): Date {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000);
}

function formatDisplayDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function DailyHoroscopePage() {
  const router = useRouter();

  // Daily state
  const [selectedRashi, setSelectedRashi] = useState<string | null>(null);
  const [modalRashi, setModalRashi] = useState<RashiInfo | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  // Monthly state
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [selectedMonthlyRashi, setSelectedMonthlyRashi] = useState<string | null>(null);
  const [monthlyModalRashi, setMonthlyModalRashi] = useState<RashiInfo | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<'this' | 'next'>('this');

  // Refs for tracking visible cards via Intersection Observer
  const rashiRefsDaily = useRef<Record<string, HTMLDivElement | null>>({});
  const rashiRefsMonthly = useRef<Record<string, HTMLDivElement | null>>({});

  // Once the user scrolls or taps a card, the observer is allowed to drive
  // the selection. Until then, the user's moon sign stays selected even if
  // it loads asynchronously after the observer first fires.
  const hasInteractedDailyRef = useRef(false);
  const hasInteractedMonthlyRef = useRef(false);

  const todayStr = toDateString(new Date());
  const selectedStr = toDateString(selectedDate);

  const { activeChart, activeChartId } = useActiveChart();

  const userMoonSign: string | null = (() => {
    if (!activeChart) return null;
    const chartData = activeChart.chart_data as Record<string, unknown> | undefined;
    const planets = chartData?.planets as Array<{ name: string; sign: string }> | undefined;
    if (!planets) return null;
    const moon = planets.find((p) => p.name === 'Moon');
    return moon?.sign ? moon.sign.toLowerCase() : null;
  })();

  const firstChartId = activeChartId ?? undefined;

  // Monthly year/month helpers
  const getMonthParams = useCallback((which: 'this' | 'next') => {
    const now = getISTNow();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    if (which === 'this') return { year: currentYear, month: currentMonth };
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    return { year: nextYear, month: nextMonth };
  }, []);

  const getMonthLabel = useCallback((which: 'this' | 'next') => {
    const { year, month } = getMonthParams(which);
    return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  }, [getMonthParams]);

  // Cached queries — no refetch on page re-visit if data is still fresh
  const dailyQuery = useHoroscopeQuery(selectedStr !== todayStr ? selectedStr : undefined);
  const predictions = (dailyQuery.data?.data ?? {}) as Record<string, DailyPrediction>;
  // Keep the loading state up while the server is still composing today's reading,
  // so users never see an empty list (and never see yesterday's data presented as today's).
  const loading = dailyQuery.isLoading || (dailyQuery.data?.pending ?? false);
  const error = dailyQuery.isError ? (dailyQuery.error instanceof Error ? dailyQuery.error.message : 'Something went wrong') : '';

  const { year: mYear, month: mMonth } = getMonthParams(selectedMonth);
  const monthlyQuery = useMonthlyHoroscopeQuery(mYear, mMonth, viewMode === 'monthly');
  const monthlyPredictions = (monthlyQuery.data ?? {}) as Record<string, MonthlyPrediction>;
  const monthlyLoading = monthlyQuery.isLoading;
  const monthlyError = monthlyQuery.isError ? (monthlyQuery.error instanceof Error ? monthlyQuery.error.message : 'Something went wrong') : '';

  // Default the selection to the user's moon sign as soon as the chart
  // resolves — and keep applying it on view-mode switch — unless the user
  // has already interacted with that view.
  useEffect(() => {
    if (!userMoonSign) return;
    if (!hasInteractedDailyRef.current) setSelectedRashi(userMoonSign);
    if (!hasInteractedMonthlyRef.current) setSelectedMonthlyRashi(userMoonSign);
  }, [userMoonSign]);

  // Flip the interaction flag the first time the user actually scrolls.
  useEffect(() => {
    const onScroll = () => {
      if (viewMode === 'daily') hasInteractedDailyRef.current = true;
      else hasInteractedMonthlyRef.current = true;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [viewMode]);

  // Track which rashi card is most visible (daily view) — only after
  // the user has actually scrolled, so the initial mount can't clobber
  // the moon-sign default.
  useEffect(() => {
    if (viewMode !== 'daily') return;
    const observer = new IntersectionObserver((entries) => {
      if (!hasInteractedDailyRef.current) return;
      let mostVisibleRashi: string | null = null;
      let maxVisibility = 0;

      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio > maxVisibility) {
          maxVisibility = entry.intersectionRatio;
          const rashiId = entry.target.getAttribute('data-rashi-id');
          if (rashiId) mostVisibleRashi = rashiId;
        }
      });

      if (mostVisibleRashi) {
        setSelectedRashi(mostVisibleRashi);
      }
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });

    // Observe all daily rashi cards
    Object.values(rashiRefsDaily.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [viewMode]);

  // Track which rashi card is most visible (monthly view)
  useEffect(() => {
    if (viewMode !== 'monthly') return;
    const observer = new IntersectionObserver((entries) => {
      if (!hasInteractedMonthlyRef.current) return;
      let mostVisibleRashi: string | null = null;
      let maxVisibility = 0;

      entries.forEach((entry) => {
        if (entry.isIntersecting && entry.intersectionRatio > maxVisibility) {
          maxVisibility = entry.intersectionRatio;
          const rashiId = entry.target.getAttribute('data-rashi-id');
          if (rashiId) mostVisibleRashi = rashiId;
        }
      });

      if (mostVisibleRashi) {
        setSelectedMonthlyRashi(mostVisibleRashi);
      }
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] });

    // Observe all monthly rashi cards
    Object.values(rashiRefsMonthly.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [viewMode]);

  function changeDay(delta: number) {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + delta);
      return next;
    });
  }

  const monthLabel = getMonthLabel(selectedMonth);

  return (
    <MotionPage className="mx-auto max-w-7xl px-4 py-6 min-h-screen">

      {/* ── Disclaimer Banner ── */}
      {/* <FadeIn>
        <div
          className="mb-5 rounded-2xl p-4 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(212, 175, 55,0.08) 0%, rgba(168,127,255,0.06) 100%)',
            border: '1px solid rgba(212, 175, 55,0.22)',
          }}
        >
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-60" />
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">☽</span>
                <p className="text-xs font-bold text-primary tracking-wide">Generalized Moon Sign Prediction</p>
              </div>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                These horoscopes are based on your Moon sign (Rashi) and are generalized for all people of that sign.
                For an accurate, personalized analysis based on your exact birth details, check your Kundli.
              </p>
            </div>
            <div className="flex gap-2 flex-shrink-0 flex-wrap">
              {firstChartId ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/kundli/${firstChartId}`)}
                  className="text-[11px] border-primary/40 text-primary hover:bg-primary/10"
                >
                  View Kundli
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="outline"
                onClick={() => router.push('/kundli/generate')}
                className="text-[11px] border-primary/40 text-primary hover:bg-primary/10"
              >
                {firstChartId ? 'New Kundli' : 'Generate Kundli'}
              </Button>
            </div>
          </div>
        </div>
      </FadeIn> */}

      {/* ── Header ── */}
      <FadeIn>
        <div className="mb-5">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Vedic Astrology</p>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">
            {viewMode === 'daily' ? 'Daily Horoscope' : 'Monthly Horoscope'}
          </h1>
          <p className="text-[10px] text-text-secondary mt-0.5">☽ Based on Moon Sign (Rashi) · Not Sun Sign or Lagna</p>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 mt-3">
            {(['daily', 'monthly'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className="rounded-full px-4 py-1.5 text-[11px] font-semibold capitalize transition-all cursor-pointer border-none"
                style={{
                  background: viewMode === mode ? 'rgba(212, 175, 55,0.18)' : 'rgba(0,0,0,0.04)',
                  border: `1px solid ${viewMode === mode ? 'rgba(212, 175, 55,0.55)' : 'rgba(0,0,0,0.12)'}`,
                  color: viewMode === mode ? '#92610a' : 'var(--text-secondary)',
                }}
              >
                {mode === 'daily' ? '☀ Daily' : '🌙 Monthly'}
              </button>
            ))}
          </div>

          {/* Date / Month Tabs */}
          <div className="flex items-center gap-2 mt-2">
            {viewMode === 'daily' ? (
              (['yesterday', 'today', 'tomorrow'] as const).map((day) => {
                const d = new Date(); d.setHours(0, 0, 0, 0);
                if (day === 'yesterday') d.setDate(d.getDate() - 1);
                if (day === 'tomorrow') d.setDate(d.getDate() + 1);
                const isActive = toDateString(d) === selectedStr;
                return (
                  <button
                    key={day}
                    onClick={() => setSelectedDate(d)}
                    className="rounded-full px-4 py-1 text-[11px] font-semibold capitalize transition-all cursor-pointer border-none"
                    style={{
                      background: isActive ? 'rgba(212, 175, 55,0.18)' : 'rgba(0,0,0,0.04)',
                      border: `1px solid ${isActive ? 'rgba(212, 175, 55,0.50)' : 'rgba(0,0,0,0.12)'}`,
                      color: isActive ? '#92610a' : 'var(--text-secondary)',
                    }}
                  >
                    {day}
                  </button>
                );
              })
            ) : (
              (['this', 'next'] as const).map((which) => {
                const isActive = selectedMonth === which;
                return (
                  <button
                    key={which}
                    onClick={() => setSelectedMonth(which)}
                    className="rounded-full px-4 py-1 text-[11px] font-semibold transition-all cursor-pointer border-none"
                    style={{
                      background: isActive ? 'rgba(212, 175, 55,0.18)' : 'rgba(0,0,0,0.04)',
                      border: `1px solid ${isActive ? 'rgba(212, 175, 55,0.50)' : 'rgba(0,0,0,0.12)'}`,
                      color: isActive ? '#92610a' : 'var(--text-secondary)',
                    }}
                  >
                    {which === 'this' ? `This Month` : `Next Month`}
                  </button>
                );
              })
            )}
          </div>

          {/* Subtitle for monthly */}
          {viewMode === 'monthly' && (
            <p className="text-[10px] text-text-secondary mt-1">{monthLabel}</p>
          )}
        </div>
      </FadeIn>

      {/* ── Error ── */}
      {(viewMode === 'daily' ? error : monthlyError) && (
        <FadeIn>
          <div className="mb-4 rounded-2xl glass-1 p-4 border border-error/30 text-sm text-error text-center">
            {viewMode === 'daily' ? error : monthlyError}
            <Button
              variant="ghost" size="sm"
              onClick={() => viewMode === 'daily' ? dailyQuery.refetch() : monthlyQuery.refetch()}
              className="mt-2 ml-2"
            >
              Retry
            </Button>
          </div>
        </FadeIn>
      )}

      {(viewMode === 'daily' ? loading : monthlyLoading) && (
        <div className="py-16">
          <Loading size="lg" section="horoscope" />
        </div>
      )}

      {/* ── Modals ── */}
      {modalRashi && viewMode === 'daily' && (
        <RashiModal
          rashi={modalRashi}
          prediction={predictions[modalRashi.id] || null}
          isPersonalized={modalRashi.id === userMoonSign}
          onClose={() => setModalRashi(null)}
        />
      )}
      {monthlyModalRashi && viewMode === 'monthly' && (
        <MonthlyRashiModal
          rashi={monthlyModalRashi}
          prediction={monthlyPredictions[monthlyModalRashi.id] || null}
          isPersonalized={monthlyModalRashi.id === userMoonSign}
          monthLabel={monthLabel}
          onClose={() => setMonthlyModalRashi(null)}
        />
      )}

      {/* ── Daily View ── */}
      {viewMode === 'daily' && !loading && (
        <>
          {selectedRashi && predictions[selectedRashi] && (
            <FadeIn delay={0.1}>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-[2px] h-4 rounded-full" style={{ background: 'linear-gradient(to bottom, var(--primary), #8B5E3C)' }} />
                  <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide uppercase">
                    {selectedRashi === userMoonSign ? 'Your Personalized Prediction' : 'Selected Horoscope'}
                  </h2>
                </div>
                <div className="max-w-lg">
                  <RashiCard
                    rashi={RASHIS.find((r) => r.id === selectedRashi)!}
                    prediction={predictions[selectedRashi]}
                    isPersonalized={selectedRashi === userMoonSign}
                    onClick={() => setModalRashi(RASHIS.find((r) => r.id === selectedRashi)!)}
                  />
                </div>
              </div>
            </FadeIn>
          )}

          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-[2px] h-4 rounded-full" style={{ background: 'linear-gradient(to bottom, var(--primary), #8B5E3C)' }} />
              <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide uppercase">
                All Rashis
              </h2>
            </div>
            <StaggerList className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {RASHIS.map((rashi) => (
                <StaggerItem
                  key={rashi.id}
                  ref={(el) => {
                    if (el) rashiRefsDaily.current[rashi.id] = el;
                  }}
                  data-rashi-id={rashi.id}
                >
                  <RashiCard
                    rashi={rashi}
                    prediction={predictions[rashi.id] || null}
                    isPersonalized={rashi.id === userMoonSign}
                    onClick={() => {
                      hasInteractedDailyRef.current = true;
                      setSelectedRashi(rashi.id);
                    }}
                  />
                </StaggerItem>
              ))}
            </StaggerList>
          </div>
        </>
      )}

      {/* ── Monthly View ── */}
      {viewMode === 'monthly' && !monthlyLoading && (
        <>
          {selectedMonthlyRashi && monthlyPredictions[selectedMonthlyRashi] && (
            <FadeIn delay={0.1}>
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-[2px] h-4 rounded-full" style={{ background: 'linear-gradient(to bottom, var(--primary), #8B5E3C)' }} />
                  <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide uppercase">
                    {selectedMonthlyRashi === userMoonSign ? 'Your Monthly Forecast' : 'Selected Forecast'}
                  </h2>
                </div>
                <div className="max-w-lg">
                  <MonthlyRashiCard
                    rashi={RASHIS.find((r) => r.id === selectedMonthlyRashi)!}
                    prediction={monthlyPredictions[selectedMonthlyRashi]}
                    isPersonalized={selectedMonthlyRashi === userMoonSign}
                    onClick={() => setMonthlyModalRashi(RASHIS.find((r) => r.id === selectedMonthlyRashi)!)}
                  />
                </div>
              </div>
            </FadeIn>
          )}

          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-[2px] h-4 rounded-full" style={{ background: 'linear-gradient(to bottom, var(--primary), #8B5E3C)' }} />
              <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide uppercase">
                All Rashis — {monthLabel}
              </h2>
            </div>
            <StaggerList className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {RASHIS.map((rashi) => (
                <StaggerItem
                  key={rashi.id}
                  ref={(el) => {
                    if (el) rashiRefsMonthly.current[rashi.id] = el;
                  }}
                  data-rashi-id={rashi.id}
                >
                  <MonthlyRashiCard
                    rashi={rashi}
                    prediction={monthlyPredictions[rashi.id] || null}
                    isPersonalized={rashi.id === userMoonSign}
                    onClick={() => {
                      hasInteractedMonthlyRef.current = true;
                      setSelectedMonthlyRashi(rashi.id);
                    }}
                  />
                </StaggerItem>
              ))}
            </StaggerList>
          </div>
        </>
      )}
    </MotionPage>
  );
}
