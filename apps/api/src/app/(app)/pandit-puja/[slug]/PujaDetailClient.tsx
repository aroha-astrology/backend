'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { PANDIT_CITIES } from '@/lib/puja/cities';
import {
  computeBookingDhanam,
  DHANAM_PER_EXTRA_MEMBER,
  MAX_BOOKING_MEMBERS,
} from '@/lib/puja/pricing';

interface Offering {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  image_url: string | null;
  dhanam_cost: number;
  scope: string;
  linked_puja: string | null;
}

interface Pandit {
  id: string;
  name: string;
  photo_url: string | null;
  city: string;
  languages: string[];
  rating: number | null;
  years_experience: number | null;
  source: 'seed' | 'self';
}

interface Props {
  puja: {
    slug: string;
    name_en: string;
    name_sanskrit: string;
    deity: string;
    suggested_dhanam: number;
  };
  offerings: Offering[];
  defaultCity: string | null;
  isAuthed: boolean;
  userName: string | null;
}

type Step = 'offerings' | 'sankalp' | 'pandit' | 'confirm';

interface Member { name: string; gotra: string; }

export function PujaDetailClient({ puja, offerings, defaultCity, isAuthed, userName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('offerings');
  const [submitting, setSubmitting] = useState(false);

  // Selections
  const [selectedOfferings, setSelectedOfferings] = useState<Set<string>>(new Set());
  const [members, setMembers] = useState<Member[]>([{ name: userName ?? '', gotra: '' }]);
  const [city, setCity] = useState<string>(defaultCity ?? 'delhi');
  const [pandits, setPandits] = useState<Pandit[]>([]);
  const [panditsLoading, setPanditsLoading] = useState(false);
  const [selectedPandit, setSelectedPandit] = useState<Pandit | null>(null);

  const pricing = useMemo(() => computeBookingDhanam(
    puja.suggested_dhanam,
    members.length,
    Array.from(selectedOfferings).map(id => {
      const o = offerings.find(x => x.id === id);
      return { id, dhanam_cost: o?.dhanam_cost ?? 0 };
    }),
  ), [puja.suggested_dhanam, members.length, selectedOfferings, offerings]);

  useEffect(() => {
    if (step !== 'pandit') return;
    setPanditsLoading(true);
    fetch(`/api/pandit-puja/pandits?city=${city}&puja_slug=${puja.slug}`)
      .then(r => r.json())
      .then(d => setPandits(d.pandits ?? []))
      .catch(() => setPandits([]))
      .finally(() => setPanditsLoading(false));
  }, [step, city, puja.slug]);

  const toggleOffering = (id: string) => {
    setSelectedOfferings(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addMember = () => {
    if (members.length >= MAX_BOOKING_MEMBERS) {
      toast.error(`Max ${MAX_BOOKING_MEMBERS} members`);
      return;
    }
    setMembers([...members, { name: '', gotra: '' }]);
  };

  const removeMember = (i: number) => {
    if (members.length <= 1) return;
    setMembers(members.filter((_, idx) => idx !== i));
  };

  const updateMember = (i: number, field: 'name' | 'gotra', value: string) => {
    setMembers(members.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  };

  const setSankalpMode = (count: number) => {
    if (count === 1) setMembers([{ name: '', gotra: '' }]);
    else if (count === 2) setMembers([{ name: '', gotra: '' }, { name: '', gotra: '' }]);
    // family: keep current
  };

  const goNext = () => {
    if (step === 'sankalp') {
      const invalid = members.some(m => !m.name.trim() || !m.gotra.trim());
      if (invalid) {
        toast.error('Fill name and gotra for every member');
        return;
      }
    }
    if (step === 'pandit' && !selectedPandit) {
      toast.error('Select a pandit');
      return;
    }
    if (step === 'offerings')  setStep('sankalp');
    else if (step === 'sankalp')   setStep('pandit');
    else if (step === 'pandit')    setStep('confirm');
  };

  const goBack = () => {
    if (step === 'sankalp')   setStep('offerings');
    else if (step === 'pandit')    setStep('sankalp');
    else if (step === 'confirm')   setStep('pandit');
  };

  const handleSubmit = async () => {
    if (!selectedPandit) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/puja-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          puja_slug:      puja.slug,
          pandit_id:      selectedPandit.id,
          pandit_source:  selectedPandit.source,
          members:        members.map(m => ({ name: m.name.trim(), gotra: m.gotra.trim() })),
          offering_ids:   Array.from(selectedOfferings),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.error === 'INSUFFICIENT_TOKENS') {
          toast.error('Not enough Dhanam. Top up to continue.');
          router.push('/credits');
          return;
        }
        throw new Error(body.error ?? 'Booking failed');
      }
      toast.success('Puja booked!');
      router.push(`/pandit-puja/bookings/${body.booking_id}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  // Sticky CTA
  const onCta = useCallback(() => {
    if (!isAuthed) {
      router.push('/login');
      return;
    }
    setStep('offerings');
    setOpen(true);
  }, [isAuthed, router]);

  // Allow the server-component title card (BookNowTrigger) to open the sheet
  useEffect(() => {
    const handler = () => onCta();
    window.addEventListener('puja-book-now', handler);
    return () => window.removeEventListener('puja-book-now', handler);
  }, [onCta]);

  const catalogOfferings = offerings.filter(o => o.scope === 'catalog');
  const specificOfferings = offerings.filter(o => o.scope !== 'catalog');

  return (
    <>
      {/* Booking sheet */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 bg-black/60 z-[60]"
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 280 }}
              className="fixed inset-x-0 bottom-0 z-[70] bg-bg rounded-t-2xl border-t border-border max-h-[92vh] flex flex-col"
            >
              {/* Header */}
              <div className="px-4 pt-3 pb-2 border-b border-border flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-accent">Review Puja Booking</div>
                  <div className="text-sm font-bold text-text">{puja.name_en}</div>
                </div>
                <button onClick={() => setOpen(false)} className="text-text-muted text-xl px-2">×</button>
              </div>

              {/* Step indicator */}
              <div className="px-4 pt-3 pb-2 flex gap-1">
                {(['offerings', 'sankalp', 'pandit', 'confirm'] as Step[]).map((s, i) => {
                  const order: Record<Step, number> = { offerings: 0, sankalp: 1, pandit: 2, confirm: 3 };
                  const active = order[step] >= i;
                  return <div key={s} className={`flex-1 h-1 rounded-full ${active ? 'bg-accent' : 'bg-border'}`} />;
                })}
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {step === 'offerings' && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-text-muted mb-2">Add more offering items</div>
                    {specificOfferings.length > 0 && (
                      <>
                        <div className="text-[11px] text-accent mb-2">Special for this puja</div>
                        <div className="space-y-2 mb-4">
                          {specificOfferings.map(o => (
                            <OfferingRow key={o.id} o={o} selected={selectedOfferings.has(o.id)} onToggle={() => toggleOffering(o.id)} />
                          ))}
                        </div>
                      </>
                    )}
                    <div className="text-[11px] text-text-muted mb-2">Add-ons for any puja</div>
                    <div className="space-y-2">
                      {catalogOfferings.map(o => (
                        <OfferingRow key={o.id} o={o} selected={selectedOfferings.has(o.id)} onToggle={() => toggleOffering(o.id)} />
                      ))}
                    </div>
                  </div>
                )}

                {step === 'sankalp' && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-text-muted mb-2">Provide Sankalp Details</div>
                    <p className="text-sm text-text-2 mb-4">
                      Name and gotra are recited during the puja. First member is included — each extra member +{DHANAM_PER_EXTRA_MEMBER} Dhanam.
                    </p>
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <SankalpModeButton label="Just me"     desc="1 person"    active={members.length === 1} onClick={() => setSankalpMode(1)} />
                      <SankalpModeButton label="Couple"      desc="2 members"   active={members.length === 2} onClick={() => setSankalpMode(2)} />
                      <SankalpModeButton label="Family"      desc="3-6 members" active={members.length >= 3} onClick={() => members.length < 3 && setMembers([...members, { name: '', gotra: '' }])} />
                    </div>
                    <div className="space-y-3">
                      {members.map((m, i) => (
                        <div key={i} className="j-card p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-text-muted">Member {i + 1}</span>
                            {i > 0 && (
                              <span className="text-[10px] text-accent">+{DHANAM_PER_EXTRA_MEMBER} Dhanam</span>
                            )}
                            {members.length > 1 && (
                              <button onClick={() => removeMember(i)} className="text-text-muted text-xs">Remove</button>
                            )}
                          </div>
                          <input
                            value={m.name}
                            onChange={e => updateMember(i, 'name', e.target.value)}
                            placeholder="Full name"
                            className="w-full bg-card border border-border rounded px-3 py-2 text-sm text-text mb-2"
                          />
                          <input
                            value={m.gotra}
                            onChange={e => updateMember(i, 'gotra', e.target.value)}
                            placeholder="Gotra (e.g. Kashyap)"
                            className="w-full bg-card border border-border rounded px-3 py-2 text-sm text-text"
                          />
                        </div>
                      ))}
                      {members.length < MAX_BOOKING_MEMBERS && (
                        <button onClick={addMember} className="w-full j-btn j-btn-secondary text-sm">
                          + Add member ({DHANAM_PER_EXTRA_MEMBER} Dhanam)
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {step === 'pandit' && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-text-muted mb-2">Choose a Pandit</div>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                      {PANDIT_CITIES.map(c => (
                        <button key={c.slug} onClick={() => setCity(c.slug)}
                          className={`px-3 py-2 rounded-lg border text-xs text-left ${
                            city === c.slug ? 'border-accent bg-accent/10 text-text' : 'border-border bg-card text-text-2'
                          }`}>{c.label}</button>
                      ))}
                    </div>

                    {panditsLoading ? (
                      <div className="text-center py-8 text-text-muted text-sm">Loading pandits…</div>
                    ) : pandits.length === 0 ? (
                      <div className="text-center py-8 text-text-muted text-sm">
                        No verified pandits in {PANDIT_CITIES.find(c => c.slug === city)?.label} for this puja yet. Try another city.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pandits.map(p => (
                          <button key={p.id} onClick={() => setSelectedPandit(p)}
                            className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition ${
                              selectedPandit?.id === p.id ? 'border-accent bg-accent/10' : 'border-border bg-card hover:border-accent/40'
                            }`}>
                            <div className="w-10 h-10 rounded-full overflow-hidden bg-card border border-border flex items-center justify-center flex-shrink-0">
                              {p.photo_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-base">🧘</span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-semibold text-text truncate">{p.name}</div>
                              <div className="text-xs text-text-muted">
                                {p.years_experience ? `${p.years_experience} yrs` : '—'} · {(p.languages ?? []).slice(0, 2).join(', ')}
                              </div>
                            </div>
                            {p.rating && (
                              <div className="text-xs text-accent font-semibold flex-shrink-0">★ {p.rating.toFixed(1)}</div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {step === 'confirm' && (
                  <div>
                    <div className="text-xs uppercase tracking-wider text-text-muted mb-2">Confirm Booking</div>
                    <div className="j-card p-4 space-y-2 text-sm">
                      <Row label="Puja"          value={puja.name_en} />
                      <Row label="Pandit"        value={selectedPandit?.name ?? '—'} />
                      <Row label="City"          value={PANDIT_CITIES.find(c => c.slug === city)?.label ?? city} />
                      <Row label="Members"       value={`${members.length}`} />
                      {selectedOfferings.size > 0 && (
                        <Row label="Offerings"     value={`${selectedOfferings.size}`} />
                      )}
                    </div>
                    <div className="mt-3 j-card p-4 text-sm">
                      <Row label="Base puja"        value={`${pricing.base} Dhanam`} />
                      {pricing.member_dhanam > 0 && <Row label={`${pricing.members - 1} extra members`} value={`+${pricing.member_dhanam} Dhanam`} />}
                      {pricing.offerings_dhanam > 0 && <Row label="Offerings" value={`+${pricing.offerings_dhanam} Dhanam`} />}
                      <div className="border-t border-border pt-2 mt-2 flex justify-between font-bold">
                        <span>Total</span>
                        <span className="text-accent">{pricing.total} Dhanam</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-3 border-t border-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-text-muted">Total</span>
                  <span className="text-text font-bold">{pricing.total} Dhanam</span>
                </div>
                <div className="flex gap-2">
                  {step !== 'offerings' && (
                    <button onClick={goBack} className="j-btn j-btn-secondary">Back</button>
                  )}
                  {step !== 'confirm' ? (
                    <button onClick={goNext} className="j-btn j-btn-primary flex-1">Continue →</button>
                  ) : (
                    <button onClick={handleSubmit} disabled={submitting} className="j-btn j-btn-primary flex-1 disabled:opacity-60">
                      {submitting ? 'Booking…' : `Pay ${pricing.total} Dhanam & Book`}
                    </button>
                  )}
                </div>
                {step === 'offerings' && (
                  <div className="mt-2 text-xs text-text-muted text-center">
                    Proceed to fill your name, gotra and address.
                  </div>
                )}
                {!isAuthed && (
                  <div className="mt-2 text-xs text-text-muted text-center">
                    <Link href="/login" className="text-accent no-underline">Sign in</Link> to complete the booking.
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function OfferingRow({ o, selected, onToggle }: { o: Offering; selected: boolean; onToggle: () => void }) {
  return (
    <div className={`j-card p-3 flex gap-3 ${selected ? 'border-accent/50' : ''}`}>
      <div className="w-20 h-20 rounded-md overflow-hidden bg-card flex-shrink-0 flex items-center justify-center">
        {o.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.image_url} alt={o.title} className="w-full h-full object-cover" />
        ) : (
          <span className="text-2xl">🪔</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text">{o.title}</div>
        <div className="text-xs text-text-muted line-clamp-2">{o.description}</div>
        <div className="text-sm font-bold text-accent mt-1">{o.dhanam_cost} Dhanam</div>
      </div>
      <button
        onClick={onToggle}
        className={`self-center px-3 py-1.5 rounded-md text-xs font-bold ${
          selected ? 'bg-emerald-600 text-white' : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/40'
        }`}
      >
        {selected ? '✓ Added' : 'Add'}
      </button>
    </div>
  );
}

function SankalpModeButton({ label, desc, active, onClick }: { label: string; desc: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`p-3 rounded-lg border text-center ${
        active ? 'border-accent bg-accent/10' : 'border-border bg-card'
      }`}>
      <div className="text-sm font-semibold text-text">{label}</div>
      <div className="text-[10px] text-text-muted mt-0.5">{desc}</div>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-text-muted">{label}</span>
      <span className="text-text font-medium text-right">{value}</span>
    </div>
  );
}
