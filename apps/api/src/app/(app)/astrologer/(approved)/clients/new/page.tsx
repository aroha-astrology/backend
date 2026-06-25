'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';

export default function NewClientPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name:        '',
    dob:         '',
    birth_time:  '',
    birth_place: '',
    gender:      '' as '' | 'male' | 'female' | 'other',
    phone:       '',
    whatsapp:    '',
    email:       '',
    notes:       '',
  });

  const update = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.name.trim() || !form.dob) { toast.error('Name and date of birth are required'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/astrologer/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          birth_time:  form.birth_time || null,
          birth_place: form.birth_place || null,
          gender:      form.gender || null,
          phone:       form.phone || null,
          whatsapp:    form.whatsapp || null,
          email:       form.email || null,
          notes:       form.notes || null,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        if (j.error === 'LIMIT_REACHED') { toast.error(j.detail ?? 'Plan limit reached'); router.push('/astrologer/upgrade'); return; }
        throw new Error(j.error ?? 'create failed');
      }
      toast.success('Client added');
      router.push(`/astrologer/clients/${j.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-6 max-w-xl mx-auto">
      <Link href="/astrologer/clients" className="text-text-muted text-sm no-underline">← Clients</Link>
      <h1 className="j-display text-2xl text-text font-bold mt-3 mb-4">Add New Client</h1>

      <div className="j-card p-5 space-y-3">
        <Field label="Full name *" value={form.name} onChange={v => update('name', v)} placeholder="Priya Mehta" />
        <Field label="Date of birth *" value={form.dob} onChange={v => update('dob', v)} placeholder="YYYY-MM-DD" />
        <Field label="Time of birth" value={form.birth_time} onChange={v => update('birth_time', v)} placeholder="14:30" />
        <Field label="Place of birth" value={form.birth_place} onChange={v => update('birth_place', v)} placeholder="Mumbai, India" />
        <div>
          <label className="block text-xs text-text-muted mb-1">Gender</label>
          <div className="flex gap-2">
            {(['male', 'female', 'other'] as const).map(g => (
              <button key={g} onClick={() => update('gender', g)}
                className={`px-3 py-1.5 rounded-md border text-sm ${
                  form.gender === g ? 'border-accent bg-accent/10 text-text' : 'border-border bg-card text-text-2'
                }`}>{g}</button>
            ))}
          </div>
        </div>
        <Field label="Phone" value={form.phone} onChange={v => update('phone', v)} placeholder="+91…" />
        <Field label="WhatsApp" value={form.whatsapp} onChange={v => update('whatsapp', v)} placeholder="+91…" />
        <Field label="Email" value={form.email} onChange={v => update('email', v)} placeholder="priya@example.com" />
        <div>
          <label className="block text-xs text-text-muted mb-1">Notes (problem type / focus)</label>
          <textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={3}
            placeholder="e.g. delayed marriage, career change considerations"
            className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-text" />
        </div>
      </div>

      <button onClick={submit} disabled={busy} className="j-btn j-btn-primary w-full mt-4 disabled:opacity-60">
        {busy ? 'Saving…' : 'Add client'}
      </button>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm text-text" />
    </div>
  );
}
