'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MotionPage, ScrollReveal } from '@/components/ui/motion-primitives';
import { Button } from '@/components/ui/button';
import { PurchasePlanModal } from '../panchang/PurchasePlanModal';
import { PurchasePlanResults } from '../panchang/PurchasePlanResult';

type PurchaseCategory = 'vehicle' | 'home' | 'commercial' | 'other';

interface PlanRow {
  id: string;
  status: 'pending' | 'processing' | 'done' | 'error';
  category: string;
  analysis: Record<string, unknown> | null;
  resolved_booking_date: string;
  resolved_delivery_date: string;
  created_at: string;
  completed_at: string | null;
  language: string;
  metadata: Record<string, string>;
}

const PURCHASE_CARDS = [
  { id: 'vehicle' as PurchaseCategory, icon: '🚗', label: 'Vehicle', sub: 'Car, Bike, EV' },
  { id: 'home' as PurchaseCategory, icon: '🏠', label: 'Home', sub: 'Apartment, Villa, Plot' },
  { id: 'commercial' as PurchaseCategory, icon: '🏢', label: 'Commercial', sub: 'Office, Shop, Warehouse' },
  { id: 'other' as PurchaseCategory, icon: '📦', label: 'Other', sub: 'Any big purchase' },
] as const;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PurchasePlannerPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState<PurchaseCategory | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [pollingId, setPollingId] = useState<string | null>(null);
  const today = todayISO();

  const loadPlans = useCallback(async () => {
    if (plansLoaded) return;
    try {
      const res = await fetch('/api/purchase-plan/list');
      const json = (await res.json()) as { success: boolean; data?: PlanRow[] };
      if (json.success && json.data) setPlans(json.data);
    } catch {
      // silently ignore
    } finally {
      setPlansLoaded(true);
    }
  }, [plansLoaded]);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  function handleModalOpen(category?: PurchaseCategory) {
    setModalCategory(category ?? null);
    setModalOpen(true);
    loadPlans();
  }

  function handleSubmitted(planId: string) {
    setPollingId(planId);
    setPlans((prev) => [
      {
        id: planId,
        status: 'pending',
        category: modalCategory ?? 'other',
        analysis: null,
        resolved_booking_date: '',
        resolved_delivery_date: '',
        created_at: new Date().toISOString(),
        completed_at: null,
        language: 'en',
        metadata: {},
      },
      ...prev,
    ]);
    setModalOpen(false);
  }

  const handlePolled = useCallback((updated: PlanRow) => {
    setPlans((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
    if (updated.status === 'done' || updated.status === 'error') {
      setPollingId(null);
    }
  }, []);

  return (
    <div className="min-h-screen">
      <MotionPage>
        {/* ── Header ── */}
        <div className="sticky top-0 z-30 px-4 lg:px-8 py-3 flex items-center gap-3" style={{
          background: 'rgba(245,239,224,0.92)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(212, 175, 55,0.15)',
        }}>
          <Link href="/dashboard" className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[rgba(212, 175, 55,0.12)] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
          </Link>
          <div>
            <h1 className="font-[family-name:var(--font-serif)] text-lg font-bold leading-tight" style={{ color: '#3E2723' }}>
              Vedic Purchase Planner
            </h1>
            <p className="text-[10px]" style={{ color: '#8B7355' }}>Best time to buy — based on your birth chart &amp; panchang</p>
          </div>
        </div>

        <div className="px-4 lg:px-8 py-6 max-w-2xl mx-auto space-y-6">
          {/* ── Hero ── */}
          <ScrollReveal>
            <div
              className="rounded-2xl overflow-hidden relative"
              style={{
                background: 'linear-gradient(135deg, rgba(212, 175, 55,0.12) 0%, rgba(245,239,224,0) 60%)',
                border: '1px solid rgba(212, 175, 55,0.28)',
              }}
            >
              <div className="absolute inset-0 pointer-events-none" style={{
                background: 'radial-gradient(ellipse at top right, rgba(212, 175, 55,0.08) 0%, transparent 60%)',
              }} />
              <div className="relative px-5 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">🛍️</span>
                      <h2 className="font-[family-name:var(--font-serif)] text-xl font-bold" style={{ color: '#2d1a00' }}>
                        Planning to Buy?
                      </h2>
                    </div>
                    <p className="text-sm leading-relaxed max-w-sm" style={{ color: '#6B5544' }}>
                      Let the stars guide your next big purchase. Get Vedic timing aligned with your birth chart, nakshatra, and planetary positions.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {['📅 Booking Date', '🚚 Delivery Date', '⭐ Auspicious Muhurta'].map((tag) => (
                        <span key={tag} className="text-[10px] font-semibold px-2 py-1 rounded-full" style={{ background: 'rgba(212, 175, 55,0.12)', color: 'var(--text)', border: '1px solid rgba(212, 175, 55,0.25)' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleModalOpen()}
                    className="flex-shrink-0 mt-1"
                  >
                    ✦ Start
                  </Button>
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* ── Category cards ── */}
          <ScrollReveal>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#8B7355' }}>
                Select Category
              </p>
              <div className="grid grid-cols-2 gap-3">
                {PURCHASE_CARDS.map((c) => (
                  <motion.button
                    key={c.id}
                    onClick={() => handleModalOpen(c.id)}
                    whileHover={{ y: -3, scale: 1.01 }}
                    whileTap={{ scale: 0.97 }}
                    className="rounded-2xl p-5 text-left relative overflow-hidden transition-all"
                    style={{
                      background: 'rgba(255,255,255,0.70)',
                      border: '1px solid rgba(212, 175, 55,0.22)',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[rgba(212, 175, 55,0.5)] to-transparent" />
                    <span className="text-3xl block mb-2">{c.icon}</span>
                    <p className="text-sm font-bold font-[family-name:var(--font-serif)]" style={{ color: '#2d1a00' }}>{c.label}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#8B7355' }}>{c.sub}</p>
                    <div className="mt-3 flex items-center gap-1">
                      <span className="text-[10px] font-semibold" style={{ color: 'var(--text)' }}>Analyze →</span>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          </ScrollReveal>

          {/* ── Info strip ── */}
          <ScrollReveal>
            <div className="grid grid-cols-3 gap-2">
              {[
                { emoji: '🔮', title: 'Birth Chart', sub: 'Personal planetary analysis' },
                { emoji: '📿', title: 'Nakshatra', sub: 'Lunar asterism timing' },
                { emoji: '⚡', title: 'Dasha', sub: 'Current planetary period' },
              ].map((item) => (
                <div key={item.title} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.50)', border: '1px solid rgba(212, 175, 55,0.15)' }}>
                  <span className="text-xl block mb-1">{item.emoji}</span>
                  <p className="text-[10px] font-bold" style={{ color: '#3E2723' }}>{item.title}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: '#8B7355' }}>{item.sub}</p>
                </div>
              ))}
            </div>
          </ScrollReveal>

          {/* ── Previous analyses ── */}
          {plans.length > 0 && (
            <ScrollReveal>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: '#8B7355' }}>
                  🕐 Your Analyses
                </p>
                <PurchasePlanResults
                  plans={plans}
                  pollingId={pollingId}
                  onPolled={handlePolled}
                />
              </div>
            </ScrollReveal>
          )}

          <div className="pb-8" />
        </div>
      </MotionPage>

      {/* ── Modal ── */}
      <PurchasePlanModal
        isOpen={modalOpen}
        panchangDate={today}
        initialCategory={modalCategory}
        onClose={() => setModalOpen(false)}
        onSubmitted={handleSubmitted}
      />
    </div>
  );
}
