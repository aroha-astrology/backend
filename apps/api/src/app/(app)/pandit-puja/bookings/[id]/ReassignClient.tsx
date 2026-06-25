'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PANDIT_CITIES } from '@/lib/puja/cities';

interface Pandit {
  id: string;
  name: string;
  photo_url: string | null;
  rating: number | null;
  years_experience: number | null;
  languages: string[];
  source: 'seed' | 'self';
}

interface Props {
  bookingId: string;
  pujaSlug: string;
  defaultCity: string;
  excludeIds: string[];
  declineMessage: string | null;
}

export function ReassignClient({ bookingId, pujaSlug, defaultCity, excludeIds, declineMessage }: Props) {
  const router = useRouter();
  const [city, setCity] = useState(defaultCity);
  const [pandits, setPandits] = useState<Pandit[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    const exclude = excludeIds.length > 0 ? `&exclude=${excludeIds.join(',')}` : '';
    fetch(`/api/pandit-puja/pandits?city=${city}&puja_slug=${pujaSlug}${exclude}`)
      .then(r => r.json())
      .then(d => setPandits(d.pandits ?? []))
      .catch(() => setPandits([]))
      .finally(() => setLoading(false));
  }, [city, pujaSlug, excludeIds]);

  const pickPandit = async (p: Pandit) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/puja-bookings/${bookingId}/reassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pandit_id: p.id, pandit_source: p.source }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? 'Reassignment failed');
      }
      toast.success('New pandit notified');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="j-card p-5 border-2 border-orange-500/40">
      <h2 className="text-sm font-bold text-text mb-2">Pick a replacement pandit</h2>
      {declineMessage && (
        <div className="text-sm text-text-2 italic mb-3 p-3 bg-card/50 rounded-lg">
          &ldquo;{declineMessage}&rdquo;
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {PANDIT_CITIES.map(c => (
          <button key={c.slug} onClick={() => setCity(c.slug)}
            className={`px-3 py-1.5 rounded-lg border text-xs text-left ${
              city === c.slug ? 'border-accent bg-accent/10 text-text' : 'border-border bg-card text-text-2'
            }`}>{c.label}</button>
        ))}
      </div>
      {loading ? (
        <div className="text-center py-4 text-text-muted text-sm">Loading pandits…</div>
      ) : pandits.length === 0 ? (
        <div className="text-center py-4 text-text-muted text-sm">No other pandits available for this puja in {city}. Try another city.</div>
      ) : (
        <div className="space-y-2">
          {pandits.map(p => (
            <button key={p.id} onClick={() => pickPandit(p)} disabled={busy}
              className="w-full j-card p-3 flex items-center gap-3 text-left hover:border-accent/40 disabled:opacity-50">
              <div className="w-10 h-10 rounded-full bg-card overflow-hidden flex items-center justify-center flex-shrink-0">
                {p.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                ) : (<span>🧘</span>)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text truncate">{p.name}</div>
                <div className="text-xs text-text-muted">
                  {p.years_experience ? `${p.years_experience} yrs` : '—'} · {(p.languages ?? []).slice(0, 2).join(', ')}
                </div>
              </div>
              {p.rating && <div className="text-xs text-accent font-semibold flex-shrink-0">★ {p.rating.toFixed(1)}</div>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
