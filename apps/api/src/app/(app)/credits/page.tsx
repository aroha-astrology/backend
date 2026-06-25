'use client';

import { useEffect, useState, useCallback } from 'react';
import { useStore } from '@/store/useStore';
import { startPayment } from '@/lib/payments';
import { motion, AnimatePresence } from 'framer-motion';
import { MotionPage, FadeIn, CountUp } from '@/components/ui/motion-primitives';
import { useTokenToast } from '@/components/ui/TokenToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkeletonCard } from '@/components/ui/skeleton';
import { TokenGlyph } from '@/components/ui/decorative';
import { ShareCard } from '@/components/referral/ShareCard';

interface ReferralShareData {
  link: string;
  whatsapp: string;
  telegram: string;
  sms: string;
  rawMessage: string;
}
interface ReferralPayload {
  referralCode: string;
  share: ReferralShareData;
  referrerBonus: number;
  inviteeBonus: number;
}

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, callback: () => void) => void;
    };
  }
}

const PACKS = [
  { id: 'pack_10',  credits: 10,  price: 99,  originalPrice: null, label: 'Starter',    badge: null,       badgeStyle: 'none'    as const, perCredit: '₹9.9',  popular: false },
  { id: 'pack_30',  credits: 30,  price: 199, originalPrice: 249,  label: 'Popular',    badge: '20% OFF',  badgeStyle: 'gold'    as const, savings: 50,  perCredit: '₹6.6',  popular: true  },
  { id: 'pack_100', credits: 100, price: 599, originalPrice: 699,  label: 'Best Value', badge: '14% OFF',  badgeStyle: 'emerald' as const, savings: 100, perCredit: '₹5.9', popular: false },
] as const;

const TOKEN_COSTS = [
  { feature: 'Kundli Generation',         cost: 'Free',           icon: '♾️', highlight: true  },
  { feature: 'Chat with Yogi Baba',        cost: '1 Dhanam / session', icon: '🔮' },
  { feature: 'Predictions, Palm, Match',  cost: '1 Dhanam each',   icon: '⭐' },
  { feature: 'Tarot, Vastu, Muhurta',     cost: '1 Dhanam each',   icon: '🌟' },
  { feature: 'All other features',        cost: '1 Dhanam each',   icon: '✦'  },
];

interface Transaction {
  id: string;
  amount: number;
  type: string;
  created_at: string;
  description: string;
}

function formatDate(raw: string): string {
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

export default function CreditsPage() {
  const credits = useStore((s) => s.credits);
  const setCredits = useStore((s) => s.setCredits);
  const user = useStore((s) => s.user);
  const setUser = useStore((s) => s.setUser);
  const { showSuccess, showError } = useTokenToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [buying, setBuying] = useState(false);
  const [selectedPacks, setSelectedPacks] = useState<Set<string>>(new Set());
  const [customInput, setCustomInput] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [redeemingCoupon, setRedeemingCoupon] = useState(false);
  const [couponError, setCouponError] = useState('');
  const [referral, setReferral] = useState<ReferralPayload | null>(null);

  const togglePack = (id: string) =>
    setSelectedPacks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const CUSTOM_RATE = 10; // ₹10 per Dhanam (GST-inclusive)
  const GST_RATE    = 0.18;
  // All prices are GST-inclusive; split for display
  const gstBreakdown = (totalInclGst: number) => {
    const base = Math.round(totalInclGst / (1 + GST_RATE));
    return { base, gst: totalInclGst - base };
  };

  const customCredits = parseInt(customInput, 10);
  const validCustom = !isNaN(customCredits) && customCredits >= 5 && customCredits <= 10000;

  const selectedList = PACKS.filter(p => selectedPacks.has(p.id));
  const totalCredits = selectedList.reduce((s, p) => s + p.credits, 0) + (validCustom ? customCredits : 0);
  const totalPrice   = selectedList.reduce((s, p) => s + p.price,   0) + (validCustom ? customCredits * CUSTOM_RATE : 0);
  const hasSelection = selectedList.length > 0 || validCustom;
  const { base: totalBase, gst: totalGst } = gstBreakdown(totalPrice);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch('/api/credits/history');
      if (res.ok) {
        const json = await res.json();
        setTransactions(json.data ?? []);
      }
    } catch { /* ignore */ } finally { setLoadingHistory(false); }
  }, []);

  useEffect(() => {
    loadHistory();
    fetch('/api/credits/balance')
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.success) setCredits(json.data.credits); })
      .catch(() => {});
    fetch('/api/referral')
      .then(r => r.ok ? r.json() : null)
      .then(json => { if (json?.success) setReferral(json.data); })
      .catch(() => {});
  }, [loadHistory, setCredits]);

  const handleCheckout = async () => {
    if (!hasSelection) return;
    // On Android, open payment in device browser — Razorpay SDK can't run in WebView.
    if ((window as any).Capacitor?.isNativePlatform()) {
      await startPayment('tokens');
      return;
    }

    setBuying(true);
    try {
      const orderRes = await fetch('/api/credits/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pack_ids: selectedList.map(p => p.id),
          ...(validCustom ? { custom_credits: customCredits } : {}),
        }),
      });
      if (!orderRes.ok) throw new Error('Order creation failed');
      const orderData = await orderRes.json();
      const parts = [
        ...selectedList.map(p => `${p.credits} Dhanam`),
        ...(validCustom ? [`${customCredits} Custom`] : []),
      ];
      const desc = parts.length === 1 ? `${parts[0]} Pack` : `${totalCredits} Dhanam (${parts.join(' + ')})`;
      const options = {
        key: orderData.data.razorpay_key,
        amount: totalPrice * 100,
        currency: 'INR',
        name: 'Aroha Astrology',
        description: desc,
        order_id: orderData.data.order_id,
        handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            const verifyRes = await fetch('/api/credits/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            if (verifyRes.ok) {
              const verifyData = await verifyRes.json();
              setCredits(verifyData.data.credits);
              setSelectedPacks(new Set());
              setCustomInput('');
              loadHistory();
            }
          } catch { /* ignore */ }
          setBuying(false);
        },
        modal: { ondismiss: () => setBuying(false) },
        theme: { color: 'var(--text)' },
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch { setBuying(false); }
  };

  const handleRedeemCoupon = async () => {
    const code = couponCode.trim().toUpperCase();
    if (!code) { setCouponError('Please enter a coupon code'); return; }
    setCouponError('');
    setRedeemingCoupon(true);
    try {
      const res = await fetch('/api/credits/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCredits(data.data.credits);
        setCouponCode('');
        loadHistory();
        // Reflect a freshly-granted perk in the local store so the call button
        // appears in the chat header immediately, no reload required.
        if (data.data.perk === 'voice_call' && user) {
          setUser({ ...user, voice_call_enabled: true });
        }
        const tokensAdded = data.data.tokens_added ?? 0;
        if (data.data.perk === 'voice_call') {
          showSuccess('Voice Call Unlocked!', 'Open any chat and tap the phone icon to start a call.');
        } else {
          showSuccess('Coupon Redeemed!', `${tokensAdded} Dhanam added to your account.`);
        }
      } else {
        const msg = data.error === 'Invalid coupon code'
          ? 'Invalid coupon code. Please check and try again.'
          : data.error === 'This coupon has already been used'
          ? 'This coupon has already been used.'
          : data.error ?? 'Failed to redeem coupon';
        setCouponError(msg);
        showError(msg);
      }
    } catch { setCouponError('Network error. Please try again.'); } finally { setRedeemingCoupon(false); }
  };

  return (
    <MotionPage className="min-h-screen bg-bg">
      <div className="mx-auto max-w-3xl px-4 py-6">

        {/* Header */}
        <FadeIn>
          <p className="j-eyebrow mb-1">Account</p>
          <h1 className="j-display text-2xl text-text mb-6">Dhanam &amp; Payments</h1>
        </FadeIn>

        {/* Balance card */}
        <FadeIn delay={0.05}>
          <div className="relative mb-6 overflow-hidden rounded-2xl p-6 text-center bg-surface border border-border shadow-[0_4px_24px_rgba(36,28,21,0.06)]">
            <div className="absolute top-0 right-0 w-32 h-32 opacity-10 pointer-events-none"
              style={{ background: 'radial-gradient(circle, var(--primary) 0%, transparent 70%)' }} />
            <p className="j-eyebrow text-[10px] mb-2">Current Balance</p>
            <div className="flex items-baseline justify-center gap-2 mb-1">
              <span className="text-6xl font-bold text-primary j-mono">
                <CountUp value={credits} />
              </span>
              <span className="text-xl text-text-muted font-medium">Dhanam</span>
            </div>
            <p className="text-sm text-text-muted mb-3">available for use</p>
            <div className="flex justify-center gap-6 text-[11px] text-text-muted">
              <span className="flex items-center gap-1"><TokenGlyph size={9} /> 1 Dhanam = 1 feature</span>
              <span className="flex items-center gap-1"><TokenGlyph size={9} /> Never expires</span>
            </div>
          </div>
        </FadeIn>

        {/* Refer & Earn share card */}
        {referral && (
          <FadeIn delay={0.06}>
            <div className="mb-6">
              <ShareCard
                code={referral.referralCode}
                share={referral.share}
                referrerBonus={referral.referrerBonus}
                inviteeBonus={referral.inviteeBonus}
                variant="full"
              />
            </div>
          </FadeIn>
        )}

        {/* Token Cost Guide */}
        <FadeIn delay={0.07}>
          <p className="j-eyebrow mb-3">Dhanam Costs</p>
          <div className="mb-6 rounded-2xl overflow-hidden bg-surface border border-border">
            {TOKEN_COSTS.map((item, i) => (
              <div
                key={item.feature}
                className={`flex items-center justify-between px-4 py-2.5 ${i < TOKEN_COSTS.length - 1 ? 'border-b border-border' : ''} ${item.highlight ? 'bg-success/[0.04]' : ''}`}
              >
                <span className="text-sm text-text-muted flex items-center gap-2">
                  <span>{item.icon}</span>
                  {item.feature}
                </span>
                <span className={`text-xs font-semibold rounded-full px-2.5 py-0.5 ${item.highlight ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}>
                  {item.cost}
                </span>
              </div>
            ))}
          </div>
        </FadeIn>

        {/* Redeem Coupon */}
        <FadeIn delay={0.09}>
          <p className="j-eyebrow mb-3">Redeem Coupon</p>
          <div className="mb-6 rounded-2xl p-5 bg-surface border border-border">
            <p className="text-sm text-text-muted mb-3">
              Have a coupon code? Enter it below to add Dhanam to your account.
            </p>
            <div className="flex flex-col items-center gap-3">
              <input
                type="text"
                value={couponCode}
                onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(''); }}
                onKeyDown={(e) => e.key === 'Enter' && handleRedeemCoupon()}
                placeholder="e.g. JYOTISH40"
                maxLength={20}
                className={`w-full max-w-xs text-center rounded-[10px] border px-4 py-3 text-sm j-mono tracking-widest outline-none transition-all bg-bg text-primary placeholder:text-text-muted/50 focus:shadow-[0_0_0_3px_rgba(212, 175, 55,0.18)] ${couponError ? 'border-danger focus:border-danger' : 'border-border-strong focus:border-primary'}`}
              />
              <Button onClick={handleRedeemCoupon} isLoading={redeemingCoupon} disabled={!couponCode.trim()}>
                Redeem
              </Button>
            </div>
            <AnimatePresence>
              {couponError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-2 text-xs text-danger"
                >
                  {couponError}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </FadeIn>

        {/* Buy Credits */}
        <FadeIn delay={0.1}>
          <p className="j-eyebrow mb-1">Buy Dhanam</p>
          <p className="text-xs text-text-muted mb-4">Select one or more packs to buy together</p>
        </FadeIn>

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {PACKS.map((pack, i) => {
            const isSelected = selectedPacks.has(pack.id);
            return (
              <FadeIn key={pack.id} delay={0.12 + i * 0.06}>
                <motion.div
                  whileHover={{ y: -2, transition: { duration: 0.15 } }}
                  className={`relative h-full rounded-2xl ${pack.popular ? 'ring-2 ring-primary/40' : ''} ${pack.badge ? 'pt-3' : ''}`}
                >
                  {pack.badgeStyle === 'gold' && (
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                      <span className="rounded-full px-3 py-0.5 text-[10px] font-bold tracking-wider whitespace-nowrap bg-[#F59E0B] text-black shadow-[0_0_10px_rgba(245,158,11,0.45)]">
                        {pack.badge}
                      </span>
                    </div>
                  )}
                  {pack.badgeStyle === 'emerald' && (
                    <div className="absolute top-0 right-3 -translate-y-1/2 z-10">
                      <span className="rounded-md px-2.5 py-0.5 text-[10px] font-bold tracking-wider whitespace-nowrap bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        {pack.badge}
                      </span>
                    </div>
                  )}

                  <div
                    onClick={() => togglePack(pack.id)}
                    className={`cursor-pointer flex flex-col h-full rounded-2xl overflow-hidden p-5 bg-surface border transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/[0.07] ring-1 ring-primary/30'
                        : pack.popular
                        ? 'border-primary/40 bg-primary/[0.04]'
                        : 'border-border'
                    }`}
                  >
                    {/* Selected checkmark */}
                    <div className={`absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center transition-all ${isSelected ? 'bg-primary' : 'bg-border/50'}`}>
                      {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                    </div>

                    <div className="text-center flex-1 mt-2">
                      <p className="j-eyebrow text-[9px] mb-2">{pack.label}</p>
                      <div className="mb-3">
                        <span className="text-5xl font-bold text-text j-mono">{pack.credits}</span>
                        <span className="ml-1.5 text-sm text-text-muted">Dhanam</span>
                      </div>
                      <div className="mb-1">
                        {pack.originalPrice && (
                          <span className="mr-1.5 text-xs line-through text-text-muted">₹{pack.originalPrice}</span>
                        )}
                        <span className="text-2xl font-bold text-text">₹{pack.price}</span>
                      </div>
                      {'savings' in pack && pack.savings ? (
                        <p className="mb-1 text-[10px] font-semibold text-success">You save ₹{pack.savings}</p>
                      ) : (
                        <div className="mb-1 h-4" />
                      )}
                      <p className="text-[10px] text-text-muted">{pack.perCredit} per Dhanam</p>
                      <p className="text-[9px] text-text-muted/50 mb-4">Incl. 18% GST</p>
                    </div>

                    <div
                      className={`w-full py-2 rounded-xl text-xs font-bold text-center transition-all ${
                        isSelected
                          ? 'bg-primary text-white'
                          : 'bg-primary/10 text-primary border border-primary/20'
                      }`}
                    >
                      {isSelected ? '✓ Added' : 'Add'}
                    </div>
                  </div>
                </motion.div>
              </FadeIn>
            );
          })}
        </div>

        {/* Custom Dhanam input card */}
        <FadeIn delay={0.22}>
          <div className={`rounded-2xl overflow-hidden p-5 bg-surface border transition-all ${validCustom ? 'border-primary ring-1 ring-primary/30 bg-primary/[0.07]' : 'border-border'}`}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="j-eyebrow text-[9px] mb-0.5">Custom Amount</p>
                <p className="text-xs text-text-muted">₹{CUSTOM_RATE}/Dhanam incl. 18% GST · min 5, max 10,000</p>
              </div>
              {validCustom && (
                <span className="text-[10px] font-bold text-primary">₹{customCredits * CUSTOM_RATE}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={5}
                max={10000}
                placeholder="e.g. 25"
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-bg px-4 py-2.5 text-xl font-bold text-primary j-mono text-center outline-none focus:border-primary/60 transition-colors"
              />
              <div className="text-sm text-text-muted">Dhanam</div>
            </div>
            {customInput && !validCustom && (
              <p className="mt-1.5 text-[10px] text-error">Enter a value between 5 and 10,000</p>
            )}
          </div>
        </FadeIn>

        {/* Checkout summary */}
        <AnimatePresence>
          {hasSelection && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mb-8 rounded-2xl p-4 bg-primary/[0.07] border border-primary/30"
            >
              <p className="text-xs text-text-muted mb-2">Your selection</p>
              <p className="text-sm font-semibold text-text mb-3">
                {[
                  ...selectedList.map(p => `${p.credits} Dhanam`),
                  ...(validCustom ? [`${customCredits} Custom`] : []),
                ].join(' + ')} = <span className="text-primary">{totalCredits} Dhanam</span>
              </p>

              {/* GST breakdown */}
              <div className="rounded-xl bg-bg/50 border border-border/50 p-3 mb-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-text-muted">
                  <span>Subtotal (excl. GST)</span>
                  <span>₹{totalBase}</span>
                </div>
                <div className="flex justify-between text-text-muted">
                  <span>GST @ 18%</span>
                  <span>₹{totalGst}</span>
                </div>
                <div className="flex justify-between font-bold text-text border-t border-border/50 pt-1.5 mt-1.5">
                  <span>Total (incl. GST)</span>
                  <span className="text-primary">₹{totalPrice}</span>
                </div>
              </div>

              <Button
                onClick={handleCheckout}
                isLoading={buying}
                disabled={buying || !hasSelection}
                variant="primary"
                className="w-full"
              >
                Pay ₹{totalPrice}
              </Button>

              {referral && (
                <p className="mt-3 text-center text-[11.5px] text-text-muted leading-relaxed">
                  Want more Dhanam without paying? Share your code{' '}
                  <span className="font-semibold text-primary tracking-[0.15em]">{referral.referralCode}</span>{' '}
                  — earn +{referral.referrerBonus} per friend.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* UPI / payment trust strip — Indian users trust the wallet name (GPay,
            PhonePe, Paytm) far more than the gateway brand. Surfacing it here
            converts undecided buyers. */}
        <FadeIn delay={0.25}>
          <div className="mb-5 flex flex-col items-center gap-2">
            <p className="j-caption text-text-muted">Pay with any UPI app, card, or wallet</p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {['GPay', 'PhonePe', 'Paytm', 'BHIM', 'Cards', 'Net Banking'].map((m) => (
                <span
                  key={m}
                  className="rounded-md border border-border bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-text-2"
                >
                  {m}
                </span>
              ))}
            </div>
          </div>
        </FadeIn>

        {/* Guarantees — quiet text row, no emoji clutter so it reads
            consistently across MIUI / One UI / iOS. */}
        <FadeIn delay={0.3}>
          <div className="mb-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              Secure payments via Razorpay
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              Instant Dhanam delivery
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />
              Dhanam never expires
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
              No hidden charges
            </span>
          </div>
        </FadeIn>

        {/* Transaction History */}
        <FadeIn delay={0.2}>
          <p className="j-eyebrow mb-3">Transaction History</p>
          <div className="rounded-2xl overflow-hidden bg-surface border border-border">
            {loadingHistory ? (
              <div className="p-4 space-y-2"><SkeletonCard /><SkeletonCard /></div>
            ) : transactions.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-3xl mb-2">✦</p>
                <p className="text-sm text-text-muted">No transactions yet</p>
                <p className="text-xs text-text-muted/60 mt-1">Buy Dhanam or redeem a coupon to get started</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-2">
                    <th className="px-4 py-3 text-left j-eyebrow text-[10px]">Type</th>
                    <th className="px-4 py-3 text-left j-eyebrow text-[10px]">Amount</th>
                    <th className="px-4 py-3 text-left j-eyebrow text-[10px]">Date</th>
                    <th className="px-4 py-3 text-left j-eyebrow text-[10px]">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {transactions.map((tx, i) => (
                      <motion.tr
                        key={tx.id}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.04 }}
                        className="border-b border-border last:border-0"
                      >
                        <td className="px-4 py-3">
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${tx.amount > 0 ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                            {tx.amount > 0 ? '+' : '−'}
                          </span>
                        </td>
                        <td className={`px-4 py-3 font-semibold ${tx.amount > 0 ? 'text-success' : 'text-danger'}`}>
                          {tx.amount > 0 ? '+' : '−'}{Math.abs(tx.amount)}
                        </td>
                        <td className="px-4 py-3 text-text-muted text-xs">{formatDate(tx.created_at)}</td>
                        <td className="px-4 py-3 text-text-muted text-xs">{tx.description}</td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            )}
          </div>
        </FadeIn>

      </div>
    </MotionPage>
  );
}
