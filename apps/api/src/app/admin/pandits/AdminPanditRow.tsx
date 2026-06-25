'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface Pandit {
  user_id: string;
  display_name: string;
  photo_url: string | null;
  city_label: string;
  temple_name: string | null;
  languages: string[];
  specialisations: string[];
  years_experience: number | null;
  rating: number | null;
  verified: boolean;
  active: boolean;
  created_at: string;
}

export function AdminPanditRow({ p }: { p: Pandit }) {
  const router = useRouter();
  const [verified, setVerified] = useState(p.verified);
  const [active, setActive] = useState(p.active);
  const [busy, setBusy] = useState(false);

  const update = async (changes: { verified?: boolean; active?: boolean }) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/pandits/${p.user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      });
      if (!res.ok) throw new Error('Failed');
      if (changes.verified !== undefined) setVerified(changes.verified);
      if (changes.active   !== undefined) setActive(changes.active);
      toast.success('Updated');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="j-card p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-card overflow-hidden flex items-center justify-center flex-shrink-0">
          {p.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <span>🧘</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text">{p.display_name}</div>
          <div className="text-xs text-text-muted">
            {p.city_label}{p.temple_name ? ` · ${p.temple_name}` : ''} · {p.years_experience ?? 0} yrs
          </div>
          <div className="text-[11px] text-text-muted mt-1">
            {p.specialisations.length} pujas · {p.languages.join(', ')}
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end">
          <Toggle label="Verified" on={verified} disabled={busy} onChange={v => update({ verified: v })} />
          <Toggle label="Active"   on={active}   disabled={busy} onChange={v => update({ active: v })} />
        </div>
      </div>
    </div>
  );
}

function Toggle({ label, on, disabled, onChange }: { label: string; on: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!on)} disabled={disabled}
      className={`text-[11px] px-2 py-1 rounded ${on ? 'bg-emerald-500/15 text-emerald-400' : 'bg-card text-text-muted'}`}>
      {on ? '✓' : '○'} {label}
    </button>
  );
}
