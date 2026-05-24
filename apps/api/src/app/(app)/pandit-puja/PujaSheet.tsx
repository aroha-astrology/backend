'use client';

import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useUserLocation } from '@/hooks/useUserLocation';
import { isNative } from '@/lib/native';
import type { MatchedPuja } from './match';

interface Pandit {
  id: string;
  name: string;
  photo_url: string | null;
  city: string;
  phone: string;
  whatsapp: string | null;
  years_experience: number | null;
  languages: string[];
  specialisations: string[];
  rating: number | null;
  verified: boolean;
}

const CITIES: { slug: string; label: string }[] = [
  { slug: 'delhi',     label: 'Delhi' },
  { slug: 'mumbai',    label: 'Mumbai' },
  { slug: 'bengaluru', label: 'Bengaluru' },
  { slug: 'chennai',   label: 'Chennai' },
  { slug: 'hyderabad', label: 'Hyderabad' },
  { slug: 'kolkata',   label: 'Kolkata' },
  { slug: 'pune',      label: 'Pune' },
  { slug: 'ahmedabad', label: 'Ahmedabad' },
  { slug: 'varanasi',  label: 'Varanasi' },
  { slug: 'prayagraj', label: 'Prayagraj' },
];

function citySlugFromName(name: string | null): string {
  if (!name) return 'delhi';
  const n = name.toLowerCase().trim();
  if (n.includes('bangalore') || n.includes('bengaluru')) return 'bengaluru';
  if (n.includes('mumbai') || n.includes('bombay'))       return 'mumbai';
  if (n.includes('delhi'))                                 return 'delhi';
  if (n.includes('chennai') || n.includes('madras'))      return 'chennai';
  if (n.includes('hyderabad'))                             return 'hyderabad';
  if (n.includes('kolkata') || n.includes('calcutta'))    return 'kolkata';
  if (n.includes('pune'))                                  return 'pune';
  if (n.includes('ahmedabad'))                             return 'ahmedabad';
  if (n.includes('varanasi') || n.includes('banaras'))    return 'varanasi';
  if (n.includes('prayagraj') || n.includes('allahabad')) return 'prayagraj';
  return 'delhi';
}

function StarRating({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <span className="flex items-center gap-0.5">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="#F59E0B" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      <span className="text-[10px] font-semibold" style={{ color: '#F59E0B' }}>{rating.toFixed(1)}</span>
    </span>
  );
}

function PanditInitials({ name }: { name: string }) {
  const parts = name.replace(/^(Pt\.|Pandit|Acharya|Sri|Shri|Dr\.?)\s*/i, '').split(' ');
  const initials = parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('');
  return (
    <div
      className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-extrabold flex-shrink-0"
      style={{ background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
    >
      {initials}
    </div>
  );
}

interface ServiceModeCardProps {
  icon: string;
  title: string;
  subtitle: string;
  selected: boolean;
  onClick: () => void;
}

function ServiceModeCard({ icon, title, subtitle, selected, onClick }: ServiceModeCardProps) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      className="flex flex-col items-center gap-1.5 p-3 rounded-2xl border text-center cursor-pointer w-full"
      style={{
        borderColor: selected ? 'var(--primary)' : 'var(--border)',
        background: selected ? 'rgba(212, 175, 55,0.10)' : 'var(--surface)',
        boxShadow: selected ? '0 0 0 1.5px var(--primary)' : 'none',
        transition: 'all 0.15s',
      }}
    >
      <span className="text-3xl leading-none">{icon}</span>
      <span className="text-[11px] font-bold text-text leading-tight">{title}</span>
      <span className="text-[9px] text-text-muted leading-snug">{subtitle}</span>
    </motion.button>
  );
}

interface Props {
  puja: MatchedPuja | null;
  userCity: string | null;
  open: boolean;
  onClose: () => void;
}

export function PujaSheet({ puja, userCity, open, onClose }: Props) {
  const { location } = useUserLocation();
  const queryClient = useQueryClient();
  const defaultCity = citySlugFromName(userCity);
  const [selectedCity, setSelectedCity] = useState(defaultCity);
  const [step, setStep]                 = useState<'pandits' | 'modes'>('pandits');
  const [selectedPandit, setSelectedPandit] = useState<Pandit | null>(null);
  const [serviceMode, setServiceMode]   = useState<'home' | 'remote' | 'temple' | null>(null);
  const [pandits, setPandits]           = useState<Pandit[]>([]);
  const [loading, setLoading]           = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [platform, setPlatform]         = useState<'app' | 'web'>('web');

  useEffect(() => { setPlatform(isNative() ? 'app' : 'web'); }, []);

  const updatedAt   = location?.location_updated_at ?? null;
  const ageDays     = updatedAt ? Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000) : null;
  const isStale     = ageDays !== null && ageDays >= 3;
  const noLocation  = !location?.current_city;
  const detectedLabel = userCity ?? location?.current_city ?? null;

  const handleRefreshLocation = async () => {
    setRefreshing(true);
    setRefreshError(null);

    const isApp = isNative();
    console.log('[location] refresh start', { platform: isApp ? 'app' : 'web', isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : null });

    try {
      let coords: { lat: number; lng: number } | null = null;

      if (isApp) {
        let pluginWorked = false;
        try {
          const mod = await import('@capacitor/geolocation');
          const Geo = (mod as { Geolocation?: { requestPermissions?: () => Promise<{ location?: string }>; getCurrentPosition: (opts: object) => Promise<{ coords: { latitude: number; longitude: number } }> } }).Geolocation;
          if (Geo && typeof Geo.requestPermissions === 'function') {
            const perm = await Geo.requestPermissions();
            console.log('[location] native permission:', perm);
            if (perm.location !== 'granted' && perm.location !== 'prompt') {
              setRefreshError('Location permission denied. Open device Settings → app → enable Location.');
              return;
            }
            const pos = await Geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
            coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            pluginWorked = true;
          } else {
            console.warn('[location] Capacitor Geolocation API unavailable, falling back to WebView geolocation');
          }
        } catch (pluginErr) {
          console.warn('[location] Capacitor plugin error, falling back to WebView geolocation', pluginErr);
        }

        if (!pluginWorked) {
          if (typeof navigator === 'undefined' || !navigator.geolocation) {
            setRefreshError('Location is not supported in this WebView.');
            return;
          }
          coords = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(
              (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
              (err) => {
                console.error('[location] WebView geolocation error', err.code, err.message);
                const msg: Record<number, string> = {
                  1: 'Permission denied. Allow location for this app in device Settings.',
                  2: 'Position unavailable. Check device GPS.',
                  3: 'Request timed out. Try again.',
                };
                reject(new Error(msg[err.code] ?? `Location error (${err.code})`));
              },
              { timeout: 15000, enableHighAccuracy: true, maximumAge: 60000 },
            );
          });
        }
      } else {
        if (typeof navigator === 'undefined' || !navigator.geolocation) {
          setRefreshError('Geolocation is not supported in this browser.');
          return;
        }
        if (!window.isSecureContext) {
          setRefreshError('HTTPS is required for location access. Open the site over https://.');
          return;
        }

        // Pre-check permission state when supported
        if ('permissions' in navigator) {
          try {
            const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
            console.log('[location] web permission state:', perm.state);
            if (perm.state === 'denied') {
              setRefreshError('Location is blocked. Click the lock icon in the address bar → Allow location.');
              return;
            }
          } catch { /* permission API unsupported, proceed anyway */ }
        }

        coords = await new Promise<{ lat: number; lng: number }>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            (err) => {
              console.error('[location] geolocation error', err.code, err.message);
              const msg: Record<number, string> = {
                1: 'Permission denied. Allow location in browser settings and try again.',
                2: 'Position unavailable. Check device location settings.',
                3: 'Request timed out. Try again with better signal.',
              };
              reject(new Error(msg[err.code] ?? `Location error (${err.code})`));
            },
            { timeout: 15000, enableHighAccuracy: true, maximumAge: 60000 },
          );
        });
      }

      if (!coords) {
        setRefreshError('Could not obtain coordinates.');
        return;
      }

      console.log('[location] coords obtained', coords);

      const res = await fetch('/api/user/location', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: coords.lat, longitude: coords.lng, source: isApp ? 'device' : 'manual' }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error('[location] POST failed', res.status, body);
        setRefreshError(body?.error ?? `Server error (${res.status}).`);
        return;
      }

      const json = await res.json();
      console.log('[location] saved', json);

      // Invalidate so the banner re-reads location_updated_at + city
      await queryClient.invalidateQueries({ queryKey: ['user', 'location'] });

      if (json.data?.city) {
        setSelectedCity(citySlugFromName(json.data.city));
      } else {
        setRefreshError('Saved coordinates but could not resolve city name.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected error';
      console.error('[location] refresh failed', err);
      setRefreshError(msg);
    } finally {
      setRefreshing(false);
    }
  };

  // Reset to step A when puja changes or sheet opens
  useEffect(() => {
    if (open) {
      setStep('pandits');
      setSelectedPandit(null);
      setServiceMode(null);
      setSelectedCity(citySlugFromName(userCity));
    }
  }, [open, userCity]);

  // Fetch pandits when city or puja changes
  useEffect(() => {
    if (!open || !selectedCity) return;
    setLoading(true);
    fetch(`/api/pandit-puja/pandits?city=${selectedCity}`)
      .then(r => r.json())
      .then(d => setPandits(d.pandits ?? []))
      .catch(() => setPandits([]))
      .finally(() => setLoading(false));
  }, [open, selectedCity]);

  const handlePanditSelect = (p: Pandit) => {
    setSelectedPandit(p);
    setStep('modes');
  };

  const handleAction = () => {
    if (!selectedPandit) return;
    const puja_name = puja?.name_en ?? 'Puja';
    if (serviceMode === 'remote') {
      const msg = encodeURIComponent(`Namaste, I'd like to book ${puja_name} — online / remote puja. Please share your availability and details.`);
      if (selectedPandit.whatsapp) {
        window.open(`https://wa.me/${selectedPandit.whatsapp.replace(/\D/g, '')}?text=${msg}`, '_blank');
      } else {
        window.location.href = `tel:${selectedPandit.phone}`;
      }
    } else if (serviceMode === 'home') {
      const msg = encodeURIComponent(`Namaste, I'd like to book ${puja_name} — at my home. Pandit to bring samagri. Please share availability.`);
      if (selectedPandit.whatsapp) {
        window.open(`https://wa.me/${selectedPandit.whatsapp.replace(/\D/g, '')}?text=${msg}`, '_blank');
      } else {
        window.location.href = `tel:${selectedPandit.phone}`;
      }
    } else if (serviceMode === 'temple') {
      const msg = encodeURIComponent(`Namaste, I'd like to book ${puja_name} — at your place / temple. All samagri to be provided. Please share details.`);
      if (selectedPandit.whatsapp) {
        window.open(`https://wa.me/${selectedPandit.whatsapp.replace(/\D/g, '')}?text=${msg}`, '_blank');
      } else {
        window.location.href = `tel:${selectedPandit.phone}`;
      }
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(60,72,88,0.35)', backdropFilter: 'blur(4px)' }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl bg-surface border-t border-border"
            style={{ maxHeight: '92vh', overflowY: 'auto', overflowX: 'hidden' }}
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <div className="px-5 pb-8">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 min-w-0 pr-3">
                  {step === 'modes' && (
                    <button
                      onClick={() => { setStep('pandits'); setSelectedPandit(null); setServiceMode(null); }}
                      className="flex items-center gap-1 text-[11px] text-primary font-semibold mb-1 cursor-pointer bg-transparent border-none p-0"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
                      Back to pandits
                    </button>
                  )}
                  <h2 className="text-[18px] font-extrabold text-text leading-tight truncate">{puja?.name_en}</h2>
                  <p className="text-[11px] text-text-muted mt-0.5">
                    {step === 'pandits' ? 'Choose a pandit near you' : `Booking with ${selectedPandit?.name}`}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer bg-surface-2 border border-border flex-shrink-0"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              {/* ── STEP A: Pandit list ─────────────────────────────────────────── */}
              {step === 'pandits' && (
                <>
                  {/* Detected location banner (also acts as prompt to refresh every 3 days) */}
                  <div
                    className="mb-3 px-3 py-2 rounded-xl"
                    style={{
                      background: isStale || noLocation ? 'rgba(184,134,11,0.08)' : 'var(--surface-2)',
                      border: `1px solid ${isStale || noLocation ? 'rgba(184,134,11,0.30)' : 'var(--border)'}`,
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill={isStale || noLocation ? '#B8860B' : 'var(--primary)'} className="flex-shrink-0">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/>
                      </svg>
                      <div className="flex-1 min-w-0">
                        {noLocation ? (
                          <p className="text-[11px] text-text">
                            Share your location to find pandits near you
                          </p>
                        ) : (
                          <p className="text-[11px] text-text-muted truncate">
                            Detected: <span className="font-bold text-text">{detectedLabel}</span>
                            {ageDays !== null && (
                              <span className="text-text-muted/70">
                                {' · '}
                                {ageDays === 0 ? 'just now' : ageDays === 1 ? '1 day ago' : `${ageDays} days ago`}
                              </span>
                            )}
                            <span className="text-text-muted/50"> · via {platform === 'app' ? 'app' : 'browser'}</span>
                          </p>
                        )}
                      </div>
                      <button
                        onClick={handleRefreshLocation}
                        disabled={refreshing}
                        className="text-[10px] font-extrabold px-2.5 py-1 rounded-lg cursor-pointer border-none flex-shrink-0"
                        style={{
                          background: isStale || noLocation ? '#B8860B' : 'transparent',
                          color: isStale || noLocation ? '#fff' : 'var(--primary)',
                          opacity: refreshing ? 0.6 : 1,
                        }}
                      >
                        {refreshing ? '…' : isStale || noLocation ? 'Update' : 'Refresh'}
                      </button>
                    </div>
                    {refreshError && (
                      <p className="text-[10px] text-error mt-1.5 leading-snug" style={{ color: '#D04545' }}>
                        ⚠ {refreshError}
                      </p>
                    )}
                  </div>

                  {/* City selector — user's city pinned first */}
                  <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4" style={{ scrollbarWidth: 'none' }}>
                    {(() => {
                      const userSlug = citySlugFromName(userCity);
                      const userMatched = !!userCity && CITIES.some(c => c.slug === userSlug);
                      const ordered = userMatched
                        ? [CITIES.find(c => c.slug === userSlug)!, ...CITIES.filter(c => c.slug !== userSlug)]
                        : CITIES;
                      return ordered.map((c, i) => (
                        <button
                          key={c.slug}
                          onClick={() => setSelectedCity(c.slug)}
                          className="flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold cursor-pointer border transition-all flex items-center gap-1"
                          style={{
                            background: selectedCity === c.slug ? 'var(--primary)' : 'var(--surface-2)',
                            color:      selectedCity === c.slug ? '#fff' : 'var(--text-muted)',
                            borderColor: selectedCity === c.slug ? 'var(--primary)' : 'var(--border)',
                          }}
                        >
                          {i === 0 && userMatched && (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>
                          )}
                          {c.label}
                        </button>
                      ));
                    })()}
                  </div>

                  {/* Pandit rows */}
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : pandits.length === 0 ? (
                    <p className="text-center text-[13px] text-text-muted py-8">No pandits listed for this city yet.</p>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {pandits.map(p => (
                        <button
                          key={p.id}
                          onClick={() => handlePanditSelect(p)}
                          className="flex items-center gap-3 p-3 rounded-2xl border border-border bg-surface text-left cursor-pointer w-full"
                          style={{ transition: 'background 0.12s' }}
                        >
                          <PanditInitials name={p.name} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-text truncate">{p.name}</span>
                              {p.verified && (
                                <span className="flex-shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-success/10 text-success border border-success/20">✓ Verified</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              {p.years_experience && (
                                <span className="text-[10px] text-text-muted">{p.years_experience}+ yrs</span>
                              )}
                              <StarRating rating={p.rating} />
                              {p.languages.slice(0, 2).map(l => (
                                <span key={l} className="text-[9px] px-1.5 py-0.5 rounded-md bg-surface-2 text-text-muted">{l}</span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {p.whatsapp && (
                              <a
                                href={`https://wa.me/${p.whatsapp.replace(/\D/g, '')}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                className="w-8 h-8 rounded-xl flex items-center justify-center"
                                style={{ background: '#25D366', color: '#fff' }}
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                              </a>
                            )}
                            <a
                              href={`tel:${p.phone}`}
                              onClick={e => e.stopPropagation()}
                              className="w-8 h-8 rounded-xl flex items-center justify-center"
                              style={{ background: 'var(--primary)', color: '#fff' }}
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.72A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                            </a>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}

              {/* ── STEP B: Service mode picker ──────────────────────────────────── */}
              {step === 'modes' && selectedPandit && (
                <>
                  {/* Selected pandit summary */}
                  <div
                    className="flex items-center gap-3 p-3 rounded-2xl mb-5"
                    style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
                  >
                    <PanditInitials name={selectedPandit.name} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-text truncate">{selectedPandit.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <StarRating rating={selectedPandit.rating} />
                        {selectedPandit.years_experience && (
                          <span className="text-[10px] text-text-muted">{selectedPandit.years_experience}+ yrs exp</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-[12px] font-semibold text-text mb-3">How would you like the puja performed?</p>

                  <div className="grid grid-cols-3 gap-2 mb-6">
                    <ServiceModeCard
                      icon="🏠"
                      title="At Home"
                      subtitle="Pandit travels, brings samagri"
                      selected={serviceMode === 'home'}
                      onClick={() => setServiceMode('home')}
                    />
                    <ServiceModeCard
                      icon="📹"
                      title="Online"
                      subtitle="Live-stream from temple"
                      selected={serviceMode === 'remote'}
                      onClick={() => setServiceMode('remote')}
                    />
                    <ServiceModeCard
                      icon="🛕"
                      title="At Temple"
                      subtitle="Pandit provides everything"
                      selected={serviceMode === 'temple'}
                      onClick={() => setServiceMode('temple')}
                    />
                  </div>

                  {/* "Why this puja" callout */}
                  {puja && puja.matchReasons.length > 0 && (
                    <div
                      className="rounded-xl p-3 mb-5 flex gap-2"
                      style={{ background: 'rgba(212, 175, 55,0.08)', border: '1px solid rgba(212, 175, 55,0.20)' }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" className="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <div>
                        <p className="text-[10px] font-semibold text-primary mb-0.5">Why this puja suits you</p>
                        <p className="text-[10px] text-text-muted">{puja.matchReasons.join(' · ')}</p>
                      </div>
                    </div>
                  )}

                  <motion.button
                    onClick={handleAction}
                    disabled={!serviceMode}
                    whileTap={{ scale: 0.97 }}
                    className="w-full py-4 rounded-2xl text-[15px] font-extrabold flex items-center justify-center gap-2 cursor-pointer border-none"
                    style={{
                      background: serviceMode ? 'var(--primary)' : 'var(--surface-2)',
                      color: serviceMode ? '#fff' : 'var(--text-muted)',
                      opacity: serviceMode ? 1 : 0.6,
                      transition: 'all 0.2s',
                    }}
                  >
                    {selectedPandit.whatsapp ? (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                        WhatsApp Pandit
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.72A2 2 0 012 1h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                        Call Pandit
                      </>
                    )}
                  </motion.button>

                  {/* Sankalpa note */}
                  <p className="text-[10px] text-text-muted text-center mt-3 leading-relaxed">
                    Mention your nakshatra and gotra to the pandit for a proper sankalpa during the puja.
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
