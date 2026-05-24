'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

interface Branding {
  brand_name:    string | null;
  logo_url:      string | null;
  tagline:       string | null;
  primary_color: string | null;
  phone:         string | null;
  email:         string | null;
  address:       string | null;
  website:       string | null;
  pdf_footer:    string | null;
}

interface Profile { id: string; name: string; caller_id: string | null; is_default: boolean; }

const DEFAULT_BRANDING: Branding = {
  brand_name: '', logo_url: null, tagline: '', primary_color: '#7c3aed',
  phone: '', email: '', address: '', website: '', pdf_footer: '',
};

export default function SettingsPage() {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [savingBranding, setSavingBranding] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [newProfile, setNewProfile] = useState({ name: '', caller_id: '' });
  const [addingProfile, setAddingProfile] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/astrologer/branding').then(r => r.json()).then(d => {
      if (d.branding) setBranding(d.branding);
    });
    fetch('/api/astrologer/profiles').then(r => r.json()).then(d => setProfiles(d.profiles ?? []));
  }, []);

  const updateBranding = (k: keyof Branding, v: string | null) => setBranding(b => ({ ...b, [k]: v }));

  const saveBranding = async () => {
    setSavingBranding(true);
    try {
      const res = await fetch('/api/astrologer/branding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(branding),
      });
      if (!res.ok) throw new Error('Save failed');
      toast.success('Branding saved');
    } catch { toast.error('Failed to save'); }
    finally { setSavingBranding(false); }
  };

  const uploadLogo = async (file: File) => {
    setLogoUploading(true);
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      );
      const ext  = file.name.split('.').pop();
      const path = `logos/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('astrologer-branding').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('astrologer-branding').getPublicUrl(path);
      updateBranding('logo_url', data.publicUrl);
      toast.success('Logo uploaded — save branding to apply');
    } catch { toast.error('Logo upload failed'); }
    finally { setLogoUploading(false); }
  };

  const addProfile = async () => {
    if (!newProfile.name.trim()) { toast.error('Profile name required'); return; }
    setAddingProfile(true);
    try {
      const res = await fetch('/api/astrologer/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProfile.name, caller_id: newProfile.caller_id || null, is_default: profiles.length === 0 }),
      });
      const j = await res.json();
      setProfiles(p => [...p, j]);
      setNewProfile({ name: '', caller_id: '' });
      toast.success('Profile added');
    } catch { toast.error('Failed to add profile'); }
    finally { setAddingProfile(false); }
  };

  const deleteProfile = async (id: string) => {
    await fetch('/api/astrologer/profiles', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    setProfiles(p => p.filter(x => x.id !== id));
    toast.success('Profile deleted');
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
      <h1 className="j-display text-2xl text-text font-bold">Practice Settings</h1>

      {/* Branding */}
      <section className="j-card p-5 space-y-4">
        <h2 className="text-sm font-bold text-text">Branding (White-label)</h2>
        <p className="text-xs text-text-muted -mt-2">Your logo, name, and colors appear on every PDF report.</p>

        {/* Logo */}
        <div>
          <label className="block text-xs text-text-muted mb-2">Logo</label>
          <div className="flex items-center gap-3">
            {branding.logo_url
              ? <img src={branding.logo_url} alt="logo" className="w-14 h-14 rounded-lg object-cover border border-border" />
              : <div className="w-14 h-14 rounded-lg border border-border bg-card flex items-center justify-center text-2xl">🔮</div>
            }
            <div>
              <button onClick={() => fileRef.current?.click()} disabled={logoUploading}
                className="j-btn border border-border text-text-2 text-sm disabled:opacity-60">
                {logoUploading ? 'Uploading…' : 'Upload Logo'}
              </button>
              <p className="text-[10px] text-text-muted mt-1">PNG/JPG, square recommended</p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <BField label="Brand name" value={branding.brand_name ?? ''} onChange={v => updateBranding('brand_name', v)} />
          <BField label="Tagline" value={branding.tagline ?? ''} onChange={v => updateBranding('tagline', v)} />
        </div>

        <div className="flex items-center gap-3">
          <div>
            <label className="block text-xs text-text-muted mb-1">Primary color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={branding.primary_color ?? '#7c3aed'} onChange={e => updateBranding('primary_color', e.target.value)}
                className="w-10 h-10 rounded border border-border bg-card cursor-pointer" />
              <span className="text-sm text-text-2 font-mono">{branding.primary_color ?? '#7c3aed'}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <BField label="Phone" value={branding.phone ?? ''} onChange={v => updateBranding('phone', v)} placeholder="+91…" />
          <BField label="Email" value={branding.email ?? ''} onChange={v => updateBranding('email', v)} />
          <BField label="Website" value={branding.website ?? ''} onChange={v => updateBranding('website', v)} />
          <BField label="Address" value={branding.address ?? ''} onChange={v => updateBranding('address', v)} />
        </div>

        <div>
          <label className="block text-xs text-text-muted mb-1">PDF footer text</label>
          <input value={branding.pdf_footer ?? ''} onChange={e => updateBranding('pdf_footer', e.target.value)}
            placeholder="e.g. For consultations call +91 98…"
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text" />
        </div>

        <button onClick={saveBranding} disabled={savingBranding} className="j-btn j-btn-primary text-sm w-full disabled:opacity-60">
          {savingBranding ? 'Saving…' : 'Save Branding'}
        </button>
      </section>

      {/* Practice Profiles */}
      <section className="j-card p-5 space-y-4">
        <h2 className="text-sm font-bold text-text">Practice Profiles</h2>
        <p className="text-xs text-text-muted -mt-2">Multiple profiles (e.g. &quot;Numerology&quot;, &quot;Vastu&quot;) with separate caller IDs for click-to-call deeplinks.</p>

        {profiles.length > 0 && (
          <div className="space-y-2">
            {profiles.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-2 bg-bg rounded-lg px-3 py-2 border border-border">
                <div>
                  <span className="text-sm text-text font-medium">{p.name}</span>
                  {p.is_default && <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-accent/20 text-accent rounded">default</span>}
                  {p.caller_id && <div className="text-xs text-text-muted">{p.caller_id}</div>}
                </div>
                <button onClick={() => deleteProfile(p.id)} className="text-text-muted hover:text-red-400 text-sm">✕</button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input value={newProfile.name} onChange={e => setNewProfile(x => ({ ...x, name: e.target.value }))}
            placeholder='Profile name (e.g. "Vastu")'
            className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text" />
          <input value={newProfile.caller_id} onChange={e => setNewProfile(x => ({ ...x, caller_id: e.target.value }))}
            placeholder="Caller ID (phone)"
            className="w-36 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text" />
          <button onClick={addProfile} disabled={addingProfile} className="j-btn j-btn-primary text-sm shrink-0 disabled:opacity-60">
            {addingProfile ? '…' : '+ Add'}
          </button>
        </div>
      </section>

      {/* Team */}
      <section className="j-card p-5">
        <h2 className="text-sm font-bold text-text mb-1">Team Permissions</h2>
        <p className="text-xs text-text-muted">Coming soon. Single-seat for now.</p>
      </section>

      {/* Subscription */}
      <section className="j-card p-5">
        <h2 className="text-sm font-bold text-text mb-1">Subscription Plan</h2>
        <Link href="/astrologer/upgrade" className="text-accent text-sm no-underline">Manage your plan →</Link>
      </section>
    </div>
  );
}

function BField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-text-muted mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text" />
    </div>
  );
}
