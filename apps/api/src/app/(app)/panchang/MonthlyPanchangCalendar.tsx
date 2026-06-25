'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePanchangMonthQuery, type PanchangMonthDay } from '@/hooks/queries/usePanchangMonthQuery';
import { getFestivalsForDate, hasMajorFestival, type HinduFestival } from './hindu-festivals';
import { findAdhikMaas } from './adhik-maas-ranges';

export interface SelectedDayDetails {
  tithi?: string;
  nakshatra?: string;
  vara?: string;
  sunrise?: string;
  sunset?: string;
  rahuKaal?: { start: string; end: string };
  abhijitMuhurta?: { start: string; end: string };
}

interface Props {
  selectedDate: string; // YYYY-MM-DD
  onSelectDate: (date: string) => void;
  lat?: number | null;
  lng?: number | null;
  dayDetails?: SelectedDayDetails;
  dayLoading?: boolean;
  // Regional lunar/solar month label for the currently-selected day, already
  // resolved on the page (e.g. "Vaishakh · Krishna"). Rendered as a secondary
  // line under the Gregorian month header so the user sees the calendar
  // re-flow when the region dropdown is changed.
  regionalLabel?: string | null;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_FULL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function shortLabel(name: string, max = 7): string {
  if (!name) return '';
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + '…';
}

function formatSelectedHeading(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  const wk = WEEKDAY_FULL[dt.getUTCDay()];
  return `${wk}, ${MONTH_NAMES[(m || 1) - 1]} ${d}, ${y}`;
}

export function MonthlyPanchangCalendar({
  selectedDate,
  onSelectDate,
  lat,
  lng,
  dayDetails,
  dayLoading = false,
  regionalLabel = null,
}: Props) {
  const [cursor, setCursor] = useState(() => {
    const [y, m] = selectedDate.split('-').map(Number);
    return { year: y || new Date().getFullYear(), month: m || new Date().getMonth() + 1 };
  });

  const { data, isLoading } = usePanchangMonthQuery(cursor.year, cursor.month, { lat, lng });

  const selectedFestivals: HinduFestival[] = useMemo(
    () => getFestivalsForDate(selectedDate),
    [selectedDate],
  );

  const today = todayISO();

  const cells = useMemo(() => {
    const firstDay = new Date(Date.UTC(cursor.year, cursor.month - 1, 1)).getUTCDay();
    const daysInMonth = new Date(cursor.year, cursor.month, 0).getDate();
    const lookup = new Map<number, PanchangMonthDay>();
    (data ?? []).forEach((d) => lookup.set(d.day, d));

    const arr: Array<{ kind: 'blank' } | { kind: 'day'; date: string; day: number; data?: PanchangMonthDay }> = [];
    for (let i = 0; i < firstDay; i++) arr.push({ kind: 'blank' });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      arr.push({ kind: 'day', date, day: d, data: lookup.get(d) });
    }
    while (arr.length % 7 !== 0) arr.push({ kind: 'blank' });
    return arr;
  }, [cursor, data]);

  function shiftMonth(delta: number) {
    setCursor(({ year, month }) => {
      const m = month + delta;
      if (m < 1) return { year: year - 1, month: 12 };
      if (m > 12) return { year: year + 1, month: 1 };
      return { year, month: m };
    });
  }

  function jumpToToday() {
    const t = new Date();
    setCursor({ year: t.getFullYear(), month: t.getMonth() + 1 });
    onSelectDate(t.toISOString().split('T')[0]);
  }

  // Compute month-wide "Key Dates" — Purnima, Amavasya, Ekadashi, paksha starts, festivals
  const keyDates = useMemo(() => {
    type DayEntry = { day: number; weekday: string };
    const monthData = data ?? [];
    const fmt = (day: number): DayEntry => {
      const wd = WEEKDAY_FULL[new Date(Date.UTC(cursor.year, cursor.month - 1, day)).getUTCDay()];
      return { day, weekday: wd };
    };
    const purnimas: DayEntry[] = [];
    const amavasyas: DayEntry[] = [];
    const ekadashis: DayEntry[] = [];
    const shuklaStarts: DayEntry[] = [];
    const krishnaStarts: DayEntry[] = [];
    let prevP: 'Shukla' | 'Krishna' | null = null;
    for (const d of monthData) {
      if (d.isFullMoon) purnimas.push(fmt(d.day));
      if (d.isNewMoon) amavasyas.push(fmt(d.day));
      if (d.isEkadashi) ekadashis.push(fmt(d.day));
      if (d.paksha === 'Shukla' && prevP !== 'Shukla') shuklaStarts.push(fmt(d.day));
      if (d.paksha === 'Krishna' && prevP !== 'Krishna') krishnaStarts.push(fmt(d.day));
      if (d.paksha) prevP = d.paksha;
    }
    const festivals: Array<{ entry: DayEntry; name: string; emoji: string }> = [];
    for (const d of monthData) {
      const iso = `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
      for (const f of getFestivalsForDate(iso)) {
        festivals.push({ entry: fmt(d.day), name: f.name, emoji: f.emoji });
      }
    }
    return { purnimas, amavasyas, ekadashis, shuklaStarts, krishnaStarts, festivals };
  }, [data, cursor]);

  const timings = useMemo(() => {
    if (!dayDetails) return [];
    const items: Array<{ icon: string; label: string; value: string }> = [];
    if (dayDetails.sunrise) items.push({ icon: '🌅', label: 'Sunrise', value: dayDetails.sunrise });
    if (dayDetails.sunset) items.push({ icon: '🌇', label: 'Sunset', value: dayDetails.sunset });
    if (dayDetails.rahuKaal) {
      items.push({ icon: '🐉', label: 'Rahu Kaal', value: `${dayDetails.rahuKaal.start} – ${dayDetails.rahuKaal.end}` });
    }
    if (dayDetails.abhijitMuhurta) {
      items.push({ icon: '✦', label: 'Abhijit', value: `${dayDetails.abhijitMuhurta.start} – ${dayDetails.abhijitMuhurta.end}` });
    }
    return items;
  }, [dayDetails]);

  return (
    <div
      className="rounded-2xl glass-2 overflow-hidden mx-auto w-full max-w-3xl"
      style={{ border: '1px solid rgba(212, 175, 55,0.16)' }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: '1px solid rgba(212, 175, 55,0.12)' }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            aria-label="Previous month"
            className="w-7 h-7 rounded-full flex items-center justify-center text-text-secondary hover:text-text hover:bg-[rgba(212, 175, 55,0.08)] transition-colors"
          >
            ‹
          </button>
          <div className="min-w-[110px] text-center">
            <h2 className="font-[family-name:var(--font-serif)] text-sm font-bold text-text tracking-wide leading-tight">
              {MONTH_NAMES[cursor.month - 1]} {cursor.year}
            </h2>
            {regionalLabel && (
              <motion.p
                key={regionalLabel}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                className="text-[10px] font-semibold text-primary/80 leading-tight mt-0.5"
              >
                {regionalLabel}
              </motion.p>
            )}
          </div>
          <button
            onClick={() => shiftMonth(1)}
            aria-label="Next month"
            className="w-7 h-7 rounded-full flex items-center justify-center text-text-secondary hover:text-text hover:bg-[rgba(212, 175, 55,0.08)] transition-colors"
          >
            ›
          </button>
        </div>
        <button
          onClick={jumpToToday}
          className="text-[10px] font-semibold px-2.5 py-1 rounded-full transition-colors"
          style={{
            background: 'rgba(212, 175, 55,0.10)',
            border: '1px solid rgba(212, 175, 55,0.25)',
            color: 'var(--text)',
          }}
        >
          Today
        </button>
      </div>

      {/* Weekday row */}
      <div className="grid grid-cols-7 px-2 pt-2">
        {WEEKDAY_LABELS.map((w, i) => (
          <div
            key={i}
            className="text-[9px] font-semibold tracking-[0.12em] uppercase text-text-secondary text-center pb-1.5"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day grid — compact: short cells, tight gaps */}
      <div className="grid grid-cols-7 gap-1 px-2 pb-2 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="text-[10px] font-semibold tracking-wider uppercase text-text-secondary bg-[rgba(255,255,255,0.6)] backdrop-blur-sm px-3 py-1 rounded-full">
              Loading…
            </div>
          </div>
        )}

        <AnimatePresence mode="popLayout">
          {cells.map((cell, idx) => {
            if (cell.kind === 'blank') {
              return <div key={`b-${idx}`} className="aspect-[5/4]" />;
            }
            const isToday = cell.date === today;
            const isSelected = cell.date === selectedDate;
            const d = cell.data;
            const paksha = d?.paksha;
            const isFullMoon = !!d?.isFullMoon;
            const isNewMoon = !!d?.isNewMoon;
            const isEkadashi = !!d?.isEkadashi;
            const festivals = getFestivalsForDate(cell.date);
            const hasMajor = hasMajorFestival(cell.date);
            const primaryFestival = festivals[0] ?? null;
            const adhik = findAdhikMaas(cell.date);

            // Adhik Maas takes priority over paksha shading: light red so the
            // user can see at a glance that the whole window is Mol Maas.
            const baseBg = adhik
              ? 'rgba(239,68,68,0.10)'
              : hasMajor
                ? 'rgba(245, 158, 11,0.10)'
                : paksha === 'Shukla'
                  ? 'rgba(255,255,255,0.55)'
                  : paksha === 'Krishna'
                    ? 'rgba(212, 175, 55,0.06)'
                    : 'rgba(0,0,0,0.02)';
            const baseBorder = isSelected
              ? 'rgba(212, 175, 55,0.65)'
              : isToday
                ? 'rgba(212, 175, 55,0.40)'
                : adhik
                  ? 'rgba(239,68,68,0.30)'
                  : hasMajor
                    ? 'rgba(245, 158, 11,0.40)'
                    : 'rgba(0,0,0,0.06)';

            return (
              <motion.button
                key={cell.date}
                onClick={() => onSelectDate(cell.date)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                className="aspect-[5/4] rounded-lg p-1 text-left flex flex-col justify-between relative overflow-hidden transition-colors"
                style={{
                  background: isSelected ? 'rgba(212, 175, 55,0.16)' : baseBg,
                  border: `1px solid ${baseBorder}`,
                  boxShadow: isSelected ? '0 0 12px rgba(212, 175, 55,0.20)' : 'none',
                }}
                aria-label={`${cell.date}${d ? ` — ${d.tithi}` : ''}${adhik ? ` — ${adhik.label} (Adhik Maas)` : ''}`}
                aria-pressed={isSelected}
                title={adhik ? `${adhik.label} · Adhik Maas / Mol Maas — avoid new beginnings` : undefined}
              >
                <div className="flex items-start justify-between gap-0.5">
                  <span
                    className={`text-[11px] font-bold leading-none ${isSelected || isToday ? 'text-primary' : 'text-text'}`}
                  >
                    {cell.day}
                  </span>
                  <span className="text-[9px] leading-none">
                    {primaryFestival && <span title={primaryFestival.name}>{primaryFestival.emoji}</span>}
                    {!primaryFestival && isFullMoon && <span title="Purnima">🌕</span>}
                    {!primaryFestival && isNewMoon && <span title="Amavasya">🌑</span>}
                    {!primaryFestival && isEkadashi && !isFullMoon && !isNewMoon && (
                      <span title="Ekadashi" className="text-amber-500">✦</span>
                    )}
                  </span>
                </div>

                <div className="min-w-0">
                  {primaryFestival ? (
                    <p
                      className="text-[8px] font-bold leading-tight truncate"
                      style={{ color: '#b45309' }}
                      title={festivals.map((f) => f.name).join(', ')}
                    >
                      {primaryFestival.name}
                    </p>
                  ) : (
                    <p
                      className="text-[8px] font-semibold leading-tight truncate"
                      style={{ color: 'var(--text)' }}
                    >
                      {d ? shortLabel(d.tithiName) : ''}
                    </p>
                  )}
                </div>

                {isToday && !isSelected && (
                  <div
                    aria-hidden
                    className="absolute inset-x-1.5 bottom-0.5 h-[2px] rounded-full"
                    style={{ background: 'var(--primary)' }}
                  />
                )}
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Selected day details — tithi/nakshatra/vara, festivals, key timings */}
      <motion.div
        key={selectedDate}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="px-4 py-3"
        style={{ borderTop: '1px solid rgba(212, 175, 55,0.12)', background: 'rgba(212, 175, 55,0.03)' }}
      >
        <div className="flex items-baseline justify-between gap-3 mb-1.5">
          <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-primary/70">
            {formatSelectedHeading(selectedDate)}
          </p>
          {dayLoading && (
            <span className="text-[9px] text-text-secondary">Loading…</span>
          )}
        </div>

        {/* Adhik Maas / Mol Maas — banner for the entire selected window so the user
            doesn't have to recognise red shading vs a plain bad day. */}
        {(() => {
          const adhik = findAdhikMaas(selectedDate);
          if (!adhik) return null;
          return (
            <div
              className="flex items-start gap-2 rounded-lg px-3 py-2 mb-2"
              style={{
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.25)',
              }}
            >
              <span className="text-base leading-tight flex-shrink-0">🚫</span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold leading-tight" style={{ color: '#b91c1c' }}>
                  Adhik {adhik.monthName} · Mol Maas
                </p>
                <p className="text-[10px] text-text-secondary mt-0.5 leading-snug">
                  Inserted lunar month — avoid weddings, housewarming, vehicle purchase and other new beginnings. Spiritual practice and charity are encouraged.
                </p>
              </div>
            </div>
          );
        })()}

        {dayDetails && (dayDetails.tithi || dayDetails.nakshatra || dayDetails.vara) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] mb-2">
            {dayDetails.tithi && (
              <span><span className="text-text-secondary">Tithi · </span><span className="font-semibold text-text">{dayDetails.tithi}</span></span>
            )}
            {dayDetails.nakshatra && (
              <span><span className="text-text-secondary">Nakshatra · </span><span className="font-semibold text-text">{dayDetails.nakshatra}</span></span>
            )}
            {dayDetails.vara && (
              <span><span className="text-text-secondary">Vara · </span><span className="font-semibold text-text">{dayDetails.vara}</span></span>
            )}
          </div>
        )}

        {selectedFestivals.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            {selectedFestivals.map((f) => (
              <span
                key={f.name}
                className="text-[10px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.30)', color: '#92400e' }}
              >
                <span>{f.emoji}</span>
                <span>{f.name}</span>
              </span>
            ))}
          </div>
        )}

        {timings.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {timings.map((t) => (
              <div
                key={t.label}
                className="rounded-lg px-2 py-1.5"
                style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(212, 175, 55,0.18)' }}
              >
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-text-secondary font-semibold">
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </div>
                <p className="text-[11px] font-bold text-text mt-0.5 font-mono leading-tight">{t.value}</p>
              </div>
            ))}
          </div>
        )}

        {!dayDetails && !dayLoading && (
          <p className="text-[10px] text-text-secondary italic">
            Tap a date to load its full panchang.
          </p>
        )}
      </motion.div>

      {/* Key Dates This Month — Purnima, Amavasya, Ekadashi, paksha starts, festivals */}
      {(keyDates.purnimas.length > 0 ||
        keyDates.amavasyas.length > 0 ||
        keyDates.ekadashis.length > 0 ||
        keyDates.shuklaStarts.length > 0 ||
        keyDates.krishnaStarts.length > 0 ||
        keyDates.festivals.length > 0) && (
        <div
          className="px-4 py-3"
          style={{ borderTop: '1px solid rgba(212, 175, 55,0.12)' }}
        >
          <h3 className="text-[10px] font-bold tracking-[0.18em] uppercase text-primary/80 mb-2.5">
            Key Dates · {MONTH_NAMES[cursor.month - 1]} {cursor.year}
          </h3>

          <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
            {keyDates.festivals.length > 0 && (
              <div
                className="sm:col-span-2 rounded-lg px-3 py-2"
                style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
              >
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold text-amber-600 mb-1">
                  <span>🎉</span><span>Festivals</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {keyDates.festivals.map((f, i) => (
                    <span key={i} className="text-text">
                      <span>{f.emoji}</span>{' '}
                      <span className="font-mono font-bold text-primary">
                        {MONTH_NAMES[cursor.month - 1].slice(0, 3)} {f.entry.day}
                      </span>{' '}
                      <span className="text-text-secondary">({f.entry.weekday})</span>{' '}
                      <span>· {f.name}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {keyDates.purnimas.length > 0 && (
              <div
                className="rounded-lg px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(212, 175, 55,0.18)' }}
              >
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold text-text-secondary mb-0.5">
                  <span>🌕</span><span>Purnima</span>
                </div>
                <p className="text-text font-mono font-bold">
                  {keyDates.purnimas.map(p => `${MONTH_NAMES[cursor.month - 1].slice(0, 3)} ${p.day} (${p.weekday})`).join(', ')}
                </p>
              </div>
            )}

            {keyDates.amavasyas.length > 0 && (
              <div
                className="rounded-lg px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(212, 175, 55,0.18)' }}
              >
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold text-text-secondary mb-0.5">
                  <span>🌑</span><span>Amavasya</span>
                </div>
                <p className="text-text font-mono font-bold">
                  {keyDates.amavasyas.map(p => `${MONTH_NAMES[cursor.month - 1].slice(0, 3)} ${p.day} (${p.weekday})`).join(', ')}
                </p>
              </div>
            )}

            {keyDates.ekadashis.length > 0 && (
              <div
                className="rounded-lg px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(212, 175, 55,0.18)' }}
              >
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold text-amber-600 mb-0.5">
                  <span>✦</span><span>Ekadashi</span>
                </div>
                <p className="text-text font-mono font-bold">
                  {keyDates.ekadashis.map(p => `${MONTH_NAMES[cursor.month - 1].slice(0, 3)} ${p.day} (${p.weekday})`).join(', ')}
                </p>
              </div>
            )}

            {keyDates.shuklaStarts.length > 0 && (
              <div
                className="rounded-lg px-3 py-2"
                style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(212, 175, 55,0.18)' }}
              >
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold text-text-secondary mb-0.5">
                  <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,0,0,0.20)' }} />
                  <span>Shukla begins</span>
                </div>
                <p className="text-text font-mono font-bold">
                  {keyDates.shuklaStarts.map(p => `${MONTH_NAMES[cursor.month - 1].slice(0, 3)} ${p.day} (${p.weekday})`).join(', ')}
                </p>
              </div>
            )}

            {keyDates.krishnaStarts.length > 0 && (
              <div
                className="rounded-lg px-3 py-2"
                style={{ background: 'rgba(212, 175, 55,0.06)', border: '1px solid rgba(212, 175, 55,0.20)' }}
              >
                <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-semibold text-text-secondary mb-0.5">
                  <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'rgba(212, 175, 55,0.30)', border: '1px solid rgba(212, 175, 55,0.50)' }} />
                  <span>Krishna begins</span>
                </div>
                <p className="text-text font-mono font-bold">
                  {keyDates.krishnaStarts.map(p => `${MONTH_NAMES[cursor.month - 1].slice(0, 3)} ${p.day} (${p.weekday})`).join(', ')}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        className="px-4 py-2 flex items-center gap-3 flex-wrap text-[9px] text-text-secondary"
        style={{ borderTop: '1px solid rgba(212, 175, 55,0.12)' }}
      >
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.40)' }} />
          Adhik Maas / Mol Maas
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'rgba(245,158,11,0.18)', border: '1px solid rgba(245,158,11,0.40)' }} />
          Festival
        </span>
        <span>🌕 Purnima</span>
        <span>🌑 Amavasya</span>
        <span><span className="text-amber-500">✦</span> Ekadashi</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,0,0,0.08)' }} />
          Shukla
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'rgba(212, 175, 55,0.18)', border: '1px solid rgba(0,0,0,0.08)' }} />
          Krishna
        </span>
      </div>
    </div>
  );
}
