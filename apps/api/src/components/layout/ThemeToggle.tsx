'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-8 w-8" aria-hidden />;

  const isLight = theme === 'light';

  return (
    <button
      onClick={() => setTheme(isLight ? 'default' : 'light')}
      className="group relative flex h-9 w-9 items-center justify-center rounded-full border border-[#D4AF37]/30 bg-[#D4AF37]/10 transition-all hover:border-[#D4AF37]/60 hover:bg-[#D4AF37]/20 hover:shadow-[0_0_12px_rgba(212,175,55,0.35)]"
      aria-label={isLight ? 'Switch to Vedic Night theme' : 'Switch to Light theme'}
      title={isLight ? 'Vedic Night' : 'Light'}
    >
      {isLight ? (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="#D4AF37"
          className="transition-transform duration-300 group-hover:-rotate-12"
          aria-hidden
        >
          <path d="M21 12.79A9 9 0 0 1 11.21 3a1 1 0 0 0-1.2-1.28A11 11 0 1 0 22.28 14a1 1 0 0 0-1.28-1.21z" />
        </svg>
      ) : (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="#D4AF37"
          className="transition-transform duration-300 group-hover:rotate-45"
          aria-hidden
        >
          <circle cx="12" cy="12" r="4.5" />
          <g stroke="#D4AF37" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="2.5" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="21.5" />
            <line x1="2.5" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="21.5" y2="12" />
            <line x1="5.1" y1="5.1" x2="6.9" y2="6.9" />
            <line x1="17.1" y1="17.1" x2="18.9" y2="18.9" />
            <line x1="5.1" y1="18.9" x2="6.9" y2="17.1" />
            <line x1="17.1" y1="6.9" x2="18.9" y2="5.1" />
          </g>
        </svg>
      )}
    </button>
  );
}
