import type { Metadata } from 'next';
import Link from 'next/link';
import {
  TERMS_SECTIONS,
  LEGAL_VERSION,
  LEGAL_LAST_UPDATED,
  COMPANY_NAME,
} from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: `Terms & Conditions for using ${COMPANY_NAME}.`,
};

export default function TermsPage() {
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
          <h1 className="j-display text-3xl text-text mt-2">Terms &amp; Conditions</h1>
          <p className="mt-3 text-sm text-text-muted">
            Please read these Terms carefully before using {COMPANY_NAME}. By creating an
            account you agree to be bound by them.
          </p>
        </header>

        <div className="space-y-7">
          {TERMS_SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="j-display text-base text-text">{section.heading}</h2>
              <div className="mt-2 space-y-2">
                {section.body.map((paragraph, i) => (
                  <p key={i} className="text-[14px] leading-relaxed text-text-muted">
                    {paragraph}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="mt-12 pt-6 border-t border-border">
          <p className="text-xs text-text-muted">
            See also:{' '}
            <Link href="/privacy" className="j-link">
              Privacy Policy
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
