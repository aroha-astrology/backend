'use client';

import { useMemo } from 'react';

interface InteractionRow {
  id: string;
  kind: 'call' | 'whatsapp' | 'message' | 'note' | 'ai_consultation' | 'in_person';
  direction?: 'outbound' | 'inbound' | null;
  duration_sec?: number | null;
  tag?: string | null;
  body?: string | null;
  fee_rs?: number | null;
  occurred_at: string;
}

const KIND_META: Record<InteractionRow['kind'], { label: string; emoji: string; ring: string }> = {
  call:             { label: 'Call',            emoji: '📞', ring: 'ring-blue-400/60'    },
  whatsapp:         { label: 'WhatsApp',         emoji: '💬', ring: 'ring-emerald-400/60' },
  message:          { label: 'Message',          emoji: '✉️', ring: 'ring-purple-400/60'  },
  note:             { label: 'Note',             emoji: '📝', ring: 'ring-amber-400/60'   },
  ai_consultation:  { label: 'AI Consultation',  emoji: '🤖', ring: 'ring-pink-400/60'   },
  in_person:        { label: 'Walk-in Session',  emoji: '🏛️', ring: 'ring-gold-400/60'   },
};

function formatBucket(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (days === 0) {
    const hours = (today.getTime() - d.getTime()) / 3600000;
    return hours < 3 ? 'Today' : 'Earlier Today';
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function formatDuration(sec: number | null | undefined) {
  if (!sec) return null;
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function InteractionTimeline({ interactions }: { interactions: InteractionRow[] }) {
  const grouped = useMemo(() => {
    const out: Record<string, InteractionRow[]> = {};
    for (const i of interactions) {
      const b = formatBucket(i.occurred_at);
      out[b] = out[b] ?? [];
      out[b].push(i);
    }
    return out;
  }, [interactions]);

  if (interactions.length === 0) {
    return (
      <div className="j-card p-6 text-center text-text-muted text-sm">
        No interactions yet. Call or WhatsApp this client and you&apos;ll be prompted to log it here.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {Object.entries(grouped).map(([bucket, rows]) => (
        <div key={bucket}>
          <div className="text-xs uppercase tracking-wider text-text-muted mb-2 pl-1">{bucket}</div>
          <div className="space-y-2 relative pl-6">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-border" />
            {rows.map(r => {
              const meta = KIND_META[r.kind];
              return (
                <div key={r.id} className="relative">
                  <div className={`absolute -left-[20px] top-1 w-5 h-5 rounded-full bg-card ring-2 ${meta.ring} flex items-center justify-center text-[10px]`}>
                    {meta.emoji}
                  </div>
                  <div className="j-card p-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-text">{meta.label}</div>
                        <div className="text-xs text-text-muted">{new Date(r.occurred_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {r.duration_sec ? <div className="text-xs text-text">{formatDuration(r.duration_sec)}</div> : null}
                        {r.fee_rs ? <div className="text-xs text-emerald-400 font-semibold">₹{r.fee_rs}</div> : null}
                        {r.tag ? <div className="text-[11px] text-accent">{r.tag}</div> : null}
                      </div>
                    </div>
                    {r.body && <div className="text-xs text-text-2 mt-1.5">{r.body}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
