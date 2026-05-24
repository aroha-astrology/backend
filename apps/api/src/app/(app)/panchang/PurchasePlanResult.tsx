'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface PlanRow {
  id: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  category: string;
  analysis: Record<string, unknown> | null;
  resolved_booking_date: string;
  resolved_delivery_date: string;
  created_at: string;
  completed_at: string | null;
  language: string;
  metadata: Record<string, string>;
  error_message?: string;
}

const CAT_ICONS: Record<string, string> = {
  vehicle: '🚗',
  home: '🏠',
  commercial: '🏢',
  other: '📦',
};

const CAT_LABELS: Record<string, string> = {
  vehicle: 'Vehicle',
  home: 'Home',
  commercial: 'Commercial',
  other: 'Other',
};

const SCORE_COLOR = (s: number) =>
  s >= 70 ? '#10b981' : s >= 45 ? 'var(--primary)' : '#f87171';

function ScoreBadge({ score }: { score: number }) {
  const color = SCORE_COLOR(score);
  return (
    <div
      className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
      style={{ background: `${color}18`, border: `2px solid ${color}55`, color }}
    >
      {score}
    </div>
  );
}

function PointList({ items, color = 'var(--primary)' }: { items: string[]; color?: string }) {
  return (
    <ul className="space-y-1">
      {items.map((item, i) => (
        <li key={i} className="text-xs text-text-secondary flex gap-1.5 leading-relaxed">
          <span style={{ color, flexShrink: 0 }}>•</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

interface DateCardProps {
  title: string;
  dateStr: string;
  provided: boolean;
  score: number;
  verdict: string;
  highlights: string[];
  warnings: string[];
  bestTimeWindows: string[];
  avoidTimes: string[];
}

function DateCard({ title, dateStr, provided, score, verdict, highlights, warnings, bestTimeWindows, avoidTimes }: DateCardProps) {
  const [open, setOpen] = useState(true);
  const color = SCORE_COLOR(score);

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${color}30` }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ background: `${color}08` }}
      >
        <ScoreBadge score={score} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">{title}</p>
          <p className="text-sm font-bold text-text font-[family-name:var(--font-serif)]">
            {new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            {!provided && <span className="ml-1.5 text-[9px] text-text-secondary/70 font-normal">(auto)</span>}
          </p>
          <p className="text-xs text-text-secondary mt-0.5 truncate">{verdict}</p>
        </div>
        <span className="text-text-secondary text-xs">{open ? '▲' : '▼'}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-2 space-y-3" style={{ background: `${color}04` }}>
              {highlights?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-1.5">✅ Positives</p>
                  <PointList items={highlights} color="#10b981" />
                </div>
              )}
              {warnings?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-1.5">⚠️ Cautions</p>
                  <PointList items={warnings} color="#f87171" />
                </div>
              )}
              {bestTimeWindows?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-1.5">🕐 Best Times</p>
                  <div className="flex flex-wrap gap-1.5">
                    {bestTimeWindows.map((t, i) => (
                      <span
                        key={i}
                        className="text-[10px] rounded-full px-2.5 py-0.5 font-medium"
                        style={{ background: 'rgba(16,185,129,0.10)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {avoidTimes?.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-1.5">🚫 Avoid</p>
                  <div className="flex flex-wrap gap-1.5">
                    {avoidTimes.map((t, i) => (
                      <span
                        key={i}
                        className="text-[10px] rounded-full px-2.5 py-0.5 font-medium"
                        style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.22)' }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Type-safe accessors ──────────────────────────────────────────────────────

function getStr(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

function getNum(obj: Record<string, unknown>, key: string): number {
  const v = obj[key];
  return typeof v === 'number' ? v : 0;
}

function getBool(obj: Record<string, unknown>, key: string): boolean {
  return !!obj[key];
}

function getStrArr(obj: Record<string, unknown>, key: string): string[] {
  const v = obj[key];
  return Array.isArray(v) ? (v as string[]) : [];
}

function getObj(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  const v = obj[key];
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

// ─── Single plan result card ──────────────────────────────────────────────────

function PlanCard({ plan }: { plan: PlanRow }) {
  const [expanded, setExpanded] = useState(false);
  const analysis = plan.analysis as Record<string, unknown> | null;

  const isLive = plan.status === 'pending' || plan.status === 'processing';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(212, 175, 55,0.20)', background: 'rgba(212, 175, 55,0.03)' }}
    >
      {/* Header row */}
      <button
        onClick={() => !isLive && analysis && setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        style={{ borderBottom: '1px solid rgba(212, 175, 55,0.10)' }}
      >
        <span className="text-2xl">{CAT_ICONS[plan.category] ?? '📦'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-text font-[family-name:var(--font-serif)]">
            {CAT_LABELS[plan.category] ?? plan.category}
            {plan.metadata?.vehicleType && <span className="ml-1.5 text-xs text-text-secondary font-normal">· {plan.metadata.vehicleType}</span>}
            {plan.metadata?.propertyType && <span className="ml-1.5 text-xs text-text-secondary font-normal">· {plan.metadata.propertyType}</span>}
            {plan.metadata?.itemDescription && <span className="ml-1.5 text-xs text-text-secondary font-normal">· {plan.metadata.itemDescription.slice(0, 28)}</span>}
          </p>
          <p className="text-[10px] text-text-secondary mt-0.5">
            {new Date(plan.resolved_booking_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            {' → '}
            {new Date(plan.resolved_delivery_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>

        {isLive && (
          <div className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: 'var(--text)' }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--primary)' }} />
            Analyzing...
          </div>
        )}
        {plan.status === 'error' && (
          <span className="text-[10px] text-red-400 font-medium">⚠ Error</span>
        )}
        {plan.status === 'done' && analysis && (
          <div className="flex items-center gap-2">
            {getNum(analysis, 'overallScore') > 0 && (
              <span
                className="text-xs font-bold px-2.5 py-1 rounded-full"
                style={{
                  background: `${SCORE_COLOR(getNum(analysis, 'overallScore'))}18`,
                  color: SCORE_COLOR(getNum(analysis, 'overallScore')),
                  border: `1px solid ${SCORE_COLOR(getNum(analysis, 'overallScore'))}40`,
                }}
              >
                {getNum(analysis, 'overallScore')}/100
              </span>
            )}
            <span className="text-text-secondary text-xs">{expanded ? '▲' : '▼'}</span>
          </div>
        )}
      </button>

      {/* Analysis body */}
      <AnimatePresence>
        {expanded && plan.status === 'done' && analysis && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-4 py-4 space-y-4">
              {/* TL;DR */}
              {(() => {
                const tldr = getStrArr(analysis, 'tldr');
                return tldr.length > 0 ? (
                  <div
                    className="rounded-xl p-3 space-y-1.5"
                    style={{ background: 'rgba(212, 175, 55,0.06)', border: '1px solid rgba(212, 175, 55,0.15)' }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text)' }}>✦ Quick Take</p>
                    {tldr.map((line, i) => (
                      <p key={i} className="text-xs text-text-secondary">{line}</p>
                    ))}
                  </div>
                ) : null;
              })()}

              {/* Overall verdict */}
              {getStr(analysis, 'overallVerdict') && (
                <p className="text-sm text-text leading-relaxed">{getStr(analysis, 'overallVerdict')}</p>
              )}

              {/* Booking + Delivery date cards */}
              {(() => {
                const bd = getObj(analysis, 'bookingDate');
                return Object.keys(bd).length > 0 ? (
                  <DateCard
                    title="Booking / Token Date"
                    dateStr={getStr(bd, 'date')}
                    provided={getBool(bd, 'provided')}
                    score={getNum(bd, 'score')}
                    verdict={getStr(bd, 'verdict')}
                    highlights={getStrArr(bd, 'highlights')}
                    warnings={getStrArr(bd, 'warnings')}
                    bestTimeWindows={getStrArr(bd, 'bestTimeWindows')}
                    avoidTimes={getStrArr(bd, 'avoidTimes')}
                  />
                ) : null;
              })()}
              {(() => {
                const dd = getObj(analysis, 'deliveryDate');
                return Object.keys(dd).length > 0 ? (
                  <DateCard
                    title="Delivery / Possession Date"
                    dateStr={getStr(dd, 'date')}
                    provided={getBool(dd, 'provided')}
                    score={getNum(dd, 'score')}
                    verdict={getStr(dd, 'verdict')}
                    highlights={getStrArr(dd, 'highlights')}
                    warnings={getStrArr(dd, 'warnings')}
                    bestTimeWindows={getStrArr(dd, 'bestTimeWindows')}
                    avoidTimes={getStrArr(dd, 'avoidTimes')}
                  />
                ) : null;
              })()}

              {/* Birth chart insights */}
              {(() => {
                const bci = getObj(analysis, 'birthChartInsights');
                if (!Object.keys(bci).length) return null;
                const favorable = getStrArr(bci, 'favorablePlanets');
                const challenging = getStrArr(bci, 'challengingFactors');
                return (
                  <div
                    className="rounded-xl p-4 space-y-2"
                    style={{ border: '1px solid rgba(124,58,237,0.15)', background: 'rgba(124,58,237,0.04)' }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#7c3aed' }}>🪐 Birth Chart Insights</p>
                    {getStr(bci, 'currentDasha') && (
                      <p className="text-xs text-text-secondary">
                        <span className="font-semibold text-text">Dasha:</span>{' '}
                        {getStr(bci, 'currentDasha')}
                      </p>
                    )}
                    {getStr(bci, 'dashaVerdict') && (
                      <p className="text-xs text-text-secondary">{getStr(bci, 'dashaVerdict')}</p>
                    )}
                    {favorable.length > 0 && (
                      <div>
                        <p className="text-[10px] text-text-secondary font-semibold mb-1">✅ Favorable</p>
                        <PointList items={favorable} color="#10b981" />
                      </div>
                    )}
                    {challenging.length > 0 && (
                      <div>
                        <p className="text-[10px] text-text-secondary font-semibold mb-1">⚠️ Watch out</p>
                        <PointList items={challenging} color="#f87171" />
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Remedies */}
              {(() => {
                const remedies = getStrArr(analysis, 'remedies');
                return remedies.length > 0 ? (
                  <div
                    className="rounded-xl p-4"
                    style={{ border: '1px solid rgba(212, 175, 55,0.20)', background: 'rgba(212, 175, 55,0.04)' }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text)' }}>🙏 Remedies</p>
                    <PointList items={remedies} color="var(--primary)" />
                  </div>
                ) : null;
              })()}

              {/* Lucky details */}
              {(getStr(analysis, 'luckyColor') || getStr(analysis, 'luckyDirection')) && (
                <div className="flex gap-3 flex-wrap">
                  {getStr(analysis, 'luckyColor') && (
                    <div
                      className="rounded-xl px-4 py-2 text-center flex-1"
                      style={{ border: '1px solid rgba(212, 175, 55,0.15)', background: 'rgba(212, 175, 55,0.04)' }}
                    >
                      <p className="text-[9px] uppercase tracking-wider text-text-secondary mb-0.5">Lucky Color</p>
                      <p className="text-xs font-bold text-text">🎨 {getStr(analysis, 'luckyColor')}</p>
                    </div>
                  )}
                  {getStr(analysis, 'luckyDirection') && (
                    <div
                      className="rounded-xl px-4 py-2 text-center flex-1"
                      style={{ border: '1px solid rgba(212, 175, 55,0.15)', background: 'rgba(212, 175, 55,0.04)' }}
                    >
                      <p className="text-[9px] uppercase tracking-wider text-text-secondary mb-0.5">Lucky Direction</p>
                      <p className="text-xs font-bold text-text">🧭 {getStr(analysis, 'luckyDirection')}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Final advice */}
              {getStr(analysis, 'finalAdvice') && (
                <div
                  className="rounded-xl p-4 relative overflow-hidden"
                  style={{ border: '1px solid rgba(212, 175, 55,0.30)', background: 'rgba(212, 175, 55,0.05)' }}
                >
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[rgba(212, 175, 55,0.5)] to-transparent" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text)' }}>✦ Yogi Baba&apos;s Final Word</p>
                  <p className="text-xs text-text-secondary leading-relaxed">{getStr(analysis, 'finalAdvice')}</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

interface Props {
  plans: PlanRow[];
  pollingId: string | null;
  onPolled: (updatedPlan: PlanRow) => void;
}

export function PurchasePlanResults({ plans, pollingId, onPolled }: Props) {
  // Poll the active plan until done/error
  useEffect(() => {
    if (!pollingId) return;
    const plan = plans.find((p) => p.id === pollingId);
    if (plan?.status === 'done' || plan?.status === 'error') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/purchase-plan/${pollingId}`);
        const json = (await res.json()) as { success: boolean; data?: PlanRow };
        if (json.success && json.data) {
          onPolled(json.data);
          if (json.data.status === 'done' || json.data.status === 'error') {
            clearInterval(interval);
          }
        }
      } catch {
        // silent — will retry on next tick
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [pollingId, plans, onPolled]);

  if (plans.length === 0) return null;

  return (
    <div className="space-y-3">
      {plans.map((p) => (
        <PlanCard key={p.id} plan={p} />
      ))}
    </div>
  );
}
