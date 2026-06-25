'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface Props {
  customerId: string;
  phone: string | null;
  whatsapp: string | null;
}

/**
 * Click-to-call + click-to-WhatsApp deeplinks. On click we:
 *   1. Immediately insert a pending `interaction_log` row.
 *   2. Open the OS dialer / WhatsApp.
 *   3. When the user returns to the app, show a "log the consultation" modal
 *      that PATCHes the row with duration + tag + body.
 *
 * The pending row guarantees a timeline entry even if the astrologer forgets
 * to fill in the details on return.
 */
export function ContactActions({ customerId, phone, whatsapp }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<{ id: string; kind: 'call' | 'whatsapp' } | null>(null);
  const [duration, setDuration] = useState('');
  const [tag, setTag] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const launch = async (kind: 'call' | 'whatsapp', target: string) => {
    try {
      const res = await fetch('/api/astrologer/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, kind, direction: 'outbound' }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? 'log failed');
      setPending({ id: j.id, kind });
      const tel = target.replace(/\D/g, '');
      window.location.href = kind === 'call' ? `tel:+${tel}` : `https://wa.me/${tel}`;
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saveLog = async () => {
    if (!pending) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/astrologer/interactions/${pending.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duration_sec: duration ? Math.max(0, parseInt(duration, 10) || 0) : undefined,
          tag:  tag.trim() || undefined,
          body: body.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error('save failed');
      toast.success('Logged');
      setPending(null); setDuration(''); setTag(''); setBody('');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        {phone && (
          <button onClick={() => launch('call', phone)} className="j-btn j-btn-secondary flex-1">📞 Call</button>
        )}
        {whatsapp && (
          <button onClick={() => launch('whatsapp', whatsapp)} className="j-btn j-btn-secondary flex-1">💬 WhatsApp</button>
        )}
      </div>

      {pending && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 px-4 py-6">
          <div className="bg-bg border border-border rounded-xl w-full max-w-md p-5">
            <h3 className="text-sm font-bold text-text">Just {pending.kind === 'call' ? 'called' : 'messaged'} — log it?</h3>
            <p className="text-xs text-text-muted mb-3">Duration is in seconds; tag is a one-liner like &quot;Follow-up on Jupiter transit&quot;.</p>
            <input
              value={duration} onChange={e => setDuration(e.target.value.replace(/\D/g, ''))}
              placeholder="Duration (seconds)"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-text mb-2"
              inputMode="numeric"
            />
            <input
              value={tag} onChange={e => setTag(e.target.value)}
              placeholder="Tag (e.g. Follow-up on Jupiter transit)"
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-text mb-2"
            />
            <textarea
              value={body} onChange={e => setBody(e.target.value)}
              placeholder="Outcome notes (optional)"
              rows={3}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-text mb-3"
            />
            <div className="flex gap-2">
              <button onClick={() => { setPending(null); router.refresh(); }} className="j-btn j-btn-secondary">Skip</button>
              <button onClick={saveLog} disabled={saving} className="j-btn j-btn-primary flex-1 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
