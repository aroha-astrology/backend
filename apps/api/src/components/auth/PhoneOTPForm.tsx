'use client';

import { useEffect, useRef, useState } from 'react';
import { usePhoneOTP } from '@/hooks/usePhoneOTP';

export function PhoneOTPForm() {
  const { state, error, sendOTP, verifyOTP, resendOTP } = usePhoneOTP();

  const [phoneInput, setPhoneInput] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (state === 'otp_sent') {
      setCountdown(30);
      timerRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(timerRef.current!); return 0; }
          return c - 1;
        });
      }, 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state]);

  const handleSend = (e: React.FormEvent) => { e.preventDefault(); sendOTP(phoneInput); };
  const handleVerify = (e: React.FormEvent) => { e.preventDefault(); verifyOTP(otpInput); };
  const handleResend = () => { setOtpInput(''); resendOTP(); };

  const isSending = state === 'sending';
  const isVerifying = state === 'verifying';
  const isDone = state === 'done';
  const otpView = state === 'otp_sent' || isVerifying || isDone;

  if (!otpView) {
    return (
      <form onSubmit={handleSend} className="space-y-4">
        <div>
          <label className="block text-xs text-text-muted mb-1.5">Mobile number</label>
          <div className="flex items-center gap-2 rounded-full border border-border-strong bg-surface-2 px-4 py-3 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/30 transition-all">
            <span className="text-[14px] text-text-muted select-none shrink-0">🇮🇳 +91</span>
            <div className="w-px h-4 bg-border shrink-0" />
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              placeholder="9876543210"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value.replace(/\D/g, '').slice(0, 10))}
              className="flex-1 bg-transparent text-[14px] text-text placeholder:text-text-muted/50 outline-none min-w-0"
              autoComplete="tel-national"
              disabled={isSending}
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-400 leading-snug">{error}</p>}

        <button
          type="submit"
          disabled={isSending || phoneInput.length < 10}
          className="flex w-full items-center justify-center rounded-full py-3 text-[14px] font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {isSending ? (
            <span className="flex items-center gap-2"><Spinner /> Sending OTP…</span>
          ) : (
            'Send OTP'
          )}
        </button>

        <div id="recaptcha-container" />
      </form>
    );
  }

  return (
    <form onSubmit={handleVerify} className="space-y-4">
      <div>
        <label className="block text-xs text-text-muted mb-1.5">
          OTP sent to +91 {phoneInput}
        </label>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="6-digit OTP"
          value={otpInput}
          onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="w-full rounded-full border border-border-strong bg-surface-2 px-4 py-3 text-[14px] text-text placeholder:text-text-muted/50 outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all tracking-[0.3em] text-center"
          autoComplete="one-time-code"
          disabled={isVerifying || isDone}
          autoFocus
        />
      </div>

      {error && <p className="text-xs text-red-400 leading-snug">{error}</p>}

      <button
        type="submit"
        disabled={isVerifying || isDone || otpInput.length < 6}
        className="flex w-full items-center justify-center rounded-full py-3 text-[14px] font-semibold bg-primary text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
      >
        {isVerifying || isDone ? (
          <span className="flex items-center gap-2"><Spinner /> Verifying…</span>
        ) : (
          'Verify OTP'
        )}
      </button>

      <div className="text-center text-[12px] text-text-muted">
        {countdown > 0 ? (
          <span>Resend in {countdown}s</span>
        ) : (
          <button type="button" onClick={handleResend} className="text-primary hover:underline cursor-pointer">
            Resend OTP
          </button>
        )}
      </div>
    </form>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
