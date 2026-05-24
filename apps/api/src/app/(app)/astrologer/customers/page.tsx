'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

interface Customer {
  id: string;
  name: string;
  dob: string;
  birth_time: string | null;
  birth_place: string | null;
  gender: string | null;
  notes: string | null;
  created_at: string;
}

interface Profile {
  customer_limit: number;
  astro_status: string;
}

export default function AstrologerCustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  // Add form state
  const [form, setForm] = useState({ name: '', dob: '', birth_time: '', birth_place: '', gender: '', notes: '' });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const load = useCallback(async () => {
    try {
      const [me, cust] = await Promise.all([
        fetch('/api/user/me').then(r => r.json()),
        fetch('/api/astrologer/customers').then(r => r.json()),
      ]);
      if (!me?.data) { router.replace('/login'); return; }
      if (me.data.astro_status !== 'approved') { router.replace('/astrologer/pending'); return; }
      setProfile({ customer_limit: me.data.customer_limit, astro_status: me.data.astro_status });
      setCustomers(cust?.data ?? []);
    } catch { router.replace('/login'); }
    finally { setLoading(false); }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!form.name || !form.dob) { setAddError('Name and date of birth are required'); return; }
    setAdding(true); setAddError('');
    try {
      const res = await fetch('/api/astrologer/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 403 && json.error?.includes('limit')) {
          setAddError('Client limit reached. Upgrade your plan.');
        } else {
          setAddError(json.error ?? 'Failed to add client');
        }
        return;
      }
      setCustomers(prev => [json.data, ...prev]);
      setShowAdd(false);
      setForm({ name: '', dob: '', birth_time: '', birth_place: '', gender: '', notes: '' });
    } catch { setAddError('Network error'); }
    finally { setAdding(false); }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this client?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/astrologer/customers/${id}`, { method: 'DELETE' });
      setCustomers(prev => prev.filter(c => c.id !== id));
    } catch { /* ignore */ }
    finally { setDeleting(null); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <p className="text-text-secondary text-sm">Loading…</p>
      </div>
    );
  }

  const used = customers.length;
  const limit = profile?.customer_limit ?? 0;
  const atLimit = used >= limit;

  return (
    <div className="min-h-screen bg-bg px-4 py-6 pb-24">
      <div className="max-w-lg mx-auto flex flex-col gap-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <Link href="/astrologer/dashboard" className="text-xs text-text-secondary no-underline mb-1 block">← Dashboard</Link>
            <h1 className="text-lg font-extrabold text-text font-[family-name:var(--font-serif)]">Clients</h1>
            <p className="text-xs text-text-secondary mt-0.5">{used} of {limit} slots used</p>
          </div>
          {atLimit ? (
            <Link
              href="/astrologer/upgrade"
              className="px-3 py-2 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/25 text-[var(--accent)] text-xs font-bold no-underline"
            >
              Upgrade
            </Link>
          ) : (
            <button
              onClick={() => setShowAdd(true)}
              className="px-3 py-2 rounded-lg bg-primary text-bg text-xs font-bold border-none cursor-pointer hover:opacity-90 transition-opacity"
            >
              + Add Client
            </button>
          )}
        </div>

        {/* Add client form */}
        <AnimatePresence>
          {showAdd && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-surface border border-border rounded-xl px-4 py-4 flex flex-col gap-3"
            >
              <p className="text-xs font-bold text-text-secondary uppercase tracking-widest">New Client</p>
              {addError && <p className="text-xs text-red-400">{addError}</p>}
              {[
                { key: 'name', label: 'Full Name *', type: 'text', placeholder: 'e.g. Arjun Sharma' },
                { key: 'dob', label: 'Date of Birth *', type: 'date', placeholder: '' },
                { key: 'birth_time', label: 'Time of Birth', type: 'time', placeholder: '' },
                { key: 'birth_place', label: 'Place of Birth', type: 'text', placeholder: 'e.g. Mumbai, Maharashtra' },
              ].map(({ key, label, type, placeholder }) => (
                <div key={key}>
                  <label className="text-[11px] text-text-secondary font-semibold block mb-1">{label}</label>
                  <input
                    type={type}
                    value={form[key as keyof typeof form]}
                    placeholder={placeholder}
                    onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-text text-sm outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="text-[11px] text-text-secondary font-semibold block mb-1">Gender</label>
                <select
                  value={form.gender}
                  onChange={e => setForm(prev => ({ ...prev, gender: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-text text-sm outline-none cursor-pointer"
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-text-secondary font-semibold block mb-1">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any notes about this client…"
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-text text-sm outline-none resize-none"
                />
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => { setShowAdd(false); setAddError(''); }}
                  className="flex-1 py-2.5 rounded-lg bg-white/[0.05] border border-border text-text-secondary text-xs font-bold cursor-pointer border-solid hover:bg-white/[0.08]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdd}
                  disabled={adding}
                  className="flex-1 py-2.5 rounded-lg bg-primary text-bg text-xs font-bold border-none cursor-pointer disabled:opacity-60 hover:opacity-90"
                >
                  {adding ? 'Adding…' : 'Add Client'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Limit warning */}
        {atLimit && (
          <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/25 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-xs text-[var(--accent)] font-semibold m-0">Client limit reached</p>
            <Link href="/astrologer/upgrade" className="text-xs text-[var(--accent)] font-bold no-underline">Upgrade →</Link>
          </div>
        )}

        {/* Clients list */}
        {customers.length === 0 ? (
          <div className="bg-surface border border-border rounded-xl p-10 text-center">
            <p className="text-3xl mb-2">👥</p>
            <p className="text-text-secondary text-sm">No clients yet. Add your first one.</p>
          </div>
        ) : (
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            {customers.map((c, i) => (
              <div
                key={c.id}
                className={`px-4 py-3.5 flex items-center justify-between ${i < customers.length - 1 ? 'border-b border-white/[0.04]' : ''}`}
              >
                <div>
                  <p className="text-sm font-semibold text-text m-0">{c.name}</p>
                  <p className="text-xs text-text-secondary mt-0.5">
                    {new Date(c.dob).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {c.birth_place ? ` · ${c.birth_place}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Link href={`/astrologer/customers/${c.id}`} className="text-xs text-primary no-underline font-semibold">
                    View
                  </Link>
                  <button
                    onClick={() => handleDelete(c.id)}
                    disabled={deleting === c.id}
                    className="text-xs text-red-400 bg-transparent border-none cursor-pointer disabled:opacity-40 hover:text-red-300"
                  >
                    {deleting === c.id ? '…' : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
