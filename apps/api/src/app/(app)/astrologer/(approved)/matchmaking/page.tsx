'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

interface Client { id: string; name: string; dob: string; }

export default function MatchmakingPage() {
  const [mode, setMode] = useState<'marriage' | 'business'>('marriage');
  const [clients, setClients] = useState<Client[]>([]);
  const [a, setA] = useState<string>('');
  const [b, setB] = useState<string>('');
  const [result, setResult] = useState<null | { score: number; notes: string[] }>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/astrologer/clients').then(r => r.json()).then(d => setClients(d.clients ?? []));
  }, []);

  const pickA = useMemo(() => clients.find(c => c.id === a), [clients, a]);
  const pickB = useMemo(() => clients.find(c => c.id === b), [clients, b]);

  const compute = async () => {
    if (!pickA || !pickB) { toast.error('Pick two clients'); return; }
    if (pickA.id === pickB.id) { toast.error('Pick two different clients'); return; }
    setBusy(true);
    try {
      // Placeholder scorer — wire to the existing Ashtakoot Guna Milan engine in a follow-up.
      // For now: stable, deterministic dummy score derived from DoB hash so the screen functions.
      const seed = Number(pickA.dob.replaceAll('-', '')) + Number(pickB.dob.replaceAll('-', ''));
      const score = ((seed % 70) + 25) / 10; // 2.5..9.4
      const notes = mode === 'marriage'
        ? ['Compatibility analysis: refer to Ashtakoot Guna Milan',
           'Top compatible areas: based on planet placements',
           'Suggested remedies before marriage']
        : ['Partnership strengths: complementary planetary energies',
           'Watch areas: shared dasha exposure',
           'Suggested governance: written agreement, periodic reviews'];
      setResult({ score: Math.round(score * 10) / 10, notes });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <h1 className="j-display text-2xl text-text font-bold mb-2">Matchmaking</h1>
      <p className="text-sm text-text-muted mb-4">Compare two of your clients&apos; charts. Switch between marriage matchmaking and business-partner compatibility.</p>

      <div className="flex gap-2 mb-4">
        <button onClick={() => setMode('marriage')} className={`px-3 py-1.5 rounded-md border text-sm ${mode === 'marriage' ? 'border-accent bg-accent/10 text-text' : 'border-border bg-card text-text-2'}`}>Marriage</button>
        <button onClick={() => setMode('business')} className={`px-3 py-1.5 rounded-md border text-sm ${mode === 'business' ? 'border-accent bg-accent/10 text-text' : 'border-border bg-card text-text-2'}`}>Business Partner</button>
      </div>

      {clients.length < 2 ? (
        <div className="j-card p-6 text-center text-text-muted text-sm">
          Add at least two clients to compare. <Link href="/astrologer/clients/new" className="text-accent no-underline">Add client →</Link>
        </div>
      ) : (
        <div className="j-card p-5 space-y-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Partner 1</label>
            <select value={a} onChange={e => setA(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-text">
              <option value="">Select…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-muted mb-1">Partner 2</label>
            <select value={b} onChange={e => setB(e.target.value)} className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-text">
              <option value="">Select…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button onClick={compute} disabled={busy} className="j-btn j-btn-primary w-full disabled:opacity-60">
            {busy ? 'Computing…' : 'Compare'}
          </button>
        </div>
      )}

      {result && (
        <div className="j-card p-5 mt-4 border-2 border-accent/40">
          <div className="text-xs uppercase tracking-wider text-accent mb-1">{mode === 'marriage' ? 'Marriage' : 'Business'} Compatibility</div>
          <div className="text-4xl font-extrabold text-text mb-1">{result.score} / 10</div>
          <ul className="text-sm text-text-2 space-y-1 mt-3 list-disc list-inside">
            {result.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
          <p className="text-[11px] text-text-muted mt-3">
            v1 uses a placeholder scorer. Full Ashtakoot Guna Milan with planet weights ships in v2.
          </p>
        </div>
      )}
    </div>
  );
}
