'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { copyToClipboard } from '@/lib/clipboard';

interface ShareData {
  link: string;
  whatsapp: string;
  telegram: string;
  sms: string;
  rawMessage: string;
}

interface ShareCardProps {
  code: string;
  share: ShareData;
  referrerBonus: number;
  inviteeBonus: number;
  variant?: 'full' | 'compact';
}

export function ShareCard({ code, share, referrerBonus, inviteeBonus, variant = 'full' }: ShareCardProps) {
  const [copied, setCopied] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsMobile(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent));
    }
  }, []);

  const handleCopy = async () => {
    const ok = await copyToClipboard(share.rawMessage);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const containerClass =
    variant === 'compact'
      ? 'rounded-2xl border border-primary/25 bg-white/[0.03] p-4 backdrop-blur-md'
      : 'rounded-2xl border border-primary/30 bg-white/[0.03] p-5 backdrop-blur-md shadow-[0_0_24px_rgba(212,175,55,0.18)]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={containerClass}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.18em] text-primary/80">Share &amp; Earn</p>
          <h3 className="mt-0.5 j-display text-base text-text">+{referrerBonus} Dhanam per friend</h3>
          {variant === 'full' && (
            <p className="mt-1 text-xs text-text-secondary leading-relaxed">
              Each friend who joins with your code gives you +{referrerBonus} Dhanam, and earns +{inviteeBonus} themselves.
            </p>
          )}
        </div>
        <div className="flex-shrink-0 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-center">
          <p className="text-[9px] uppercase tracking-[0.15em] text-text-secondary">Your code</p>
          <p className="mt-0.5 j-display text-lg text-primary tracking-[0.18em]">{code}</p>
        </div>
      </div>

      <div className={`mt-${variant === 'full' ? '4' : '3'} flex flex-wrap items-center gap-2`}>
        <a
          href={share.whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366]/12 border border-[#25D366]/40 px-3 py-1.5 text-xs font-medium text-[#25D366] hover:bg-[#25D366]/18 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.52 3.48A11.94 11.94 0 0 0 12 0C5.37 0 0 5.37 0 12c0 2.11.55 4.17 1.6 6L0 24l6.18-1.6A11.95 11.95 0 0 0 12 24c6.63 0 12-5.37 12-12 0-3.19-1.24-6.19-3.48-8.52ZM12 22a9.93 9.93 0 0 1-5.07-1.39l-.36-.21-3.67.95.98-3.58-.23-.37A9.94 9.94 0 0 1 2 12C2 6.49 6.49 2 12 2s10 4.49 10 10-4.49 10-10 10Zm5.46-7.4c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.66.15-.2.3-.76.97-.93 1.17-.17.2-.34.22-.64.07-.3-.15-1.26-.47-2.4-1.49-.89-.79-1.49-1.77-1.67-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.34.45-.51.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.66-1.6-.9-2.18-.24-.58-.49-.5-.66-.51l-.56-.01c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49 0 1.46 1.07 2.87 1.22 3.07.15.2 2.11 3.22 5.11 4.51.71.31 1.27.5 1.7.64.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.41-.07-.12-.27-.2-.57-.34Z" />
          </svg>
          WhatsApp
        </a>
        <a
          href={share.telegram}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-[#229ED9]/12 border border-[#229ED9]/40 px-3 py-1.5 text-xs font-medium text-[#5EB7E0] hover:bg-[#229ED9]/18 transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0Zm5.55 7.86-1.97 9.29c-.15.66-.55.82-1.11.51l-3.07-2.27-1.48 1.43c-.16.16-.3.3-.62.3l.22-3.13 5.7-5.15c.25-.22-.05-.34-.39-.13L6.6 13.1l-3.05-.95c-.66-.21-.67-.66.14-.97l11.94-4.6c.55-.21 1.03.13.86.98Z" />
          </svg>
          Telegram
        </a>
        {isMobile && (
          <a
            href={share.sms}
            className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/15 px-3 py-1.5 text-xs font-medium text-text hover:bg-white/[0.1] transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
            </svg>
            SMS
          </a>
        )}
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/40 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {copied ? (
              <polyline points="20 6 9 17 4 12" />
            ) : (
              <>
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </>
            )}
          </svg>
          {copied ? 'Copied!' : 'Copy message'}
        </button>
      </div>
    </motion.div>
  );
}
