'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { Icon } from '@/components/ui/icon';
import type { IconName } from '@/components/ui/icon';

const PENDING_KEY = 'jyotish:pendingKundli';

function useIsGenerating(): boolean {
  const [generating, setGenerating] = useState(false);
  useEffect(() => {
    const check = () => setGenerating(!!localStorage.getItem(PENDING_KEY));
    check();
    const id = setInterval(check, 600);
    return () => clearInterval(id);
  }, []);
  return generating;
}

const navItems: { label: string; href: string; icon: IconName; matchPaths?: string[] }[] = [
  { label: 'Home', href: '/dashboard', icon: 'home2' },
  { label: 'Insights', href: '/life-journey', icon: 'radar', matchPaths: ['/life-journey'] },
  { label: 'Chat', href: '/chat', icon: 'chat', matchPaths: ['/chat'] },
  { label: 'Panchang', href: '/panchang', icon: 'calendar', matchPaths: ['/panchang'] },
];

export function BottomNav() {
  const pathname = usePathname();
  const isGenerating = useIsGenerating();
  const [analyzingOpen, setAnalyzingOpen] = useState(false);

  useEffect(() => {
    if (!analyzingOpen) return;
    if (!isGenerating) {
      setAnalyzingOpen(false);
      return;
    }
    const t = setTimeout(() => setAnalyzingOpen(false), 4500);
    return () => clearTimeout(t);
  }, [analyzingOpen, isGenerating]);

  return (
    <>
      <nav
        className="md:hidden fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50"
        style={{ width: 'calc(100% - 32px)', maxWidth: 448 }}
      >
        <div className="flex items-center justify-around px-2.5 py-2 rounded-full backdrop-blur-[14px] border border-border shadow-[0_0_18px_rgba(212,175,55,0.30),0_-4px_24px_rgba(0,0,0,0.45)]" style={{ background: 'var(--glass-3-bg)' }}>
          {navItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.matchPaths
                ? item.matchPaths.some(p => pathname.startsWith(p))
                : pathname.startsWith(item.href + '/'));
            const locked = isGenerating && item.href !== '/dashboard';

            const inner = (
              <div className="flex flex-col items-center gap-0.5 flex-1 py-0.5" style={{ opacity: locked ? 0.35 : 1 }}>
                <div
                  className="relative flex h-10 w-12 items-center justify-center rounded-full transition-all duration-200"
                >
                  {isActive && !locked && (
                    <motion.div
                      layoutId="bottomNavPill"
                      className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,#D4AF37,#B8893F)] shadow-[0_0_14px_rgba(242,202,80,0.55)]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <div className="relative z-10" style={{ color: isActive && !locked ? 'var(--bg)' : 'var(--text-muted)' }}>
                    <Icon name={item.icon} size={20} strokeWidth={isActive && !locked ? 2.2 : 1.5} />
                  </div>
                </div>
                <span
                  className="text-[9px] tracking-[0.02em] whitespace-nowrap overflow-hidden text-ellipsis max-w-full"
                  style={{
                    fontWeight: isActive && !locked ? 700 : 500,
                    color: isActive && !locked ? 'var(--accent)' : 'var(--text-muted)',
                  }}
                >
                  {item.label}
                </span>
              </div>
            );

            return locked ? (
              <button
                key={item.href}
                type="button"
                aria-label={`${item.label} unavailable while chart is generating`}
                onClick={() => setAnalyzingOpen(true)}
                className="flex flex-1 justify-center bg-transparent border-0 p-0 cursor-pointer"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                {inner}
              </button>
            ) : (
              <Link key={item.href} href={item.href} className="flex flex-1 justify-center no-underline" style={{ WebkitTapHighlightColor: 'transparent' }}>
                {inner}
              </Link>
            );
          })}
        </div>
      </nav>

      <AnimatePresence>
        {analyzingOpen && (
          <motion.div
            key="analyzing-toast"
            className="md:hidden fixed left-1/2 -translate-x-1/2 z-[60] pointer-events-none"
            style={{
              bottom: 'calc(env(safe-area-inset-bottom) + 96px)',
              width: 'calc(100% - 32px)',
              maxWidth: 448,
            }}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <div
              className="rounded-2xl border border-border backdrop-blur-[14px] px-4 py-3 shadow-[0_8px_28px_rgba(0,0,0,0.45),0_0_18px_rgba(212,175,55,0.18)]"
              style={{ background: 'var(--glass-3-bg)' }}
            >
              <div className="flex items-start gap-3">
                <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 flex-shrink-0">
                  <motion.span
                    className="absolute inset-0 rounded-full border-2 border-primary/30 border-t-primary"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  />
                  <span className="text-primary text-[14px] leading-none">✦</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-text leading-tight m-0">
                    Analyzing your data
                  </p>
                  <p className="text-[10.5px] text-text-muted leading-snug mt-0.5 m-0">
                    This takes about 2 minutes to give you the most accurate insights.
                  </p>
                </div>
              </div>
              <div className="mt-2.5 h-[3px] w-full overflow-hidden rounded-full bg-surface-2">
                <motion.div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#D4AF37,#F2CA50,#D4AF37)]"
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: '55%' }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
