'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';

interface Customer {
  id: string;
  name: string;
  dob: string;
  birth_time: string | null;
  birth_place: string | null;
  gender: string | null;
  notes: string | null;
  created_at: string;
}

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/astrologer/customers')
      .then(r => r.json())
      .then(json => {
        const found = (json?.data ?? []).find((c: Customer) => c.id === params.id);
        if (!found) { router.replace('/astrologer/customers'); return; }
        setCustomer(found);
      })
      .catch(() => router.replace('/astrologer/customers'))
      .finally(() => setLoading(false));
  }, [params.id, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-bg">
        <p className="text-text-secondary text-sm">Loading…</p>
      </div>
    );
  }

  if (!customer) return null;

  const dob = new Date(customer.dob);

  return (
    <div className="min-h-screen bg-bg px-4 py-6 pb-24">
      <div className="max-w-lg mx-auto flex flex-col gap-5">

        {/* Back */}
        <Link href="/astrologer/customers" className="text-xs text-text-secondary no-underline">← Clients</Link>

        {/* Profile card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface border border-border rounded-xl px-4 py-5 flex flex-col gap-3"
        >
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-extrabold text-text font-[family-name:var(--font-serif)] mb-1">
                {customer.name}
              </h1>
              {customer.gender && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-primary uppercase tracking-wide">
                  {customer.gender}
                </span>
              )}
            </div>
            <span className="text-3xl">👤</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5 mt-2">
            {[
              ['Date of Birth', dob.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })],
              ['Time of Birth', customer.birth_time ?? '—'],
              ['Place of Birth', customer.birth_place ?? '—'],
              ['Added On', new Date(customer.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })],
            ].map(([label, value]) => (
              <div key={label} className="bg-white/[0.03] rounded-lg px-3 py-2.5 border border-white/[0.06]">
                <p className="text-[10px] text-text-secondary font-bold uppercase tracking-wide mb-0.5">{label}</p>
                <p className="text-xs text-text m-0">{value}</p>
              </div>
            ))}
          </div>
          {customer.notes && (
            <div className="bg-white/[0.03] rounded-lg px-3 py-2.5 border border-white/[0.06] mt-1">
              <p className="text-[10px] text-text-secondary font-bold uppercase tracking-wide mb-0.5">Notes</p>
              <p className="text-xs text-text m-0 leading-relaxed">{customer.notes}</p>
            </div>
          )}
        </motion.div>

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-2 gap-3"
        >
          <Link
            href={`/kundli/generate?name=${encodeURIComponent(customer.name)}&dob=${customer.dob}${customer.birth_time ? `&tob=${customer.birth_time}` : ''}${customer.birth_place ? `&pob=${encodeURIComponent(customer.birth_place)}` : ''}`}
            className="bg-primary text-bg font-bold text-sm text-center py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
          >
            🔯 Generate Kundli
          </Link>
          <Link
            href="/muhurta"
            className="bg-surface border border-border text-text font-bold text-sm text-center py-3.5 rounded-xl no-underline hover:bg-white/[0.06] transition-colors"
          >
            📅 Muhurta
          </Link>
        </motion.div>

      </div>
    </div>
  );
}
