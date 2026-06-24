'use client';

import { useEffect, useRef, useState } from 'react';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  type ConfirmationResult,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { createClient } from '@/lib/supabase/client';

type OTPState = 'idle' | 'sending' | 'otp_sent' | 'verifying' | 'done';

const FIREBASE_ERRORS: Record<string, string> = {
  'auth/invalid-phone-number': 'Enter a valid 10-digit mobile number.',
  'auth/too-many-requests': 'Too many attempts. Please try again after some time.',
  'auth/code-expired': 'OTP expired. Please request a new one.',
  'auth/invalid-verification-code': 'Incorrect OTP. Please try again.',
  'auth/quota-exceeded': 'SMS quota exceeded. Please contact support.',
  'auth/captcha-check-failed': 'reCAPTCHA check failed. Please refresh and try again.',
  'auth/missing-phone-number': 'Phone number is required.',
};

function friendlyError(code: string): string {
  return FIREBASE_ERRORS[code] ?? 'Something went wrong. Please try again.';
}

function normalisePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const local = digits.startsWith('0') ? digits.slice(1) : digits;
  return `+91${local}`;
}

function isValidIndianMobile(local: string): boolean {
  return /^[6-9]\d{9}$/.test(local);
}

export function usePhoneOTP() {
  const [state, setState] = useState<OTPState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [phone, setPhone] = useState('');

  const confirmationRef = useRef<ConfirmationResult | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  function initRecaptcha() {
    const auth = getFirebaseAuth();
    if (recaptchaRef.current) {
      try { recaptchaRef.current.clear(); } catch { /* ignore stale verifier */ }
      recaptchaRef.current = null;
    }
    // grecaptcha tracks widgets by element ID; if a stale iframe is still inside,
    // re-rendering throws "reCAPTCHA has already been rendered in this element".
    const container = typeof document !== 'undefined' ? document.getElementById('recaptcha-container') : null;
    if (container) container.innerHTML = '';
    recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {},
    });
  }

  useEffect(() => {
    return () => {
      if (recaptchaRef.current) {
        try { recaptchaRef.current.clear(); } catch { /* ignore */ }
        recaptchaRef.current = null;
      }
      const container = typeof document !== 'undefined' ? document.getElementById('recaptcha-container') : null;
      if (container) container.innerHTML = '';
    };
  }, []);

  async function sendOTP(rawPhone: string) {
    setError(null);
    const local = rawPhone.replace(/\D/g, '').replace(/^0/, '');
    if (!isValidIndianMobile(local)) {
      setError('Enter a valid 10-digit Indian mobile number (starts with 6–9).');
      return;
    }
    const e164 = normalisePhone(rawPhone);
    setPhone(e164);
    setState('sending');
    try {
      initRecaptcha();
      const auth = getFirebaseAuth();
      const result = await signInWithPhoneNumber(auth, e164, recaptchaRef.current!);
      confirmationRef.current = result;
      setState('otp_sent');
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      setError(friendlyError(code));
      setState('idle');
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    }
  }

  async function verifyOTP(code: string) {
    if (!confirmationRef.current) return;
    setError(null);
    setState('verifying');
    try {
      const result = await confirmationRef.current.confirm(code);
      const idToken = await result.user.getIdToken();

      const res = await fetch('/api/auth/phone-signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Sign-in failed');
      }

      const { tokenHash, type, isNewUser } = (await res.json()) as {
        tokenHash: string;
        type: string;
        isNewUser: boolean;
      };

      const supabase = createClient();
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as 'email',
      });
      if (verifyErr) throw verifyErr;

      setState('done');
      window.location.href = isNewUser ? '/onboarding' : '/dashboard';
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      setError(friendlyError(code) || (err as Error).message || 'Verification failed.');
      setState('otp_sent');
    }
  }

  async function resendOTP() {
    setState('idle');
    setError(null);
    confirmationRef.current = null;
    await sendOTP(phone.replace('+91', ''));
  }

  return { state, error, sendOTP, verifyOTP, resendOTP, phone };
}
