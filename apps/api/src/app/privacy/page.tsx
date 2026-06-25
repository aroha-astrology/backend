import type { Metadata } from 'next';
import Link from 'next/link';
import {
  PRIVACY_SECTIONS,
  LEGAL_VERSION,
  LEGAL_LAST_UPDATED,
  COMPANY_NAME,
} from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${COMPANY_NAME} collects, uses, and protects your personal information.`,
};

export default function PrivacyPage() {
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
          <h1 className="j-display text-3xl text-text mt-2">Privacy Policy</h1>
          <p className="mt-3 text-sm text-text-muted">
            This Policy explains what data {COMPANY_NAME} collects, how we use it, and the
            choices you have.
          </p>
        </header>

        <div className="space-y-7">
          {PRIVACY_SECTIONS.map((section) => (
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
            <Link href="/terms" className="j-link">
              Terms &amp; Conditions
            </Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
