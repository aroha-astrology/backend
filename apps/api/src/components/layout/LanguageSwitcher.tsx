'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/store/useStore';

type LangOption = { code: string; label: string; native: string; voiceSupported: boolean; isMix?: boolean };

// Languages with confirmed ElevenLabs eleven_turbo_v2_5 voice support
export const VOICE_SUPPORTED_LANGS = ['en', 'hi', 'ta', 'en+hi', 'en+ta'];

// For a mixed-mode code like "en+hi" return the native-language part for voice/recognition
export function nativeLangCode(code: string): string {
  return code.includes('+') ? code.split('+')[1] : code;
}

export const LANGUAGES: LangOption[] = [
  // Pure languages
  { code: 'en', label: 'English', native: 'English', voiceSupported: true },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', voiceSupported: true },
  { code: 'bn', label: 'Bengali', native: 'বাংলা', voiceSupported: false },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', voiceSupported: true },
  { code: 'te', label: 'Telugu', native: 'తెలుగు', voiceSupported: false },
  { code: 'mr', label: 'Marathi', native: 'मराठी', voiceSupported: false },
  { code: 'gu', label: 'Gujarati', native: 'ગુજરાતી', voiceSupported: false },
  { code: 'kn', label: 'Kannada', native: 'ಕನ್ನಡ', voiceSupported: false },
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം', voiceSupported: false },
  { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ', voiceSupported: false },
  // Mixed modes — English base with native language warmth
  { code: 'en+hi', label: 'English + Hindi', native: 'EN + हिन्दी', voiceSupported: true, isMix: true },
  { code: 'en+bn', label: 'English + Bengali', native: 'EN + বাংলা', voiceSupported: false, isMix: true },
  { code: 'en+ta', label: 'English + Tamil', native: 'EN + தமிழ்', voiceSupported: true, isMix: true },
  { code: 'en+te', label: 'English + Telugu', native: 'EN + తెలుగు', voiceSupported: false, isMix: true },
  { code: 'en+mr', label: 'English + Marathi', native: 'EN + मराठी', voiceSupported: false, isMix: true },
];

export function LanguageSwitcher() {
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1 rounded-lg px-2 transition-colors hover:bg-surface-2"
        style={{ color: 'var(--text-secondary)' }}
        aria-label="Change language"
        data-no-translate
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="2" y1="12" x2="22" y2="12" />
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        </svg>
        <span className="text-[11px] font-semibold uppercase tracking-wider">{current.code}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-2 right-2 top-14 w-auto sm:absolute sm:left-auto sm:right-0 sm:top-10 sm:w-56 rounded-[14px] border border-border-strong shadow-[0_18px_40px_rgba(0,0,0,0.55),0_0_24px_rgba(212,175,55,0.18)] p-1.5 max-h-[60vh] overflow-y-auto z-50"
            style={{ transformOrigin: 'top right', background: 'var(--surface-2)' }}
            data-no-translate
          >
            <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider j-eyebrow border-b border-border">
              Language
            </div>
            {LANGUAGES.map((l, idx) => {
              const active = l.code === language;
              const prevIsMix = idx > 0 && !LANGUAGES[idx - 1].isMix;
              return (
                <div key={l.code}>
                  {l.isMix && prevIsMix && (
                    <div className="flex items-center gap-2 px-2.5 py-1.5">
                      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                      <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--primary)' }}>Mix</span>
                      <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setLanguage(l.code);
                      setOpen(false);
                      fetch('/api/user/settings', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ language: l.code }),
                      }).catch(() => {});
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-surface-2 cursor-pointer border-none bg-transparent"
                    style={{ color: active ? 'var(--primary)' : 'var(--text)' }}
                  >
                    <span className="text-[12px] font-semibold">{l.native}</span>
                    <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                      {active ? '✓' : !l.voiceSupported ? <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded" style={{ background: 'rgba(124,58,237,0.15)', color: 'var(--primary)' }}>Soon</span> : l.label}
                    </span>
                  </button>
                </div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
