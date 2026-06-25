'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { modalOverlay, modalContent } from '@/lib/motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useStore } from '@/store/useStore';

// ─── Types ───────────────────────────────────────────────────────────────────

type Category = 'vehicle' | 'home' | 'commercial' | 'other';

interface CardDef {
  id: Category;
  icon: string;
  label: string;
  sub: string;
}

const CARDS: CardDef[] = [
  { id: 'vehicle', icon: '🚗', label: 'Vehicle', sub: 'Car, Bike, EV' },
  { id: 'home', icon: '🏠', label: 'Home', sub: 'Apartment, Villa, Plot' },
  { id: 'commercial', icon: '🏢', label: 'Commercial', sub: 'Office, Shop, Warehouse' },
  { id: 'other', icon: '📦', label: 'Other', sub: 'Any other big purchase' },
];

const COST_BRACKETS = [
  { value: 'under-1l', label: 'Under ₹1 Lakh' },
  { value: '1l-5l', label: '₹1L – ₹5L' },
  { value: '5l-10l', label: '₹5L – ₹10L' },
  { value: '10l-25l', label: '₹10L – ₹25L' },
  { value: '25l-50l', label: '₹25L – ₹50L' },
  { value: '50l-1cr', label: '₹50L – ₹1 Crore' },
  { value: 'above-1cr', label: 'Above ₹1 Crore' },
];

const VEHICLE_TYPES = [
  { value: 'car', label: '🚗 Car' },
  { value: 'bike', label: '🏍️ Bike / Scooter' },
  { value: 'ev', label: '⚡ Electric Vehicle' },
  { value: 'truck', label: '🚚 Truck / Commercial' },
  { value: 'other', label: '🚌 Other' },
];

const VEHICLE_USAGE = [
  { value: 'personal', label: 'Personal Use' },
  { value: 'commercial', label: 'Commercial / Business' },
  { value: 'family', label: 'Family Vehicle' },
];

const HOME_TYPES = [
  { value: 'apartment', label: '🏠 Apartment / Flat' },
  { value: 'villa', label: '🏡 Villa / Independent House' },
  { value: 'plot', label: '🌱 Plot / Land' },
  { value: 'row-house', label: '🏘️ Row House / Townhouse' },
  { value: 'other', label: '✨ Other' },
];

const HOME_PURPOSE = [
  { value: 'self-use', label: 'Self Use / Own Stay' },
  { value: 'investment', label: 'Investment' },
  { value: 'rental', label: 'Rental Income' },
];

const COMMERCIAL_TYPES = [
  { value: 'office', label: '🏢 Office Space' },
  { value: 'shop', label: '🏪 Shop / Retail' },
  { value: 'warehouse', label: '🏭 Warehouse / Godown' },
  { value: 'plot', label: '🌐 Commercial Plot' },
  { value: 'other', label: '✨ Other' },
];

const COMMERCIAL_PURPOSE = [
  { value: 'own-use', label: 'Own Business Use' },
  { value: 'investment', label: 'Investment' },
  { value: 'rental', label: 'Rental Income' },
];

// ─── Form state per category ──────────────────────────────────────────────────

interface FormState {
  costBracket: string;
  bookingDate: string;
  deliveryDate: string;
  // vehicle
  vehicleType: string;
  vehicleTypeOther: string;
  vehicleUsage: string;
  // home
  homeType: string;
  homeTypeOther: string;
  homePurpose: string;
  // commercial
  commercialType: string;
  commercialTypeOther: string;
  commercialPurpose: string;
  // other
  itemDescription: string;
}

const emptyForm = (): FormState => ({
  costBracket: '',
  bookingDate: '',
  deliveryDate: '',
  vehicleType: '',
  vehicleTypeOther: '',
  vehicleUsage: '',
  homeType: '',
  homeTypeOther: '',
  homePurpose: '',
  commercialType: '',
  commercialTypeOther: '',
  commercialPurpose: '',
  itemDescription: '',
});

// ─── Saved state ─────────────────────────────────────────────────────────────

type Step = 'pick-card' | 'form' | 'submitted';

interface Props {
  isOpen: boolean;
  panchangDate: string;
  initialCategory?: Category | null;
  onClose: () => void;
  onSubmitted: (planId: string) => void;
}

// ─── Gold-accent input style — works in both light and dark themes ──────────

const goldInput =
  'border-[rgba(212, 175, 55,0.30)] bg-[rgba(212, 175, 55,0.04)] focus:border-[rgba(212, 175, 55,0.60)] text-text placeholder:text-text-secondary/50';

// ─── Component ───────────────────────────────────────────────────────────────

export function PurchasePlanModal({ isOpen, panchangDate, initialCategory, onClose, onSubmitted }: Props) {
  const language = useStore((s) => s.language);
  const [step, setStep] = useState<Step>('pick-card');
  const [selected, setSelected] = useState<Category | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [dateError, setDateError] = useState('');
  const [saving, setSaving] = useState(false);

  // Sync to initialCategory when modal opens — jump straight to form if category was pre-picked
  useEffect(() => {
    if (!isOpen) return;
    if (initialCategory) {
      setSelected(initialCategory);
      setStep('form');
    } else {
      setSelected(null);
      setStep('pick-card');
    }
    setForm(emptyForm());
    setDateError('');
  }, [isOpen, initialCategory]);

  function handleClose() {
    setStep('pick-card');
    setSelected(null);
    setForm(emptyForm());
    setDateError('');
    onClose();
  }

  function handleCardClick(id: Category) {
    setSelected(id);
    setStep('form');
  }

  function handleBack() {
    setStep('pick-card');
    setSelected(null);
    setDateError('');
  }

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!selected) return;
    if (selected === 'vehicle' && form.vehicleType === 'other' && !form.vehicleTypeOther.trim()) {
      setDateError('Please describe the vehicle you\'re buying.');
      return;
    }
    if (selected === 'home' && form.homeType === 'other' && !form.homeTypeOther.trim()) {
      setDateError('Please describe the property type.');
      return;
    }
    if (selected === 'commercial' && form.commercialType === 'other' && !form.commercialTypeOther.trim()) {
      setDateError('Please describe the commercial property.');
      return;
    }
    if (selected === 'other' && !form.itemDescription.trim()) {
      setDateError('Please describe what you\'re planning to buy.');
      return;
    }
    if (!form.bookingDate && !form.deliveryDate) {
      setDateError('Please enter at least one date (booking or delivery).');
      return;
    }
    setDateError('');
    setSaving(true);

    try {
      const metadata: Record<string, string> = {};
      if (selected === 'vehicle') {
        if (form.vehicleType) metadata.vehicleType = form.vehicleType === 'other' ? form.vehicleTypeOther : form.vehicleType;
        if (form.vehicleUsage) metadata.usage = form.vehicleUsage;
      } else if (selected === 'home') {
        if (form.homeType) metadata.propertyType = form.homeType === 'other' ? form.homeTypeOther : form.homeType;
        if (form.homePurpose) metadata.purpose = form.homePurpose;
      } else if (selected === 'commercial') {
        if (form.commercialType) metadata.commercialType = form.commercialType === 'other' ? form.commercialTypeOther : form.commercialType;
        if (form.commercialPurpose) metadata.purpose = form.commercialPurpose;
      } else if (selected === 'other') {
        if (form.itemDescription) metadata.itemDescription = form.itemDescription;
      }

      const res = await fetch('/api/purchase-plan/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: selected,
          metadata,
          costBracket: form.costBracket || undefined,
          bookingDate: form.bookingDate || undefined,
          deliveryDate: form.deliveryDate || undefined,
          panchangDate,
          language,
        }),
      });

      const json = (await res.json()) as { success: boolean; planId?: string; error?: string };

      if (!json.success) {
        setDateError(json.error === 'INSUFFICIENT_TOKENS'
          ? 'You need 5 Dhanam for this analysis. Please add more Dhanam.'
          : (json.error ?? 'Something went wrong. Try again.'));
        return;
      }

      setStep('submitted');
      if (json.planId) onSubmitted(json.planId);
    } finally {
      setSaving(false);
    }
  }

  const card = CARDS.find((c) => c.id === selected);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Overlay */}
          <motion.div
            className="absolute inset-0 bg-black/60 backdrop-blur-md"
            variants={modalOverlay}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={handleClose}
          />

          {/* Sheet / Modal */}
          <motion.div
            className="relative z-10 w-full max-w-lg mx-4 mb-4 sm:mb-0 rounded-2xl overflow-hidden glass-3"
            style={{
              border: '1px solid rgba(212, 175, 55,0.30)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
            }}
            variants={modalContent}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            {/* Header */}
            <div
              className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid rgba(212, 175, 55,0.15)' }}
            >
              {step === 'form' ? (
                <button
                  onClick={handleBack}
                  className="text-text-secondary hover:text-text transition-colors flex items-center gap-1.5 text-sm"
                >
                  ← Back
                </button>
              ) : (
                <div />
              )}
              <div className="absolute left-1/2 -translate-x-1/2 text-center">
                <p className="text-[10px] font-semibold tracking-[0.18em] text-primary/70 uppercase">Vedic Purchase Planner</p>
              </div>
              <button
                onClick={handleClose}
                className="w-7 h-7 rounded-full flex items-center justify-center text-text-secondary hover:text-text hover:bg-[rgba(0,0,0,0.06)] transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-5 max-h-[80vh] overflow-y-auto">
              {/* ── Step 1: Pick a card ── */}
              {step === 'pick-card' && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                  <h2 className="font-[family-name:var(--font-serif)] text-xl font-bold mb-1 text-text">
                    Planning to Buy?
                  </h2>
                  <p className="text-xs text-text-secondary mb-5">
                    Pick a category — we&apos;ll give you the best Vedic timing with your birth chart 🌙
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {CARDS.map((c) => (
                      <motion.button
                        key={c.id}
                        onClick={() => handleCardClick(c.id)}
                        whileHover={{ y: -3 }}
                        whileTap={{ scale: 0.97 }}
                        className="rounded-2xl p-4 text-left transition-all relative overflow-hidden"
                        style={{
                          background: 'rgba(212, 175, 55,0.06)',
                          border: '1px solid rgba(212, 175, 55,0.22)',
                        }}
                      >
                        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[rgba(212, 175, 55,0.5)] to-transparent" />
                        <span className="text-3xl block mb-2">{c.icon}</span>
                        <p className="text-sm font-bold text-text font-[family-name:var(--font-serif)]">{c.label}</p>
                        <p className="text-[10px] text-text-secondary mt-0.5">{c.sub}</p>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* ── Step 2: Form ── */}
              {step === 'form' && card && (
                <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }} className="space-y-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl">{card.icon}</span>
                    <div>
                      <p className="font-[family-name:var(--font-serif)] text-base font-bold text-text">{card.label}</p>
                      <p className="text-[10px] text-text-secondary">{card.sub}</p>
                    </div>
                  </div>

                  {/* ── Category-specific fields ── */}
                  {selected === 'vehicle' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Select
                          label="Vehicle Type"
                          options={VEHICLE_TYPES}
                          placeholder="Select type"
                          value={form.vehicleType}
                          onChange={(e) => set('vehicleType', e.target.value)}
                          className={goldInput}
                        />
                        <Select
                          label="Usage"
                          options={VEHICLE_USAGE}
                          placeholder="Select usage"
                          value={form.vehicleUsage}
                          onChange={(e) => set('vehicleUsage', e.target.value)}
                          className={goldInput}
                        />
                      </div>
                      {form.vehicleType === 'other' && (
                        <Input
                          label="What exactly? *"
                          placeholder="e.g. Tractor, Auto Rickshaw, Boat..."
                          value={form.vehicleTypeOther}
                          onChange={(e) => set('vehicleTypeOther', e.target.value)}
                          className={goldInput}
                        />
                      )}
                    </div>
                  )}

                  {selected === 'home' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Select
                          label="Property Type"
                          options={HOME_TYPES}
                          placeholder="Select type"
                          value={form.homeType}
                          onChange={(e) => set('homeType', e.target.value)}
                          className={goldInput}
                        />
                        <Select
                          label="Purpose"
                          options={HOME_PURPOSE}
                          placeholder="Select purpose"
                          value={form.homePurpose}
                          onChange={(e) => set('homePurpose', e.target.value)}
                          className={goldInput}
                        />
                      </div>
                      {form.homeType === 'other' && (
                        <Input
                          label="What exactly? *"
                          placeholder="e.g. Farmhouse, Studio, Co-living space..."
                          value={form.homeTypeOther}
                          onChange={(e) => set('homeTypeOther', e.target.value)}
                          className={goldInput}
                        />
                      )}
                    </div>
                  )}

                  {selected === 'commercial' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <Select
                          label="Property Type"
                          options={COMMERCIAL_TYPES}
                          placeholder="Select type"
                          value={form.commercialType}
                          onChange={(e) => set('commercialType', e.target.value)}
                          className={goldInput}
                        />
                        <Select
                          label="Purpose"
                          options={COMMERCIAL_PURPOSE}
                          placeholder="Select purpose"
                          value={form.commercialPurpose}
                          onChange={(e) => set('commercialPurpose', e.target.value)}
                          className={goldInput}
                        />
                      </div>
                      {form.commercialType === 'other' && (
                        <Input
                          label="What exactly? *"
                          placeholder="e.g. Hotel, Restaurant, Industrial unit..."
                          value={form.commercialTypeOther}
                          onChange={(e) => set('commercialTypeOther', e.target.value)}
                          className={goldInput}
                        />
                      )}
                    </div>
                  )}

                  {selected === 'other' && (
                    <Input
                      label="What are you buying? *"
                      placeholder="e.g. Gold jewellery, Electronics, Business equipment..."
                      value={form.itemDescription}
                      onChange={(e) => set('itemDescription', e.target.value)}
                      className={goldInput}
                    />
                  )}

                  {/* ── Budget (optional) ── */}
                  <Select
                    label="Budget Range (optional)"
                    options={COST_BRACKETS}
                    placeholder="Select budget range"
                    value={form.costBracket}
                    onChange={(e) => set('costBracket', e.target.value)}
                    className={goldInput}
                  />

                  {/* ── Dates ── */}
                  <div
                    className="rounded-xl p-4 space-y-3"
                    style={{ background: 'rgba(212, 175, 55,0.05)', border: '1px solid rgba(212, 175, 55,0.15)' }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text)' }}>
                      📅 When are you planning?
                    </p>
                    <p className="text-[10px] text-text-secondary -mt-1">At least one date is required</p>
                    <div className="grid grid-cols-2 gap-3">
                      <Input
                        type="date"
                        label="Booking / Token Date"
                        value={form.bookingDate}
                        onChange={(e) => set('bookingDate', e.target.value)}
                        className={goldInput}
                      />
                      <Input
                        type="date"
                        label="Delivery / Possession Date"
                        value={form.deliveryDate}
                        onChange={(e) => set('deliveryDate', e.target.value)}
                        className={goldInput}
                      />
                    </div>
                    {!form.bookingDate && !form.deliveryDate && (
                      <p className="text-[10px] text-text-secondary/70">
                        💡 If you leave a date blank, we&apos;ll auto-calculate it (±5 days).
                      </p>
                    )}
                    {form.bookingDate && !form.deliveryDate && (
                      <p className="text-[10px]" style={{ color: 'var(--text)' }}>
                        ✨ Delivery date will be set to {form.bookingDate ? addDays(form.bookingDate, 5) : '—'}
                      </p>
                    )}
                    {!form.bookingDate && form.deliveryDate && (
                      <p className="text-[10px]" style={{ color: 'var(--text)' }}>
                        ✨ Booking date will be set to {form.deliveryDate ? clampBooking(form.deliveryDate) : '—'}
                      </p>
                    )}
                    {dateError && (
                      <p className="text-[11px] text-red-500 font-medium">{dateError}</p>
                    )}
                  </div>

                  {/* ── Actions ── */}
                  <div className="flex gap-3 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={handleClose}
                      disabled={saving}
                    >
                      Close
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1"
                      onClick={handleSave}
                      isLoading={saving}
                    >
                      ✦ Analyze Now
                    </Button>
                  </div>
                  <p className="text-[9px] text-center text-text-secondary/60">Uses 5 tokens from your balance</p>
                </motion.div>
              )}

              {/* ── Step 3: Submitted ── */}
              {step === 'submitted' && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className="text-center py-6 space-y-4"
                >
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center text-3xl mx-auto"
                    style={{ background: 'rgba(212, 175, 55,0.12)', border: '2px solid rgba(212, 175, 55,0.35)' }}
                  >
                    🔮
                  </div>
                  <div>
                    <h3 className="font-[family-name:var(--font-serif)] text-lg font-bold text-text mb-2">
                      Yogi Baba is reading the stars...
                    </h3>
                    <p className="text-sm text-text-secondary leading-relaxed max-w-xs mx-auto">
                      Your in-depth Vedic analysis is being prepared with your birth chart, panchang data &amp; planetary positions.
                    </p>
                    <p className="mt-3 text-xs font-semibold" style={{ color: 'var(--text)' }}>
                      ⏱ Takes less than 5 minutes — we&apos;ll show it right below
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleClose} className="mx-auto">
                    Got it, show me below
                  </Button>
                </motion.div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// ─── Helpers (used in form display) ──────────────────────────────────────────

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function clampBooking(deliveryStr: string): string {
  const proposed = new Date(deliveryStr);
  proposed.setDate(proposed.getDate() - 5);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const resolved = proposed < yesterday ? proposed : yesterday;
  return resolved.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
