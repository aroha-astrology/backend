'use client';

import Link from 'next/link';

export function Footer() {
  return (
    <footer className="border-t border-border/50 py-8">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex flex-col items-center gap-3 md:flex-row md:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">🕉️</span>
            <span className="text-sm font-semibold text-text">Aroha <span className="text-primary">Astrology</span></span>
          </div>
          <p className="text-center text-xs text-text-secondary/60 max-w-md">
            Predictions use Vedic astrology + AI. Use as guidance, not absolute truth.
          </p>
          <div className="flex flex-col items-center gap-1 md:items-end">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-text-secondary/70 md:justify-end">
              <Link href="/terms" className="hover:text-text">Terms</Link>
              <span aria-hidden>·</span>
              <Link href="/privacy" className="hover:text-text">Privacy</Link>
              <span aria-hidden>·</span>
              <Link href="/refund-policy" className="hover:text-text">Refund</Link>
              <span aria-hidden>·</span>
              <Link href="/cancellation-policy" className="hover:text-text">Cancellation</Link>
              <span aria-hidden>·</span>
              <Link href="/shipping-policy" className="hover:text-text">Shipping</Link>
              <span aria-hidden>·</span>
              <Link href="/contact-us" className="hover:text-text">Contact</Link>
            </div>
            <p className="text-xs text-text-secondary/70">
              &copy; {new Date().getFullYear()} Aroha Astrology
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
