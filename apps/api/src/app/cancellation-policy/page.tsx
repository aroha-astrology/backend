import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CANCELLATION_SECTIONS,
  LEGAL_VERSION,
  LEGAL_LAST_UPDATED,
  COMPANY_NAME,
} from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Cancellation Policy',
  description: `How cancellation works for ${COMPANY_NAME} purchases and subscriptions.`,
};

export default function CancellationPolicyPage() {
  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-2xl px-5 py-10 md:py-16">
        <Link href="/" className="text-xs text-text-muted hover:text-text">
          &larr; Back
        </Link>

        <header className="mt-6 mb-8">
          <p className="j-eyebrow">
            Last updated {LEGAL_LAST_UPDATED} &middot; Version {LEGAL_VERSION}
          </p>
          <h1 className="j-display text-3xl text-text mt-2">Cancellation Policy</h1>
          <p className="mt-3 text-sm text-text-muted">
            How {COMPANY_NAME} handles cancellations for token purchases, subscriptions and accounts.
          </p>
        </header>

        <div className="space-y-7">
          {CANCELLATION_SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="j-display text-base text-text">{section.heading}</h2>
              <div className="mt-2 space-y-2">
                {section.body.map((p, i) => (
                  <p key={i} className="text-[14px] leading-relaxed text-text-muted">{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 pt-6 border-t border-border">
          <p className="text-xs text-text-muted">
            See also:{' '}
            <Link href="/refund-policy" className="j-link">Refund</Link>
            {' · '}
            <Link href="/terms" className="j-link">Terms</Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
