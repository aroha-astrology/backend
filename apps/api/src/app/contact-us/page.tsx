import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CONTACT_BLOCK,
  COMPANY_NAME,
  LEGAL_LAST_UPDATED,
} from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Contact Us',
  description: `Get in touch with ${COMPANY_NAME} — support, billing, and grievances.`,
};

const ROWS: Array<[string, string]> = [
  ['Legal entity', CONTACT_BLOCK.legalEntity],
  ['Email', CONTACT_BLOCK.email],
  ['Phone', CONTACT_BLOCK.phone],
  ['Address', CONTACT_BLOCK.address],
  ['GSTIN', CONTACT_BLOCK.gstin],
  ['Hours', CONTACT_BLOCK.hours],
];

export default function ContactUsPage() {
  return (
    <main className="min-h-screen bg-bg">
      <div className="mx-auto max-w-2xl px-5 py-10 md:py-16">
        <Link href="/" className="text-xs text-text-muted hover:text-text">
          &larr; Back
        </Link>

        <header className="mt-6 mb-8">
          <p className="j-eyebrow">Last updated {LEGAL_LAST_UPDATED}</p>
          <h1 className="j-display text-3xl text-text mt-2">Contact Us</h1>
          <p className="mt-3 text-sm text-text-muted">
            For support, billing questions, or to lodge a grievance under the IT Rules 2021 / DPDP Act 2023.
          </p>
        </header>

        <section>
          <h2 className="j-display text-base text-text">Customer support</h2>
          <div className="mt-3 rounded-2xl border border-border bg-surface overflow-hidden">
            {ROWS.map(([k, v], i) => (
              <div
                key={k}
                className={`flex flex-col sm:flex-row sm:items-center justify-between px-4 py-3 ${i < ROWS.length - 1 ? 'border-b border-border' : ''}`}
              >
                <span className="j-eyebrow text-[10px] sm:w-32">{k}</span>
                <span className="text-sm text-text">{v}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="j-display text-base text-text">Grievance Officer</h2>
          <p className="mt-2 text-sm text-text-muted">
            Under section 10 of the Digital Personal Data Protection Act, 2023 and Rule 3(11) of the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021.
          </p>
          <div className="mt-3 rounded-2xl border border-border bg-surface p-4 space-y-1">
            <p className="text-sm text-text"><span className="j-eyebrow text-[10px] mr-2">Name</span>{CONTACT_BLOCK.grievanceOfficer.name}</p>
            <p className="text-sm text-text"><span className="j-eyebrow text-[10px] mr-2">Email</span>{CONTACT_BLOCK.grievanceOfficer.email}</p>
            <p className="text-sm text-text"><span className="j-eyebrow text-[10px] mr-2">Phone</span>{CONTACT_BLOCK.grievanceOfficer.phone}</p>
          </div>
          <p className="mt-3 text-xs text-text-muted">
            Grievances are acknowledged within 24 hours and resolved within 15 days, as required by the IT Rules.
          </p>
        </section>

        <footer className="mt-12 pt-6 border-t border-border">
          <p className="text-xs text-text-muted">
            See also:{' '}
            <Link href="/privacy" className="j-link">Privacy</Link>
            {' · '}
            <Link href="/terms" className="j-link">Terms</Link>
            {' · '}
            <Link href="/refund-policy" className="j-link">Refund</Link>
          </p>
        </footer>
      </div>
    </main>
  );
}
