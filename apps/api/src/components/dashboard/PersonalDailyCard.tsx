'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { usePersonalDailyQuery } from '@/hooks/queries/usePersonalDailyQuery';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '@/store/useStore';
import { ChevronRight, Pencil, X } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  chartId: string | null;
  language?: string;
}

const MARITAL_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'dating', label: 'Dating' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'married', label: 'Married' },
  { value: 'separated_divorced', label: 'Separated · Divorced' },
  { value: 'widowed', label: 'Widowed' },
];

const FINANCIAL_OPTIONS = [
  { value: 'tight', label: 'Tight' },
  { value: 'stable', label: 'Stable' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
];

const SNOOZE_KEY = 'lifeContextSnoozeUntil';

function isSnoozed(): boolean {
  if (typeof window === 'undefined') return false;
  const until = localStorage.getItem(SNOOZE_KEY);
  return !!until && Date.now() < Number(until);
}

function snooze24h() {
  localStorage.setItem(SNOOZE_KEY, String(Date.now() + 24 * 3600 * 1000));
}

export function PersonalDailyCard({ chartId, language = 'en' }: Props) {
  const { data: reading, isLoading } = usePersonalDailyQuery(chartId, language);
  const user = useStore(s => s.user);
  const setUser = useStore(s => s.setUser);
  const queryClient = useQueryClient();

  const [showPrompt, setShowPrompt] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [profession, setProfession] = useState('');
  const [marital, setMarital] = useState('');
  const [financial, setFinancial] = useState('');
  const [saving, setSaving] = useState(false);
  const initialised = useRef(false);

  useEffect(() => {
    if (!user || initialised.current) return;
    initialised.current = true;
    setProfession(user.profession ?? '');
    setMarital(user.marital_status ?? '');
    setFinancial(user.financial_status ?? '');

    // If Apollo enrichment already supplied a sector, we have richer-than-self-reported
    // context — don't bug the user for profession/relationship/financial fields.
    const apolloHasData = !!user.apollo_sector;
    if (apolloHasData) { setShowPrompt(false); return; }

    // Auto-open the edit form when ANY field is still empty (not just all-empty).
    // Use snooze to suppress for 24h when user explicitly dismisses.
    const anyUnfilled = !user.profession || !user.marital_status || !user.financial_status;
    const noneFilled = !user.profession && !user.marital_status && !user.financial_status;
    setShowPrompt(noneFilled && !isSnoozed());
    if (anyUnfilled && !isSnoozed()) setShowEdit(true);
  }, [user]);

  // Hide the entire "personalize manually" surface (auto-prompt, edit sheet, pencil
  // icon) when Apollo has populated the derived columns — there is nothing left for
  // the user to add that we don't already know.
  const hasApolloData = !!user?.apollo_sector;

  if (!chartId) return null;
  if (!isLoading && reading === null) return null;

  const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  async function saveContext(close: () => void) {
    const payload: Record<string, string> = {};
    if (profession.trim()) payload.profession = profession.trim();
    if (marital) payload.marital_status = marital;
    if (financial) payload.financial_status = financial;
    if (Object.keys(payload).length === 0) { close(); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/user/life-context', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Save failed');
      if (user) {
        setUser({ ...user, ...payload, life_context_updated_at: new Date().toISOString() } as typeof user);
      }
      // Reset (not just invalidate) so cached old data is cleared and the loading
      // skeleton shows during regen — otherwise the user stares at the stale reading
      // for the 10-30s the LLM takes to produce a fresh, context-aware one.
      void queryClient.resetQueries({ queryKey: ['personalDaily', chartId, language] });
      toast.success('Saved! Your next reading will be more personal.');
      close();
    } catch {
      toast.error('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  const missingFields = user
    ? [!user.profession && 'profession', !user.marital_status && 'relationship status', !user.financial_status && 'financial situation'].filter(Boolean)
    : [];

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">

        <div className="flex items-center gap-2">
          <p className="text-[10px] text-text-muted">{today}</p>
          {user && !hasApolloData && (
            <button
              onClick={() => setShowEdit(true)}
              className="p-0.5 rounded text-text-muted hover:text-text transition-colors"
              aria-label="Edit personal context"
            >
              <Pencil size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Inline "Make it more personal" prompt — suppressed when Apollo enrichment is present */}
      {!hasApolloData && showPrompt && !showEdit && (
        <div className="mb-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-text">Make it more personal</p>
            <button onClick={() => { snooze24h(); setShowPrompt(false); }} className="text-text-muted">
              <X size={14} />
            </button>
          </div>
          <p className="text-[10px] text-text-muted mb-3">
            Share a bit about your life — your reading will speak directly to it.
            {missingFields.length > 0 && ` Missing: ${missingFields.join(', ')}.`}
          </p>

          {!user?.profession && (
            <div className="mb-3">
              <p className="text-[10px] font-medium text-text mb-1">What do you do for work?</p>
              <input
                type="text"
                value={profession}
                onChange={e => setProfession(e.target.value)}
                placeholder="e.g. teacher, software engineer, homemaker…"
                className="w-full text-xs bg-bg border border-border rounded-xl px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:border-primary"
              />
            </div>
          )}

          {!user?.marital_status && (
            <div className="mb-3">
              <p className="text-[10px] font-medium text-text mb-1.5">Relationship status</p>
              <div className="flex flex-wrap gap-1.5">
                {MARITAL_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setMarital(m => m === o.value ? '' : o.value)}
                    className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                      marital === o.value
                        ? 'bg-primary text-white border-primary'
                        : 'bg-bg border-border text-text-muted'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!user?.financial_status && (
            <div className="mb-3">
              <p className="text-[10px] font-medium text-text mb-1.5">Financial situation</p>
              <div className="flex flex-wrap gap-1.5">
                {FINANCIAL_OPTIONS.map(o => (
                  <button
                    key={o.value}
                    onClick={() => setFinancial(f => f === o.value ? '' : o.value)}
                    className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                      financial === o.value
                        ? 'bg-primary text-white border-primary'
                        : 'bg-bg border-border text-text-muted'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-1">
            <button
              onClick={() => saveContext(() => setShowPrompt(false))}
              disabled={saving}
              className="flex-1 text-xs font-semibold bg-primary text-white rounded-xl py-2 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { snooze24h(); setShowPrompt(false); }}
              className="flex-1 text-xs text-text-muted border border-border rounded-xl py-2"
            >
              Ask me later
            </button>
          </div>
        </div>
      )}

      {/* Edit sheet (shown when pencil icon clicked) — also suppressed when Apollo is populated */}
      {!hasApolloData && showEdit && (
        <div className="mb-3 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold text-text">Update your context</p>
            <button onClick={() => { snooze24h(); setShowEdit(false); }} className="text-text-muted"><X size={14} /></button>
          </div>
          <p className="text-[10px] text-text-muted mb-3 leading-snug">
            Your daily reading is tailored to your real life — the more we know, the more accurate and personal your predictions become.
          </p>

          <div className="mb-3">
            <p className="text-[10px] font-medium text-text mb-1">What do you do for work?</p>
            <input
              type="text"
              value={profession}
              onChange={e => setProfession(e.target.value)}
              placeholder="e.g. teacher, software engineer, homemaker…"
              className="w-full text-xs bg-bg border border-border rounded-xl px-3 py-2 text-text placeholder:text-text-muted focus:outline-none focus:border-primary"
            />
          </div>

          <div className="mb-3">
            <p className="text-[10px] font-medium text-text mb-1.5">Relationship status</p>
            <div className="flex flex-wrap gap-1.5">
              {MARITAL_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setMarital(m => m === o.value ? '' : o.value)}
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                    marital === o.value
                      ? 'bg-primary text-white border-primary'
                      : 'bg-bg border-border text-text-muted'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <p className="text-[10px] font-medium text-text mb-1.5">Financial situation</p>
            <div className="flex flex-wrap gap-1.5">
              {FINANCIAL_OPTIONS.map(o => (
                <button
                  key={o.value}
                  onClick={() => setFinancial(f => f === o.value ? '' : o.value)}
                  className={`text-[10px] px-2.5 py-1 rounded-full border transition-colors ${
                    financial === o.value
                      ? 'bg-primary text-white border-primary'
                      : 'bg-bg border-border text-text-muted'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-1">
            <button
              onClick={() => saveContext(() => setShowEdit(false))}
              disabled={saving}
              className="flex-1 text-xs font-semibold bg-primary text-white rounded-xl py-2 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => { snooze24h(); setShowEdit(false); }}
              className="flex-1 text-xs text-text-muted border border-border rounded-xl py-2"
            >
              Ask me later
            </button>
          </div>
        </div>
      )}

      <Link
        href="/dashboard/personal-daily"
        className="block bg-surface border border-border rounded-2xl p-4 shadow-sm no-underline active:scale-[0.99] transition-transform hover:shadow-md"
      >
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-3 w-48 rounded bg-surface-2 animate-pulse" />
            <div className="h-12 w-full rounded bg-surface-2 animate-pulse" />
            <div className="grid grid-cols-3 gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-16 rounded-xl bg-surface-2 animate-pulse" />
              ))}
            </div>
            <div className="flex gap-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-5 w-16 rounded-full bg-surface-2 animate-pulse" />
              ))}
            </div>
          </div>
        ) : reading ? (
          <>
            {reading.headline && (
              <p className="text-[11px] font-semibold text-warning mb-2">✦ {reading.headline}</p>
            )}

            <p className="text-sm font-semibold text-text leading-relaxed mb-3">{reading.general}</p>

            {reading.positive_points && reading.positive_points.length > 0 && (
              <div className="mb-2 space-y-1">
                {reading.positive_points.map((pt, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-green-500 text-xs mt-0.5 flex-shrink-0">✦</span>
                    <p className="text-xs text-text leading-snug">{pt}</p>
                  </div>
                ))}
              </div>
            )}

            {reading.issues && reading.issues.length > 0 && (
              <div className="mb-3 space-y-1">
                {reading.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <span className="text-amber-500 text-xs mt-0.5 flex-shrink-0">⚠</span>
                    <p className="text-xs text-text-muted leading-snug">{issue}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 mb-3">
              {(['career', 'love', 'health'] as const).map(area => {
                const icons = { career: '💼', love: '❤️', health: '🛡️' };
                const text = reading[area];
                if (!text) return null;
                return (
                  <div key={area} className="rounded-xl px-2 py-2 bg-bg border border-border">
                    <p className="j-eyebrow mb-0.5">{icons[area]} {area.toUpperCase()}</p>
                    <p className="text-[10px] leading-snug line-clamp-2 text-text-muted">{text}</p>
                  </div>
                );
              })}
            </div>

            {reading.remedy && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-[10px] font-bold text-amber-700 mb-1">🪷 Today's Remedy</p>
                <p className="text-xs text-amber-800 leading-snug">{reading.remedy}</p>
                {reading.remedy_mantra && (
                  <p className="mt-1.5 text-[11px] italic text-amber-700 font-medium leading-relaxed">{reading.remedy_mantra}</p>
                )}
              </div>
            )}

            <div className="flex gap-2 flex-wrap mb-2">
              {reading.luckyColor && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 border border-border text-text-muted">
                  🎨 {reading.luckyColor}
                </span>
              )}
              {reading.luckyNumber && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 border border-border text-text-muted">
                  🔢 {reading.luckyNumber}
                </span>
              )}
              {reading.luckyDirection && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-surface-2 border border-border text-text-muted">
                  🧭 {reading.luckyDirection}
                </span>
              )}
            </div>

            <div className="flex justify-end mt-1">
              <ChevronRight size={14} className="text-text-muted" />
            </div>
          </>
        ) : null}
      </Link>
    </div>
  );
}
