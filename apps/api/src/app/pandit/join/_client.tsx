'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { uploadImage } from '@/lib/storage/uploadImage';
import { PANDIT_CITIES, PANDIT_LANGUAGES } from '@/lib/puja/cities';

interface Puja { slug: string; name_en: string; name_sanskrit: string; deity: string; }

type Step = 'name' | 'location' | 'languages' | 'photo' | 'specialisations' | 'experience' | 'review';
const STEPS: Step[] = ['name', 'location', 'languages', 'photo', 'specialisations', 'experience', 'review'];

const MIN_SPECS = 3;
const MAX_SPECS = 20;

export default function PanditJoinClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [authChecked, setAuthChecked] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('name');
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState('');
  const [templeName, setTempleName] = useState('');
  const [city, setCity] = useState<string>('');
  const [cityLabel, setCityLabel] = useState<string>('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [languages, setLanguages] = useState<string[]>(['Hindi', 'Sanskrit']);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [years, setYears] = useState<number>(5);
  const [pujas, setPujas] = useState<Puja[]>([]);
  const [pujasLoading, setPujasLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pujaSearch, setPujaSearch] = useState('');
  const [alsoAstrologer, setAlsoAstrologer] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthed(!!data.user);
      setUserId(data.user?.id ?? null);
      setAuthChecked(true);
    });
  }, [supabase]);

  useEffect(() => {
    fetch('/api/pandit-puja/pujas')
      .then(r => r.json())
      .then(d => setPujas(d.pujas ?? []))
      .catch(() => setPujas([]))
      .finally(() => setPujasLoading(false));
  }, []);

  const filteredPujas = useMemo(() => {
    const q = pujaSearch.trim().toLowerCase();
    if (!q) return pujas;
    return pujas.filter(p =>
      p.name_en.toLowerCase().includes(q) ||
      p.name_sanskrit.toLowerCase().includes(q) ||
      p.deity.toLowerCase().includes(q) ||
      p.slug.includes(q)
    );
  }, [pujas, pujaSearch]);

  const toggleSpec = (slug: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else if (next.size < MAX_SPECS) next.add(slug);
      else toast.error(`Max ${MAX_SPECS} specialisations`);
      return next;
    });
  };

  const toggleLanguage = (l: string) => {
    setLanguages(prev =>
      prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]
    );
  };

  const handlePhotoSelect = async (file: File) => {
    if (!userId) { toast.error('Please sign in first'); return; }
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setPhotoUploading(true);
    try {
      const url = await uploadImage(
        supabase, 'pandit-profiles', `${userId}.jpg`, file,
      );
      setPhotoUrl(url);
      toast.success('Photo uploaded');
    } catch (e) {
      toast.error('Photo upload failed: ' + (e as Error).message);
    } finally {
      setPhotoUploading(false);
    }
  };

  const goNext = () => {
    // per-step validation
    if (step === 'name') {
      if (displayName.trim().length < 2) { toast.error('Enter your name'); return; }
    }
    if (step === 'location') {
      if (!city) { toast.error('Select your city'); return; }
    }
    if (step === 'languages') {
      if (languages.length === 0) { toast.error('Pick at least one language'); return; }
    }
    if (step === 'specialisations') {
      if (selected.size < MIN_SPECS) { toast.error(`Pick at least ${MIN_SPECS} pujas`); return; }
    }
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) setStep(STEPS[idx + 1]);
  };

  const goBack = () => {
    const idx = STEPS.indexOf(step);
    if (idx > 0) setStep(STEPS[idx - 1]);
  };

  const handleSubmit = async () => {
    if (selected.size < MIN_SPECS) { toast.error(`Pick at least ${MIN_SPECS} pujas`); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/pandit/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name:     displayName.trim(),
          photo_url:        photoUrl,
          city,
          city_label:       cityLabel || PANDIT_CITIES.find(c => c.slug === city)?.label || city,
          temple_name:      templeName.trim() || null,
          address:          address.trim() || null,
          pincode:          pincode.trim() || null,
          languages,
          specialisations:  Array.from(selected),
          years_experience: Number(years) || 0,
          also_astrologer:  alsoAstrologer,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Submission failed');
      toast.success('Welcome to the platform!');
      router.push('/pandit/dashboard');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg px-4">
        <div className="j-card max-w-sm w-full p-8 text-center">
          <div className="text-4xl mb-4">🕉️</div>
          <h1 className="j-display text-2xl text-text font-bold mb-2">Join as a Pandit or Astrologer</h1>
          <p className="text-text-2 text-sm mb-6">
            Sign in first to create your profile and start receiving bookings.
          </p>
          <Link href="/login" className="j-btn j-btn-primary no-underline w-full block mb-3">
            Sign in
          </Link>
          <Link href="/signup" className="text-accent text-sm no-underline">
            New here? Sign up free
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg pb-24">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="text-text-muted text-sm no-underline">← Back</Link>
          <div className="text-xs text-text-muted">
            Step {STEPS.indexOf(step) + 1} of {STEPS.length}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-border rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((STEPS.indexOf(step) + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* STEP — name */}
        {step === 'name' && (
          <div>
            <h1 className="j-display text-2xl text-text font-bold mb-2">What should we call you?</h1>
            <p className="text-text-2 text-sm mb-6">This is how users will see you in the booking flow.</p>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Pandit Manish Jha"
              className="w-full bg-card border border-border rounded-lg px-4 py-3 text-text placeholder-text-muted mb-4"
              autoFocus
            />
            <input
              type="text"
              value={templeName}
              onChange={e => setTempleName(e.target.value)}
              placeholder="Temple name (optional, e.g. Kalighat Mandir)"
              className="w-full bg-card border border-border rounded-lg px-4 py-3 text-text placeholder-text-muted"
            />
          </div>
        )}

        {/* STEP — location */}
        {step === 'location' && (
          <div>
            <h1 className="j-display text-2xl text-text font-bold mb-2">Where are you based?</h1>
            <p className="text-text-2 text-sm mb-6">Users in your city will see you first.</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {PANDIT_CITIES.map(c => (
                <button
                  key={c.slug}
                  onClick={() => { setCity(c.slug); setCityLabel(c.label); }}
                  className={`px-3 py-2 rounded-lg border text-sm text-left transition ${
                    city === c.slug
                      ? 'border-accent bg-accent/10 text-text'
                      : 'border-border bg-card text-text-2 hover:border-accent/50'
                  }`}
                >{c.label}</button>
              ))}
            </div>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Address (optional)"
              className="w-full bg-card border border-border rounded-lg px-4 py-3 text-text placeholder-text-muted mb-3"
            />
            <input
              type="text"
              inputMode="numeric"
              value={pincode}
              onChange={e => setPincode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Pincode (optional)"
              className="w-full bg-card border border-border rounded-lg px-4 py-3 text-text placeholder-text-muted"
            />
          </div>
        )}

        {/* STEP — languages */}
        {step === 'languages' && (
          <div>
            <h1 className="j-display text-2xl text-text font-bold mb-2">Which languages do you speak?</h1>
            <p className="text-text-2 text-sm mb-6">Choose all that apply.</p>
            <div className="flex flex-wrap gap-2">
              {PANDIT_LANGUAGES.map(l => (
                <button
                  key={l}
                  onClick={() => toggleLanguage(l)}
                  className={`px-3 py-2 rounded-full border text-sm transition ${
                    languages.includes(l)
                      ? 'border-accent bg-accent/10 text-text'
                      : 'border-border bg-card text-text-2'
                  }`}
                >{l}</button>
              ))}
            </div>
          </div>
        )}

        {/* STEP — photo */}
        {step === 'photo' && (
          <div>
            <h1 className="j-display text-2xl text-text font-bold mb-2">Add a profile photo</h1>
            <p className="text-text-2 text-sm mb-6">Users see this on your profile and in bookings. Optional but recommended.</p>
            <div className="flex flex-col items-center">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-32 h-32 rounded-full border-2 border-dashed border-border flex items-center justify-center mb-4 overflow-hidden"
              >
                {photoPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-text-muted text-3xl">📷</span>
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoSelect(f); }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-accent text-sm"
                disabled={photoUploading}
              >
                {photoUploading ? 'Uploading…' : photoPreview ? 'Change photo' : 'Upload photo'}
              </button>
            </div>
          </div>
        )}

        {/* STEP — specialisations */}
        {step === 'specialisations' && (
          <div>
            <h1 className="j-display text-2xl text-text font-bold mb-2">Which pujas can you perform?</h1>
            <p className="text-text-2 text-sm mb-4">
              Select {MIN_SPECS}-{MAX_SPECS} pujas you specialise in. Users will see you for these in their city.
            </p>
            <input
              type="text"
              value={pujaSearch}
              onChange={e => setPujaSearch(e.target.value)}
              placeholder="Search pujas, deities, or doshas…"
              className="w-full bg-card border border-border rounded-lg px-4 py-3 text-text placeholder-text-muted mb-3"
            />
            <div className="text-xs text-text-muted mb-3">
              Selected: <span className="text-accent">{selected.size}</span> / {MAX_SPECS}
            </div>
            <div className="max-h-[50vh] overflow-y-auto pr-1 space-y-1">
              {pujasLoading ? (
                <div className="text-center py-8 text-text-muted text-sm">Loading puja catalogue…</div>
              ) : filteredPujas.length === 0 ? (
                <div className="text-center py-8 text-text-muted text-sm">No pujas match &quot;{pujaSearch}&quot;</div>
              ) : (
                filteredPujas.map(p => (
                  <button
                    key={p.slug}
                    onClick={() => toggleSpec(p.slug)}
                    className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition ${
                      selected.has(p.slug)
                        ? 'border-accent bg-accent/10'
                        : 'border-border bg-card hover:border-accent/40'
                    }`}
                  >
                    <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selected.has(p.slug) ? 'border-accent bg-accent text-bg' : 'border-border'
                    }`}>
                      {selected.has(p.slug) && <span className="text-xs leading-none">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text">{p.name_en}</div>
                      <div className="text-xs text-text-muted">{p.name_sanskrit} · {p.deity}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* STEP — experience */}
        {step === 'experience' && (
          <div>
            <h1 className="j-display text-2xl text-text font-bold mb-2">Years of experience</h1>
            <p className="text-text-2 text-sm mb-6">How long have you been performing pujas?</p>
            <input
              type="number"
              value={years}
              onChange={e => setYears(Math.max(0, Math.min(80, Number(e.target.value))))}
              placeholder="5"
              min={0}
              max={80}
              className="w-full bg-card border border-border rounded-lg px-4 py-3 text-text placeholder-text-muted"
            />
          </div>
        )}

        {/* STEP — review */}
        {step === 'review' && (
          <div>
            <h1 className="j-display text-2xl text-text font-bold mb-2">Review your profile</h1>
            <p className="text-text-2 text-sm mb-6">Confirm and you&apos;ll start receiving booking requests.</p>
            <div className="j-card p-5 space-y-3 text-sm">
              <ReviewRow label="Name" value={displayName} />
              {templeName && <ReviewRow label="Temple" value={templeName} />}
              <ReviewRow label="City"  value={cityLabel || city} />
              {address && <ReviewRow label="Address" value={address} />}
              {pincode && <ReviewRow label="Pincode" value={pincode} />}
              <ReviewRow label="Languages" value={languages.join(', ')} />
              <ReviewRow label="Experience" value={`${years} years`} />
              <ReviewRow label="Specialisations" value={`${selected.size} pujas`} />
            </div>

            <label className="mt-4 flex items-start gap-3 j-card p-4 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 rounded border-border"
                checked={alsoAstrologer}
                onChange={e => setAlsoAstrologer(e.target.checked)}
              />
              <div>
                <div className="text-sm font-semibold text-text">
                  Also offer 1:1 astrology consultations
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  Add the Astrologer Portal alongside your Pandit Hub — manage clients, charts, calendar
                  and white-label reports. Approval review needed for the astrologer side.
                </div>
              </div>
            </label>
          </div>
        )}
      </div>

      {/* Sticky footer */}
      <div className="fixed bottom-0 inset-x-0 bg-bg/95 backdrop-blur border-t border-border px-4 py-3 z-10">
        <div className="max-w-2xl mx-auto flex justify-between gap-3">
          <button
            onClick={goBack}
            disabled={STEPS.indexOf(step) === 0}
            className="j-btn j-btn-secondary disabled:opacity-30"
          >
            Back
          </button>
          {step !== 'review' ? (
            <button onClick={goNext} className="j-btn j-btn-primary flex-1 max-w-xs">
              Continue
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="j-btn j-btn-primary flex-1 max-w-xs disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Join the platform'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-text-muted">{label}</span>
      <span className="text-text font-medium text-right">{value}</span>
    </div>
  );
}
