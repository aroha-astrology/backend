'use client';

// Mobile Numerology page — reads pre-generated insight from
// /api/insights/mobile_numerology and renders it. Never triggers generation.
// If users.phone is null at queue time, the handler skips silently — the page
// then shows a "no row + no phone" empty state asking the user to add a phone.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WisdomLoader } from '@/components/ui/wisdom-loader';

type Verdict = 'powerful' | 'supportive' | 'neutral' | 'draining';

type Insight = {
  headline: string;
  decoded: string;
  how_this_number_behaves: { money: string; career: string; relationships: string };
  harmony_with_you: string;
  verdict_and_next_step: string;
  lucky_digits_to_keep_an_eye_on: number[];
  metadata: {
    vibration: number;
    mulank: number;
    bhagyank: number;
    lastFour: string;
    lastDigit: number;
    harmony: number;
    verdict: Verdict;
    digitFrequency: Record<string, number>;
    friendlyDigits: number[];
    enemyDigits: number[];
  };
};

type FetchState =
  | { kind: 'loading' }
  | { kind: 'pending' }
  | { kind: 'ready'; insight: Insight }
  | { kind: 'no_phone' }
  | { kind: 'error'; message: string };

const POLL_INTERVAL_MS = 3000;
const PENDING_GRACE_MS = 90_000;   // after this long pending, show "no_phone" hint

const VERDICT_BADGE: Record<Verdict, { label: string; tone: string }> = {
  powerful:   { label: 'Powerful',   tone: 'bg-primary/15 border-primary/40 text-primary' },
  supportive: { label: 'Supportive', tone: 'bg-primary/10 border-primary/30 text-primary' },
  neutral:    { label: 'Neutral',    tone: 'bg-surface border-border text-text' },
  draining:   { label: 'Draining',   tone: 'bg-surface-2 border-border text-text-muted' },
};

export default function MobileNumerologyPage() {
  const [state, setState] = useState<FetchState>({ kind: 'loading' });
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSince = useRef<number | null>(null);

  const fetchInsight = useCallback(async () => {
    try {
      const r = await fetch('/api/insights/lite/mobile_numerology', { credentials: 'include', cache: 'no-store' });
      if (r.status === 401) { setState({ kind: 'error', message: 'Please sign in to view your reading.' }); return; }
      if (!r.ok) { setState({ kind: 'error', message: 'Could not load your reading.' }); return; }
      const json = await r.json() as { status: string; insight?: { content: Insight } };
      if (json.status === 'ready' && json.insight?.content) {
        setState({ kind: 'ready', insight: json.insight.content });
        pendingSince.current = null;
      } else {
        // If we've been pending for a while, the most likely reason is that
        // users.phone was null at queue time — surface the empty state.
        if (pendingSince.current == null) pendingSince.current = Date.now();
        const stuck = Date.now() - pendingSince.current > PENDING_GRACE_MS;
        setState(stuck ? { kind: 'no_phone' } : { kind: 'pending' });
      }
    } catch {
      setState({ kind: 'error', message: 'Could not reach the server.' });
    }
  }, []);

  useEffect(() => {
    void fetchInsight();
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, [fetchInsight]);

  useEffect(() => {
    if (state.kind !== 'pending') return;
    pollTimer.current = setTimeout(() => void fetchInsight(), POLL_INTERVAL_MS);
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, [state.kind, fetchInsight]);

  if (state.kind === 'loading') {
    return (
      <div className="min-h-screen px-4 py-10 flex items-center justify-center bg-bg">
        <WisdomLoader section="report" />
      </div>
    );
  }

  if (state.kind === 'pending') {
    return (
      <div className="min-h-screen px-4 py-10 bg-bg">
        <div className="max-w-2xl mx-auto text-center">
          <h1 className="text-2xl font-bold text-text mb-2">Your Mobile Numerology</h1>
          <p className="text-sm text-text-muted mb-8">
            Your reading is being prepared in the background. This happens once per signup — future visits are instant.
          </p>
          <Card glass="glass-2" tone="primary" className="p-8 flex justify-center">
            <WisdomLoader section="report" size="lg" />
          </Card>
        </div>
      </div>
    );
  }

  if (state.kind === 'no_phone') {
    return (
      <div className="min-h-screen px-4 py-10 bg-bg flex items-center justify-center">
        <Card glass="glass-2" tone="primary" className="max-w-md text-center j-halo-gold">
          <h2 className="text-lg font-bold text-text mb-2">Add a phone number to your account first</h2>
          <p className="text-sm text-text-muted mb-5">This reading is built from your registered mobile number. The moment you add one, the reading unlocks here.</p>
          <Link href="/settings/account"><Button variant="primary">Add phone number</Button></Link>
        </Card>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="min-h-screen px-4 py-10 bg-bg flex items-center justify-center">
        <Card glass="glass-2" className="max-w-md text-center">
          <p className="text-text mb-4">{state.message}</p>
          <Button variant="primary" onClick={() => { setState({ kind: 'loading' }); void fetchInsight(); }}>
            Try again
          </Button>
        </Card>
      </div>
    );
  }

  const { insight } = state;
  const m = insight.metadata;
  const badge = VERDICT_BADGE[m.verdict];

  return (
    <div className="min-h-screen bg-bg pb-16">
      <div className="max-w-3xl mx-auto px-4 py-8 lg:py-12">

        <div className="mb-6">
          <Link href="/dashboard" className="text-xs text-text-muted hover:text-text">← Back to dashboard</Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-text mt-3 mb-1">Mobile Numerology</h1>
          <p className="text-sm text-text-muted">A reading of the number you use every day — and the chemistry it carries with the way your life is wired.</p>
        </div>

        {/* Hero — last four + verdict */}
        <Card glass="glass-2" tone="primary" className="mb-6 j-halo-gold text-center">
          <p className="text-xs uppercase tracking-widest text-text-muted mb-3">Number you use every day</p>
          <div className="flex items-baseline justify-center gap-1.5 mb-3">
            <span className="text-text-muted text-2xl font-bold">···</span>
            <span className="j-text-gold" style={{ fontSize: '56px', fontWeight: 800, lineHeight: 1, letterSpacing: '0.06em' }}>{m.lastFour}</span>
          </div>
          <div className="inline-flex items-center gap-2">
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${badge.tone}`}>{badge.label}</span>
            <span className="text-xs text-text-muted">harmony {m.harmony}/10</span>
          </div>
          <p className="text-sm text-text mt-5 leading-relaxed">{insight.headline}</p>
        </Card>

        {/* Decoded — digits → total → vibration + frequency strip */}
        <Card glass="glass-2" className="mb-6 p-5">
          <p className="text-xs uppercase tracking-widest text-text-muted mb-3">Decoded</p>
          <p className="text-sm text-text leading-relaxed mb-4">{insight.decoded}</p>

          <div>
            <p className="text-[11px] uppercase tracking-widest text-primary mb-2">Digit frequency in this number</p>
            <div className="flex items-center gap-1.5">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
                const present = (m.digitFrequency[String(d)] ?? 0) > 0;
                return (
                  <div key={d} className="flex flex-col items-center gap-1">
                    <span
                      className="w-3 h-3 rounded-full transition-all"
                      style={{
                        background: present ? 'var(--primary)' : 'var(--surface-2)',
                        boxShadow: present ? '0 0 8px var(--glow, rgba(212,175,55,0.35))' : 'none',
                        border: present ? '1px solid rgba(212,175,55,0.5)' : '1px solid var(--border)',
                      }}
                    />
                    <span className="text-[9px] text-text-muted">{d}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Numerological signature */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-widest text-text-muted mb-2">Your numerological signature</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-surface border border-border text-text"><span className="text-text-muted">Mulank</span> {m.mulank}</span>
            <span className="px-3 py-1.5 rounded-full bg-surface border border-border text-text"><span className="text-text-muted">Bhagyank</span> {m.bhagyank}</span>
            <span className="px-3 py-1.5 rounded-full bg-surface border border-border text-text"><span className="text-text-muted">Vibration</span> {m.vibration}</span>
            <span className="px-3 py-1.5 rounded-full bg-surface border border-border text-text"><span className="text-text-muted">Last digit</span> {m.lastDigit}</span>
          </div>
        </div>

        {/* How this number behaves */}
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted mb-3">How this number behaves</h2>
        <div className="grid gap-3 mb-8 md:grid-cols-3">
          {[
            { label: 'In money', text: insight.how_this_number_behaves.money },
            { label: 'In career', text: insight.how_this_number_behaves.career },
            { label: 'In relationships', text: insight.how_this_number_behaves.relationships },
          ].map((s) => (
            <Card key={s.label} glass="glass-2" className="p-4">
              <p className="text-[11px] uppercase tracking-widest text-primary mb-2">{s.label}</p>
              <p className="text-sm text-text leading-snug">{s.text}</p>
            </Card>
          ))}
        </div>

        {/* Harmony with you */}
        <Card glass="glass-3" tone="primary" className="mb-6 j-halo-gold">
          <p className="text-xs uppercase tracking-widest text-text-muted mb-2">Harmony with you</p>
          <p className="text-sm text-text leading-relaxed">{insight.harmony_with_you}</p>
        </Card>

        {/* What to do next */}
        <Card glass="glass-2" className="mb-6 p-5">
          <p className="text-xs uppercase tracking-widest text-primary mb-2">What to do next</p>
          <p className="text-sm text-text leading-relaxed">{insight.verdict_and_next_step}</p>
        </Card>

        {/* Lucky digits */}
        {insight.lucky_digits_to_keep_an_eye_on.length > 0 && (
          <Card glass="glass-2" className="mb-6 p-5">
            <p className="text-xs uppercase tracking-widest text-text-muted mb-3">Friendly digits to keep an eye on</p>
            <div className="flex flex-wrap gap-2">
              {insight.lucky_digits_to_keep_an_eye_on.map((d) => (
                <span key={d} className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-bold">{d}</span>
              ))}
            </div>
            <p className="text-[11px] text-text-muted mt-3">Use them where you have a choice — apartment number, vehicle plate, office desk, dates for big decisions.</p>
          </Card>
        )}

      </div>
    </div>
  );
}
