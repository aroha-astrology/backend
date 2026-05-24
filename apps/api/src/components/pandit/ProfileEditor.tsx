'use client';

import { useState, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { uploadImage } from '@/lib/storage/uploadImage';
import { PANDIT_LANGUAGES } from '@/lib/puja/cities';

interface ProfileRow {
  user_id: string;
  display_name: string;
  photo_url: string | null;
  city_label: string;
  temple_name: string | null;
  languages: string[];
  specialisations: string[];
  years_experience: number | null;
}

interface Props {
  userId: string;
  profile: ProfileRow;
  pujas: { slug: string; name_en: string; name_sanskrit: string; deity: string }[];
}

export function ProfileEditor({ userId, profile, pujas }: Props) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [templeName, setTempleName] = useState(profile.temple_name ?? '');
  const [photoUrl, setPhotoUrl] = useState<string | null>(profile.photo_url);
  const [languages, setLanguages] = useState<string[]>(profile.languages);
  const [years, setYears] = useState<number>(profile.years_experience ?? 0);
  const [selected, setSelected] = useState<Set<string>>(new Set(profile.specialisations));
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return pujas;
    return pujas.filter(p =>
      p.name_en.toLowerCase().includes(q) ||
      p.deity.toLowerCase().includes(q) ||
      p.slug.includes(q),
    );
  }, [pujas, search]);

  const togglePuja = (slug: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const handlePhoto = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadImage(supabase, 'pandit-profiles', `${userId}.jpg`, file);
      setPhotoUrl(url);
      toast.success('Photo updated — save to apply');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from('pandit_profiles')
        .update({
          display_name: displayName.trim(),
          temple_name: templeName.trim() || null,
          photo_url: photoUrl,
          languages,
          specialisations: Array.from(selected),
          years_experience: years,
        })
        .eq('user_id', userId);
      if (error) throw error;
      toast.success('Profile saved');
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Photo + identity */}
      <div className="j-card p-5">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={() => fileRef.current?.click()} className="w-20 h-20 rounded-full overflow-hidden border border-border bg-card flex items-center justify-center">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl">📷</span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handlePhoto(f); }} />
          <button onClick={() => fileRef.current?.click()} className="text-accent text-sm" disabled={uploading}>
            {uploading ? 'Uploading…' : 'Change photo'}
          </button>
        </div>

        <label className="block text-xs text-text-muted mb-1">Display name</label>
        <input value={displayName} onChange={e => setDisplayName(e.target.value)}
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-text mb-3" />

        <label className="block text-xs text-text-muted mb-1">Temple name (optional)</label>
        <input value={templeName} onChange={e => setTempleName(e.target.value)}
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-text mb-3" />

        <label className="block text-xs text-text-muted mb-1">City</label>
        <div className="text-text text-sm">{profile.city_label}</div>

        <label className="block text-xs text-text-muted mb-1 mt-3">Years experience</label>
        <input type="number" min={0} max={80} value={years} onChange={e => setYears(Math.max(0, Math.min(80, Number(e.target.value))))}
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-text" />
      </div>

      {/* Languages */}
      <div className="j-card p-5">
        <h2 className="text-sm font-bold text-text mb-3">Languages</h2>
        <div className="flex flex-wrap gap-2">
          {PANDIT_LANGUAGES.map(l => (
            <button key={l}
              onClick={() => setLanguages(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])}
              className={`px-3 py-1.5 rounded-full border text-xs transition ${
                languages.includes(l) ? 'border-accent bg-accent/10 text-text' : 'border-border bg-card text-text-2'
              }`}>{l}</button>
          ))}
        </div>
      </div>

      {/* Specialisations */}
      <div className="j-card p-5">
        <h2 className="text-sm font-bold text-text mb-2">Specialisations ({selected.size})</h2>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search pujas…"
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-text text-sm mb-3" />
        <div className="max-h-[40vh] overflow-y-auto pr-1 space-y-1">
          {filtered.map(p => (
            <button key={p.slug} onClick={() => togglePuja(p.slug)}
              className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition ${
                selected.has(p.slug) ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/40'
              }`}>
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                selected.has(p.slug) ? 'border-accent bg-accent text-bg' : 'border-border'
              }`}>{selected.has(p.slug) && <span className="text-[10px]">✓</span>}</div>
              <span className="text-sm text-text">{p.name_en}</span>
              <span className="text-xs text-text-muted ml-auto">{p.deity}</span>
            </button>
          ))}
        </div>
      </div>

      <button onClick={save} disabled={busy} className="j-btn j-btn-primary w-full disabled:opacity-60">
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
