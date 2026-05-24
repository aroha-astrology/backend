'use client';

// Name Correction page — reads pre-generated insight from /api/insights/name_correction
// and renders it. Never triggers generation; the queue does that in background
// after onboarding (and on backfill via /api/cron/auto-generate).

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { WisdomLoader } from '@/components/ui/wisdom-loader';

type Suggestion = {
  variant: string;
  chaldean: number;
  change: string;
  pros: string[];
  cons: string[];
  best_for: string;
};

type Insight = {
  headline: string;
  what_your_name_carries: {
    money: string;
    relationships: string;
    energy_and_health: string;
    what_it_blocks: string;
  };
  your_target_number: { number: number; why_it_suits_you: string };
  suggestions: Suggestion[];
  implementation_playbook: { legal: string; signature_and_branding: string; social_and_email: string };
  lucky_in_daily_life: { dates: number[]; amounts: string; addresses_and_vehicles: string };
  metadata: {
    mulank: number;
    bhagyank: number;
    chaldean: number;
    pythagorean: number;
    soulUrge: number;
    personality: number;
    targets: number[];
    alignment: 'aligned' | 'partially_aligned' | 'misaligned';
  };
};

type FetchState =
  | { kind: 'loading' }
  | { kind: 'pending' }
  | { kind: 'ready'; insight: Insight }
  | { kind: 'no_profile' }
  | { kind: 'error'; message: string };

const POLL_INTERVAL_MS = 3000;

export default function NameCorrectionPage() {
  const [state, setState] = useState<FetchState>({ kind: 'loading' });
  const [copied, setCopied] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInsight = useCallback(async () => {
    try {
      const r = await fetch('/api/insights/lite/name_correction', { credentials: 'include', cache: 'no-store' });
      if (r.status === 401) { setState({ kind: 'error', message: 'Please sign in to view your reading.' }); return; }
      if (!r.ok) { setState({ kind: 'error', message: 'Could not load your reading.' }); return; }
      const json = await r.json() as { status: string; insight?: { content: Insight } };
      if (json.status === 'ready' && json.insight?.content) {
        setState({ kind: 'ready', insight: json.insight.content });
      } else {
        setState({ kind: 'pending' });
      }
    } catch {
      setState({ kind: 'error', message: 'Could not reach the server.' });
    }
  }, []);

  useEffect(() => {
    void fetchInsight();
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, [fetchInsight]);

  // Poll while pending
  useEffect(() => {
    if (state.kind !== 'pending') return;
    pollTimer.current = setTimeout(() => void fetchInsight(), POLL_INTERVAL_MS);
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, [state.kind, fetchInsight]);

  const handleCopy = useCallback(async (variant: string) => {
    try {
      await navigator.clipboard.writeText(variant);
      setCopied(variant);
      setTimeout(() => setCopied(null), 1500);
    } catch { /* ignore */ }
  }, []);

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
          <h1 className="text-2xl font-bold text-text mb-2">Your Name Correction</h1>
          <p className="text-sm text-text-muted mb-8">
            Your reading is being prepared in the background. This happens once per signup — your future visits will be instant.
          </p>
          <Card glass="glass-2" tone="primary" className="p-8 flex justify-center">
            <WisdomLoader section="report" size="lg" />
          </Card>
          <p className="text-xs text-text-muted mt-6">
            If this stays here for more than a few minutes, try refreshing — the queue may need an extra nudge.
          </p>
        </div>
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

  if (state.kind === 'no_profile') {
    return (
      <div className="min-h-screen px-4 py-10 bg-bg flex items-center justify-center">
        <Card glass="glass-2" className="max-w-md text-center">
          <h2 className="text-lg font-bold text-text mb-2">Add your birth details first</h2>
          <p className="text-sm text-text-muted mb-4">Your Name Correction reading uses your name and date of birth from your profile.</p>
          <Link href="/onboarding"><Button variant="primary">Complete onboarding</Button></Link>
        </Card>
      </div>
    );
  }

  const { insight } = state;
  const m = insight.metadata;

  return (
    <div className="min-h-screen bg-bg pb-16">
      <div className="max-w-3xl mx-auto px-4 py-8 lg:py-12">

        {/* Header */}
        <div className="mb-6">
          <Link href="/dashboard" className="text-xs text-text-muted hover:text-text">← Back to dashboard</Link>
          <h1 className="text-2xl lg:text-3xl font-bold text-text mt-3 mb-1">Name Correction</h1>
          <p className="text-sm text-text-muted">A reading of how your name is vibrating today — and the small adjustments that align it with the life you are actually living.</p>
        </div>

        {/* Hero strip — current vs target */}
        <Card glass="glass-2" tone="primary" className="mb-6 j-halo-gold">
          <p className="text-xs uppercase tracking-widest text-text-muted text-center mb-3">Your current vibration</p>
          <div className="flex items-center justify-center gap-6">
            <div className="text-center">
              <div className="j-text-gold" style={{ fontSize: '64px', fontWeight: 800, lineHeight: 1 }}>{m.chaldean}</div>
              <div className="text-[10px] uppercase tracking-widest text-text-muted mt-1">Current</div>
            </div>

            <motion.svg
              width="80" height="40" viewBox="0 0 80 40" fill="none"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}
            >
              <motion.path
                d="M5 20 H 65 M55 10 L 70 20 L 55 30"
                stroke="var(--primary)"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            </motion.svg>

            <div className="text-center">
              <div className="j-text-gold" style={{ fontSize: '64px', fontWeight: 800, lineHeight: 1 }}>{insight.your_target_number.number}</div>
              <div className="text-[10px] uppercase tracking-widest text-text-muted mt-1">Target</div>
            </div>
          </div>
          <p className="text-center text-sm text-text mt-5 leading-relaxed">{insight.headline}</p>
        </Card>

        {/* Numerological signature chips */}
        <div className="mb-6">
          <p className="text-xs uppercase tracking-widest text-text-muted mb-2">Your numerological signature</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-surface border border-border text-text"><span className="text-text-muted">Mulank</span> {m.mulank}</span>
            <span className="px-3 py-1.5 rounded-full bg-surface border border-border text-text"><span className="text-text-muted">Bhagyank</span> {m.bhagyank}</span>
            <span className="px-3 py-1.5 rounded-full bg-surface border border-border text-text"><span className="text-text-muted">Soul Urge</span> {m.soulUrge}</span>
            <span className="px-3 py-1.5 rounded-full bg-surface border border-border text-text"><span className="text-text-muted">Personality</span> {m.personality}</span>
            <span className="px-3 py-1.5 rounded-full bg-surface border border-border text-text"><span className="text-text-muted">Pythagorean</span> {m.pythagorean}</span>
          </div>
        </div>

        {/* What your name carries */}
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted mb-3">What your current name carries</h2>
        <div className="grid gap-3 mb-8">
          {[
            { label: 'In money', text: insight.what_your_name_carries.money },
            { label: 'In relationships', text: insight.what_your_name_carries.relationships },
            { label: 'In energy & health', text: insight.what_your_name_carries.energy_and_health },
            { label: 'What it blocks', text: insight.what_your_name_carries.what_it_blocks },
          ].map((s) => (
            <Card key={s.label} glass="glass-2" className="p-5">
              <p className="text-[11px] uppercase tracking-widest text-primary mb-2">{s.label}</p>
              <p className="text-sm text-text leading-relaxed">{s.text}</p>
            </Card>
          ))}
        </div>

        {/* Your target number — tall card */}
        <Card glass="glass-3" tone="primary" className="mb-8 j-halo-gold">
          <p className="text-xs uppercase tracking-widest text-text-muted mb-2">Your target number</p>
          <div className="flex items-baseline gap-3 mb-3">
            <span className="j-text-gold" style={{ fontSize: '48px', fontWeight: 800, lineHeight: 1 }}>{insight.your_target_number.number}</span>
            <span className="text-sm text-text-muted">— the number your day-to-day life is asking for</span>
          </div>
          <p className="text-sm text-text leading-relaxed">{insight.your_target_number.why_it_suits_you}</p>
        </Card>

        {/* Suggested corrections — 5 cards */}
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted mb-3">Suggested spellings — pick the one that fits you</h2>
        <div className="grid gap-3 mb-8">
          {insight.suggestions.map((s, idx) => (
            <Card key={s.variant + idx} glass="glass-2" hover="glow" className="p-5">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">#{idx + 1}</span>
                    <span className="text-[10px] uppercase tracking-widest text-text-muted">{s.best_for}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy(s.variant)}
                    className="j-text-gold text-3xl font-bold hover:opacity-80 transition-opacity text-left"
                    aria-label={`Copy ${s.variant}`}
                  >
                    {s.variant}
                  </button>
                  <p className="text-[11px] text-text-muted mt-1">{s.change}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="j-text-gold text-2xl font-bold leading-none">{s.chaldean}</div>
                  <div className="text-[9px] uppercase tracking-widest text-text-muted">Chaldean</div>
                </div>
              </div>

              {copied === s.variant && (
                <p className="text-[10px] text-primary mb-2">Copied ✓</p>
              )}

              <div className="mt-3">
                <p className="text-[11px] uppercase tracking-widest text-primary mb-1.5">Pros</p>
                <ul className="space-y-1.5">
                  {s.pros.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm text-text leading-snug">
                      <span className="text-primary shrink-0 mt-1">•</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3">
                <p className="text-[11px] uppercase tracking-widest text-text-muted mb-1.5">Cons</p>
                <ul className="space-y-1.5">
                  {s.cons.map((c, i) => (
                    <li key={i} className="flex gap-2 text-sm text-text leading-snug">
                      <span className="text-text-muted shrink-0 mt-1">○</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ))}
        </div>

        {/* Implementation playbook */}
        <h2 className="text-sm font-bold uppercase tracking-widest text-text-muted mb-3">How to roll it in</h2>
        <div className="grid gap-3 mb-8 md:grid-cols-3">
          {[
            { label: 'Legal records', text: insight.implementation_playbook.legal },
            { label: 'Signature & branding', text: insight.implementation_playbook.signature_and_branding },
            { label: 'Social & email', text: insight.implementation_playbook.social_and_email },
          ].map((s) => (
            <Card key={s.label} glass="glass-2" className="p-4">
              <p className="text-[10px] uppercase tracking-widest text-primary mb-2">{s.label}</p>
              <p className="text-sm text-text leading-snug">{s.text}</p>
            </Card>
          ))}
        </div>

        {/* Lucky in daily life */}
        <Card glass="glass-2" className="mb-8 p-5">
          <p className="text-xs uppercase tracking-widest text-text-muted mb-3">Lucky in daily life</p>
          {insight.lucky_in_daily_life.dates.length > 0 && (
            <div className="mb-3">
              <p className="text-[11px] uppercase tracking-widest text-primary mb-1.5">Best dates of the month</p>
              <div className="flex flex-wrap gap-2">
                {insight.lucky_in_daily_life.dates.map((d) => (
                  <span key={d} className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-bold">{d}</span>
                ))}
              </div>
            </div>
          )}
          <p className="text-sm text-text mb-2"><span className="text-text-muted">Amounts —</span> {insight.lucky_in_daily_life.amounts}</p>
          <p className="text-sm text-text"><span className="text-text-muted">Addresses & vehicles —</span> {insight.lucky_in_daily_life.addresses_and_vehicles}</p>
        </Card>

      </div>
    </div>
  );
}
