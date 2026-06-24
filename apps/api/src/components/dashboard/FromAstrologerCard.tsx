'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/store/useStore';
import { RemedyProductCard } from './RemedyProductCard';
import type { FromAstrologerReading } from '@/lib/astrologer/fromAstrologerGenerate';

interface Props {
  chartId: string | null;
  language?: string;
}

type ApiResp =
  | { success: true; status: 'ready'; data: FromAstrologerReading }
  | { success: true; status: 'pending'; revealAt: string }
  | { success: false; error: string };

/**
 * Renders the From-Astrologer daily card at the END of the dashboard.
 *
 * Three states:
 *  - while Apollo's 2-hour review window is open: render nothing (the
 *    AstrologerReviewBanner near the top of the page is the user's signal).
 *  - while we're fetching content the first time: skeleton.
 *  - ready: the card.
 */
export function FromAstrologerCard({ chartId, language = 'en' }: Props) {
  const user = useStore(s => s.user);
  const [state, setState] = useState<
    | { phase: 'loading' }
    | { phase: 'pending' }
    | { phase: 'ready'; data: FromAstrologerReading }
    | { phase: 'hidden' }
  >({ phase: 'loading' });

  const revealAtRaw = user?.apollo_reveal_at ?? null;
  const isWithinReview = revealAtRaw ? new Date(revealAtRaw).getTime() > Date.now() : false;

  useEffect(() => {
    if (!chartId) { setState({ phase: 'hidden' }); return; }
    if (isWithinReview) { setState({ phase: 'pending' }); return; }

    let cancelled = false;
    setState({ phase: 'loading' });

    fetch(`/api/horoscope/from-astrologer?chartId=${chartId}&language=${language}`, {
      credentials: 'include',
    })
      .then(r => r.json() as Promise<ApiResp>)
      .then(json => {
        if (cancelled) return;
        if (json.success && json.status === 'ready') {
          setState({ phase: 'ready', data: json.data });
        } else if (json.success && json.status === 'pending') {
          setState({ phase: 'pending' });
        } else {
          setState({ phase: 'hidden' });
        }
      })
      .catch(() => { if (!cancelled) setState({ phase: 'hidden' }); });

    return () => { cancelled = true; };
  }, [chartId, language, isWithinReview]);

  if (state.phase === 'hidden' || state.phase === 'pending') return null;

  const tomorrowLabel = new Date(Date.now() + 24 * 3600 * 1000).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-2 px-1">
        <p className="j-eyebrow text-warning">— From the Astrologer · Tomorrow —</p>
        <p className="text-[10px] text-text-muted">{tomorrowLabel}</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        {state.phase === 'loading' ? (
          <Skeleton />
        ) : (
          <>
            <p className="text-sm text-text leading-relaxed mb-4">{state.data.greeting}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <Column heading="In your favour" tone="good" items={state.data.good} />
              <Column heading="Tread carefully" tone="bad" items={state.data.bad} />
            </div>

            <div className="rounded-xl bg-warning/10 border border-warning/30 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-warning mb-1">
                Astrologer's remedy
              </p>
              <p className="text-sm font-semibold text-text mb-1">{state.data.remedy.title}</p>
              <p className="text-xs text-text-muted leading-relaxed">{state.data.remedy.description}</p>

              {state.data.remedy.kind === 'product' && state.data.remedy.product && (
                <RemedyProductCard
                  name={state.data.remedy.product.name}
                  description={state.data.remedy.description}
                  googleShoppingQuery={state.data.remedy.product.google_shopping_query}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Column({
  heading,
  tone,
  items,
}: {
  heading: string;
  tone: 'good' | 'bad';
  items: readonly [string, string];
}) {
  const icon = tone === 'good' ? '✦' : '⚠︎';
  const color = tone === 'good' ? 'text-primary' : 'text-warning';
  return (
    <div>
      <p className={`text-[10px] font-semibold uppercase tracking-wide mb-2 ${color}`}>{heading}</p>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li key={idx} className="text-xs text-text leading-relaxed flex gap-2">
            <span className={`${color} shrink-0`}>{icon}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-3 w-3/4 rounded bg-border mb-2" />
      <div className="h-3 w-2/3 rounded bg-border mb-4" />
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="h-2 w-1/2 rounded bg-border mb-2" />
          <div className="h-2 w-full rounded bg-border mb-1" />
          <div className="h-2 w-5/6 rounded bg-border" />
        </div>
        <div>
          <div className="h-2 w-1/2 rounded bg-border mb-2" />
          <div className="h-2 w-full rounded bg-border mb-1" />
          <div className="h-2 w-5/6 rounded bg-border" />
        </div>
      </div>
      <div className="h-16 w-full rounded-xl bg-border/40" />
    </div>
  );
}
