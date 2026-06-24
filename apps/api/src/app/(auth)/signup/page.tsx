'use client';

export const dynamic = 'force-dynamic';

import { useState, useRef, useEffect, Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { signInWithPhoneNumber, RecaptchaVerifier, ConfirmationResult } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { Constellation, TokenGlyph } from '@/components/ui/decorative';

function normalisePhone(digits: string) {
  return `+91${digits.replace(/\D/g, '').replace(/^0/, '')}`;
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SignUpContent />
    </Suspense>
  );
}

function SignUpContent() {
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [referralOpen, setReferralOpen] = useState(false);

  // Auto-expand and prefill when arriving via /signup?ref=XXXXXX
  useEffect(() => {
    const refParam = searchParams?.get('ref');
    if (refParam && /^\d{6}$/.test(refParam)) {
      setReferralCode(refParam);
      setReferralOpen(true);
    }
  }, [searchParams]);

  const recaptchaRef = useRef<HTMLDivElement>(null);
  const verifierRef = useRef<RecaptchaVerifier | null>(null);
  const confirmationRef = useRef<ConfirmationResult | null>(null);

  const handleSendOTP = async () => {
    const digits = phone.replace(/\D/g, '');
    if (!/^[6-9]\d{9}$/.test(digits)) {
      toast.error('Enter a valid 10-digit Indian mobile number');
      return;
    }
    setLoading(true);
    try {
      const auth = getFirebaseAuth();
      if (!verifierRef.current) {
        verifierRef.current = new RecaptchaVerifier(auth, recaptchaRef.current!, { size: 'invisible' });
      }
      confirmationRef.current = await signInWithPhoneNumber(auth, normalisePhone(digits), verifierRef.current);
      setOtpSent(true);
      toast.success('OTP sent!');
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Failed to send OTP');
      verifierRef.current = null;
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) { toast.error('Enter the 6-digit OTP'); return; }
    if (!confirmationRef.current) { toast.error('Session expired. Please resend OTP.'); return; }
    setLoading(true);
    try {
      const credential = await confirmationRef.current.confirm(otp);
      const idToken = await credential.user.getIdToken();

      const trimmedCode = referralCode.trim();
      const refPayload = /^\d{6}$/.test(trimmedCode) ? { referralCode: trimmedCode } : {};

      const res = await fetch('/api/auth/phone-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, ...refPayload }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Sign-up failed');
      }
      const { tokenHash, type, isNewUser, referralAccepted } = await res.json() as {
        tokenHash: string;
        type: string;
        isNewUser?: boolean;
        referralAccepted?: boolean;
      };

      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'email' });
      if (error) throw error;

      if (referralAccepted) {
        toast.success('+10 Dhanam will arrive once you finish setup');
      } else if (trimmedCode && /^\d{6}$/.test(trimmedCode) && isNewUser) {
        toast.error('That referral code did not match — signup still completed');
      }

      window.location.href = isNewUser ? '/onboarding' : '/dashboard';
    } catch (e: unknown) {
      toast.error((e as Error).message ?? 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-5 bg-bg overflow-hidden">
      {/* invisible reCAPTCHA container */}
      <div ref={recaptchaRef} />

      <Constellation
        width={160}
        height={90}
        opacity={0.2}
        className="absolute top-8 left-6 hidden md:block"
      />

      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.2, 0.7, 0.2, 1] }}
      >
        <div className="mb-6 text-center">
          <div className="flex justify-center mb-4">
            <Image src="/logo.png" alt="Aroha Astrology" width={56} height={56} className="rounded-2xl shadow-sm" />
          </div>
          <p className="j-eyebrow text-accent text-[10px] mb-1.5" data-no-translate>
            <span style={{ fontFamily: 'var(--font-devanagari)' }}>नमस्ते</span> · NAMASTE
          </p>
          <h1 className="j-display text-2xl text-text" data-no-translate>Aroha Astrology</h1>
          <p className="mt-1.5 text-sm text-text-muted">Begin your cosmic journey</p>
        </div>

        <div className="mb-4 flex items-center justify-center gap-1.5 rounded-full py-2 px-4 text-[12px] font-semibold bg-primary/8 border border-primary/20 text-primary">
          <TokenGlyph size={10} />
          Free janma kundli + 5 questions on signup
        </div>

        <div className="mb-3 rounded-2xl border border-primary/25 bg-primary/[0.06] px-4 py-2.5 text-center text-[11.5px] text-text-secondary leading-relaxed">
          Sign up and start with <span className="font-semibold text-primary">+10 Dhanam</span> when you join with a friend's code.
        </div>

        <div className="rounded-2xl bg-surface border border-border p-6 shadow-[0_4px_24px_rgba(36,28,21,0.06)]">
          <h2 className="j-display text-base text-text mb-5 text-center">Create your account</h2>

          <AnimatePresence mode="wait">
            {!otpSent ? (
              <motion.div
                key="phone"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <div className="flex rounded-xl border border-border overflow-hidden mb-3 bg-surface-2">
                  <span className="flex items-center px-3 text-sm text-text-muted border-r border-border whitespace-nowrap">
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="Mobile number"
                    maxLength={10}
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    onKeyDown={e => e.key === 'Enter' && handleSendOTP()}
                    className="flex-1 bg-transparent px-3 py-3 text-sm text-text placeholder:text-text-muted/50 outline-none"
                  />
                </div>

                <div className="mb-3">
                  {!referralOpen ? (
                    <button
                      type="button"
                      onClick={() => setReferralOpen(true)}
                      className="w-full text-center text-[11.5px] text-text-muted hover:text-primary transition-colors bg-transparent border-0 cursor-pointer underline decoration-dotted underline-offset-2"
                    >
                      Have a referral code? +10 Dhanam →
                    </button>
                  ) : (
                    <div className="rounded-xl border border-primary/30 bg-surface-2/60 p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <label htmlFor="referral-code" className="text-[10px] uppercase tracking-[0.15em] text-primary/90 font-semibold">
                          Referral code
                        </label>
                        <button
                          type="button"
                          onClick={() => { setReferralOpen(false); setReferralCode(''); }}
                          className="text-[10px] text-text-muted hover:text-text bg-transparent border-0 cursor-pointer"
                        >
                          Skip
                        </button>
                      </div>
                      <input
                        id="referral-code"
                        type="tel"
                        inputMode="numeric"
                        placeholder="6-digit code"
                        maxLength={6}
                        value={referralCode}
                        onChange={e => setReferralCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full rounded-lg bg-bg/40 border border-border px-3 py-2 text-center text-base tracking-[0.35em] font-semibold text-primary placeholder:text-text-muted/40 outline-none focus:border-primary/60"
                      />
                      <p className="mt-1.5 text-[10.5px] text-text-muted text-center leading-relaxed">
                        You get +10 Dhanam. Your friend earns +20 Dhanam when you finish setup.
                      </p>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleSendOTP}
                  disabled={loading}
                  className="w-full rounded-full py-3 text-[14px] font-medium bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
                >
                  {loading ? 'Sending…' : 'Send OTP'}
                </button>
              </motion.div>
            ) : (
              <motion.div
                key="otp"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <p className="text-center text-xs text-text-muted mb-3">OTP sent to +91 {phone}</p>
                <input
                  type="tel"
                  inputMode="numeric"
                  placeholder="• • • • • •"
                  maxLength={6}
                  value={otp}
                  autoFocus
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={e => e.key === 'Enter' && handleVerifyOTP()}
                  className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-center text-xl tracking-[0.5em] font-semibold text-text placeholder:text-text-muted/40 outline-none focus:border-accent mb-3"
                />
                <button
                  onClick={handleVerifyOTP}
                  disabled={loading}
                  className="w-full rounded-full py-3 text-[14px] font-medium bg-accent text-white hover:opacity-90 transition-opacity disabled:opacity-60 cursor-pointer"
                >
                  {loading ? 'Verifying…' : 'Verify & Create account'}
                </button>
                <button
                  onClick={() => { setOtpSent(false); setOtp(''); verifierRef.current = null; }}
                  className="w-full mt-2 text-xs text-text-muted/70 hover:text-text-muted underline cursor-pointer bg-transparent border-0"
                >
                  Change number / Resend OTP
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-4 text-center text-xs text-text-muted">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </p>
          <p className="mt-2 text-center text-[11px] text-text-muted/70">
            By registering, you agree to our{' '}
            <Link href="/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-muted">
              Terms &amp; Conditions
            </Link>{' '}
            and{' '}
            <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-text-muted">
              Privacy Policy
            </Link>.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-text-muted/80">
          <span className="flex items-center gap-1">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
              <rect width="18" height="11" x="3" y="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Encrypted
          </span>
          <span className="opacity-40">·</span>
          <span>Never shared or sold</span>
          <span className="opacity-40">·</span>
          <span>Razorpay secure</span>
        </div>
      </motion.div>
    </div>
  );
}
