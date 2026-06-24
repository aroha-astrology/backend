'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { MotionPage, FadeIn, StaggerList, StaggerItem, ScrollReveal } from '@/components/ui/motion-primitives';
import { staggerContainer, staggerItem } from '@/lib/motion';

// =============================================================================
// Hindu Festival Data (approximate Gregorian dates — varies yearly)
// =============================================================================

interface Festival {
  name: string;
  month: number; // 1-indexed
  day: number;
  duration?: number; // multi-day festivals
  description: string;
}

// Dates are approximate for 2026; lunar festivals shift yearly.
const HINDU_FESTIVALS: Festival[] = [
  { name: 'Makar Sankranti', month: 1, day: 14, description: 'Sun enters Capricorn. Harvest festival celebrated across India.' },
  { name: 'Basant Panchami', month: 1, day: 29, description: 'Worship of Goddess Saraswati. Marks the arrival of spring.' },
  { name: 'Maha Shivratri', month: 2, day: 27, description: 'The great night of Lord Shiva. Fasting and night vigil observed.' },
  { name: 'Holi', month: 3, day: 11, description: 'Festival of colors celebrating the victory of good over evil.' },
  { name: 'Ugadi / Gudi Padwa', month: 3, day: 20, description: 'Hindu New Year in many traditions.' },
  { name: 'Ram Navami', month: 3, day: 28, description: 'Birth of Lord Rama. Recitation of Ramayana.' },
  { name: 'Hanuman Jayanti', month: 4, day: 6, description: 'Birth anniversary of Lord Hanuman.' },
  { name: 'Akshaya Tritiya', month: 4, day: 22, description: 'Extremely auspicious day. Good for new ventures and gold purchase.' },
  { name: 'Buddha Purnima', month: 5, day: 22, description: 'Birth, enlightenment and Mahaparinirvana of Lord Buddha.' },
  { name: 'Guru Purnima', month: 7, day: 21, description: 'Day to honor spiritual teachers and gurus.' },
  { name: 'Raksha Bandhan', month: 8, day: 5, description: 'Bond of protection between siblings.' },
  { name: 'Janmashtami', month: 8, day: 14, description: 'Birth of Lord Krishna. Midnight celebrations and fasting.' },
  { name: 'Ganesh Chaturthi', month: 8, day: 27, description: 'Birth of Lord Ganesha. 10-day celebration.' },
  { name: 'Navaratri Begins', month: 10, day: 2, duration: 9, description: 'Nine nights of Goddess Durga worship. Garba and dandiya celebrations.' },
  { name: 'Dussehra / Vijayadashami', month: 10, day: 11, description: 'Victory of Lord Rama over Ravana. Triumph of good over evil.' },
  { name: 'Karva Chauth', month: 10, day: 24, description: 'Married women fast for the longevity of their husbands.' },
  { name: 'Diwali', month: 10, day: 31, description: 'Festival of lights. Worship of Lakshmi and Ganesha.' },
  { name: 'Bhai Dooj', month: 11, day: 2, description: 'Celebration of the bond between brothers and sisters.' },
  { name: 'Chhath Puja', month: 11, day: 5, description: 'Worship of the Sun God. Primarily celebrated in Bihar and UP.' },
  { name: 'Dev Deepawali', month: 11, day: 15, description: 'Festival of lights of the Gods in Varanasi.' },
];

// =============================================================================
// Approximate tithi mapping for notable tithis
// =============================================================================

interface TithiEvent {
  name: string;
  type: 'ekadashi' | 'purnima' | 'amavasya';
  month: number;
  day: number;
}

function generateTithiEvents(year: number): TithiEvent[] {
  const events: TithiEvent[] = [];
  const basePurnima = [
    { m: 1, d: 13 }, { m: 2, d: 12 }, { m: 3, d: 14 }, { m: 4, d: 12 },
    { m: 5, d: 12 }, { m: 6, d: 11 }, { m: 7, d: 10 }, { m: 8, d: 9 },
    { m: 9, d: 7 }, { m: 10, d: 7 }, { m: 11, d: 5 }, { m: 12, d: 5 },
  ];
  const baseAmavasya = [
    { m: 1, d: 29 }, { m: 2, d: 27 }, { m: 3, d: 29 }, { m: 4, d: 27 },
    { m: 5, d: 27 }, { m: 6, d: 25 }, { m: 7, d: 25 }, { m: 8, d: 23 },
    { m: 9, d: 22 }, { m: 10, d: 21 }, { m: 11, d: 20 }, { m: 12, d: 20 },
  ];

  const yearOffset = (year - 2026) % 3;

  for (const p of basePurnima) {
    const d = Math.min(Math.max(p.d + yearOffset, 1), 28);
    events.push({ name: 'Purnima', type: 'purnima', month: p.m, day: d });
  }
  for (const a of baseAmavasya) {
    const d = Math.min(Math.max(a.d + yearOffset, 1), 28);
    events.push({ name: 'Amavasya', type: 'amavasya', month: a.m, day: d });
  }

  for (const p of basePurnima) {
    const d1 = p.d - 4 + yearOffset;
    if (d1 >= 1) events.push({ name: 'Shukla Ekadashi', type: 'ekadashi', month: p.m, day: d1 });
  }
  for (const a of baseAmavasya) {
    const d2 = a.d - 4 + yearOffset;
    if (d2 >= 1 && d2 <= 28) events.push({ name: 'Krishna Ekadashi', type: 'ekadashi', month: a.m, day: d2 });
  }

  return events;
}

// =============================================================================
// Calendar helpers
// =============================================================================

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// =============================================================================
// Component
// =============================================================================

interface DayInfo {
  festivals: Festival[];
  tithis: TithiEvent[];
}

export default function CalendarPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());

  const tithiEvents = useMemo(() => generateTithiEvents(year), [year]);

  const dayMap = useMemo(() => {
    const map: Record<number, DayInfo> = {};
    const daysInMonth = getDaysInMonth(year, month);
    for (let d = 1; d <= daysInMonth; d++) {
      map[d] = { festivals: [], tithis: [] };
    }

    for (const f of HINDU_FESTIVALS) {
      if (f.month === month) {
        const dur = f.duration || 1;
        for (let i = 0; i < dur; i++) {
          const d = f.day + i;
          if (map[d]) map[d].festivals.push(f);
        }
      }
    }

    for (const t of tithiEvents) {
      if (t.month === month && map[t.day]) {
        map[t.day].tithis.push(t);
      }
    }

    return map;
  }, [year, month, tithiEvents]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(year - 1); }
    else setMonth(month - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(year + 1); }
    else setMonth(month + 1);
    setSelectedDay(null);
  };

  const goToday = () => {
    const t = new Date();
    setYear(t.getFullYear());
    setMonth(t.getMonth() + 1);
    setSelectedDay(t.getDate());
  };

  const selectedInfo = selectedDay ? dayMap[selectedDay] : null;

  // Cell background color logic
  function cellBgClass(day: number): string {
    const info = dayMap[day];
    if (!info) return '';
    if (info.festivals.length > 0) return 'bg-accent/10';
    const hasPurnima = info.tithis.some((t) => t.type === 'purnima');
    const hasEkadashi = info.tithis.some((t) => t.type === 'ekadashi');
    const hasAmavasya = info.tithis.some((t) => t.type === 'amavasya');
    if (hasAmavasya) return 'bg-error/10';
    if (hasPurnima || hasEkadashi) return 'bg-success/10';
    return '';
  }

  function cellBorderClass(day: number): string {
    if (selectedDay === day) return 'border-2 border-accent';
    const isToday = day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();
    if (isToday) return 'border border-primary/50';
    return 'border border-white/5';
  }

  return (
    <MotionPage className="min-h-screen">
      {/* Header */}
      <div className="px-4 pb-4 pt-6" style={{ borderBottom: '1px solid rgba(212, 175, 55,0.10)' }}>
        <div className="mx-auto max-w-[1200px]">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-primary/70 uppercase mb-1">Panchang</p>
          <h1 className="font-[family-name:var(--font-serif)] text-2xl md:text-3xl font-bold text-text tracking-wide">
            Festival &amp; Panchang Calendar
          </h1>
          <p className="mt-0.5 text-sm text-text-secondary">
            Hindu festivals, tithis, and auspicious dates at a glance
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-[1200px] px-3 py-4 pb-16">
        {/* Month selector */}
        <FadeIn>
          <div className="mb-4 flex items-center justify-between rounded-xl p-2.5" style={{ border: '1px solid rgba(212, 175, 55,0.16)', background: 'rgba(0,0,0,0.03)', backdropFilter: 'blur(12px)' }}>
            <button
              onClick={prevMonth}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-2"
              style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(212, 175, 55,0.18)' }}
            >
              &larr; Prev
            </button>

            <div className="flex items-center gap-2.5">
              <span className="font-[family-name:var(--font-serif)] text-base font-bold" style={{ color: 'var(--text)' }}>
                {MONTH_NAMES[month - 1]} {year}
              </span>
              <button
                onClick={goToday}
                className="rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors"
                style={{ background: 'rgba(212, 175, 55,0.12)', border: '1px solid rgba(212, 175, 55,0.30)', color: 'var(--text)' }}
              >
                Today
              </button>
            </div>

            <button
              onClick={nextMonth}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-2"
              style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(212, 175, 55,0.18)' }}
            >
              Next &rarr;
            </button>
          </div>
        </FadeIn>

        {/* Legend */}
        <div className="mb-3 flex gap-3 flex-wrap">
          {[
            { bg: 'rgba(168,127,255,0.5)', label: 'Festival' },
            { bg: 'rgba(34,197,94,0.5)', label: 'Auspicious (Purnima / Ekadashi)' },
            { bg: 'rgba(239,68,68,0.5)', label: 'Amavasya' },
          ].map(({ bg, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: bg }} />
              <span className="text-[10px] text-text-secondary">{label}</span>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Calendar Grid */}
          <ScrollReveal>
            <div className="rounded-2xl p-3 overflow-auto" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(212, 175, 55,0.16)', backdropFilter: 'blur(12px)' }}>
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-1.5">
                {DAY_NAMES.map((d) => (
                  <div
                    key={d}
                    className={`text-center text-[10px] font-bold uppercase tracking-wider py-1 ${
                      d === 'Sun' ? 'text-error' : 'text-text-secondary'
                    }`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells before first day */}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`empty-${i}`} className="min-h-[72px]" />
                ))}

                {/* Actual day cells */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const info = dayMap[day];
                  const isToday = day === today.getDate() && month === today.getMonth() + 1 && year === today.getFullYear();

                  return (
                    <div
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={`min-h-[72px] ${cellBgClass(day)} ${cellBorderClass(day)} rounded-lg p-1.5 cursor-pointer transition-all relative hover:border-accent/30`}
                    >
                      {/* Date number */}
                      <div className={`text-xs mb-0.5 ${isToday ? 'font-extrabold text-primary' : 'font-semibold text-text'}`}>
                        {day}
                      </div>

                      {/* Tithi badge */}
                      {info?.tithis.map((t, idx) => (
                        <div
                          key={idx}
                          className={`text-[8px] font-semibold leading-tight mb-0.5 ${
                            t.type === 'amavasya' ? 'text-error' : t.type === 'purnima' ? 'text-success' : 'text-blue-500'
                          }`}
                        >
                          {t.name}
                        </div>
                      ))}

                      {/* Festival badge */}
                      {info?.festivals.map((f, idx) => (
                        <div
                          key={idx}
                          className="text-[8px] font-bold text-accent leading-tight overflow-hidden text-ellipsis whitespace-nowrap"
                        >
                          {f.name}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          </ScrollReveal>

          {/* Selected day details */}
          {selectedDay && selectedInfo && (
            <FadeIn>
              <div className="rounded-2xl p-4" style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(212, 175, 55,0.22)', backdropFilter: 'blur(16px)' }}>
                <h3 className="text-sm font-bold font-[family-name:var(--font-serif)] mb-2.5" style={{ color: 'var(--text)' }}>
                  {selectedDay} {MONTH_NAMES[month - 1]} {year}
                </h3>

                {/* Panchang info */}
                <div className="mb-3">
                  <h4 className="text-xs font-semibold text-text mb-1.5">
                    Panchang Summary
                  </h4>
                  {selectedInfo.tithis.length > 0 ? (
                    <div className="flex flex-col gap-1.5">
                      {selectedInfo.tithis.map((t, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span
                            className={`inline-block w-1.5 h-1.5 rounded-full ${
                              t.type === 'purnima' ? 'bg-success' : t.type === 'amavasya' ? 'bg-error' : 'bg-blue-500'
                            }`}
                          />
                          <span className="text-xs text-text font-medium">{t.name}</span>
                          <span className="text-[10px] text-text-secondary">
                            {t.type === 'purnima'
                              ? '- Full Moon day, auspicious for worship and charity'
                              : t.type === 'amavasya'
                                ? '- New Moon day, favorable for Pitru Tarpan'
                                : '- Sacred fasting day dedicated to Lord Vishnu'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-text-secondary">No special tithi on this day.</p>
                  )}
                </div>

                {/* Festivals */}
                {selectedInfo.festivals.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-text mb-1.5">
                      Festivals
                    </h4>
                    <div className="flex flex-col gap-2">
                      {selectedInfo.festivals.map((f, i) => (
                        <div
                          key={i}
                          className="rounded-lg p-2.5"
                          style={{ background: 'rgba(168,127,255,0.06)', border: '1px solid rgba(168,127,255,0.15)' }}
                        >
                          <div className="text-xs font-bold text-accent mb-0.5">
                            {f.name}
                          </div>
                          <p className="text-[10px] text-text-secondary leading-relaxed">
                            {f.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* General auspiciousness note */}
                {selectedInfo.festivals.length === 0 && selectedInfo.tithis.length === 0 && (
                  <p className="text-[10px] text-text-secondary leading-relaxed">
                    A regular day with no special tithis or festivals marked. Check the Panchang page for
                    detailed daily information including nakshatra, yoga, karana, and muhurta timings.
                  </p>
                )}
              </div>
            </FadeIn>
          )}
        </div>

        {/* Upcoming festivals list */}
        <ScrollReveal>
          <div className="rounded-2xl p-4 mt-4" style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(212, 175, 55,0.16)', backdropFilter: 'blur(12px)' }}>
            <h3 className="text-sm font-bold font-[family-name:var(--font-serif)] text-text mb-3">
              Upcoming Festivals in {MONTH_NAMES[month - 1]}
            </h3>
            {(() => {
              const upcoming = HINDU_FESTIVALS.filter((f) => f.month === month).sort((a, b) => a.day - b.day);
              if (upcoming.length === 0) {
                return <p className="text-xs text-text-secondary">No major festivals this month.</p>;
              }
              return (
                <motion.div variants={staggerContainer} initial="initial" animate="animate" className="flex flex-col gap-2">
                  {upcoming.map((f, i) => (
                    <motion.div
                      key={i}
                      variants={staggerItem}
                      className="flex items-center gap-2.5 p-2.5 rounded-lg cursor-pointer transition-colors hover:bg-white/[0.04]"
                      style={{ background: 'rgba(212, 175, 55,0.04)', border: '1px solid rgba(212, 175, 55,0.12)' }}
                      onClick={() => setSelectedDay(f.day)}
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(212, 175, 55,0.12)' }}>
                        <span className="text-sm font-extrabold" style={{ color: 'var(--text)' }}>{f.day}</span>
                      </div>
                      <div>
                        <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{f.name}</div>
                        <div className="text-[10px] text-text-secondary">{f.description}</div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              );
            })()}
          </div>
        </ScrollReveal>

        <p className="text-center text-[10px] text-text-secondary/70 mt-4">
          Festival dates are approximate and may vary based on regional traditions and lunar calendar calculations.
        </p>
      </div>
    </MotionPage>
  );
}
