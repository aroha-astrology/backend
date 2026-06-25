'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

export const dynamic = 'force-dynamic';

interface Client { id: string; name: string; dob: string | null; }

const REPORT_TYPES = [
  { type: 'dosha',         title: 'Dosha Analysis',          desc: 'Mangal, Kaal Sarp, Pitra Dosha — with remedies', emoji: '🔴' },
  { type: 'manorajna',     title: 'Manorajna (Personality)', desc: 'Core personality, emotional nature, life purpose', emoji: '🌟' },
  { type: 'compatibility', title: 'Compatibility Report',    desc: 'Ashtakoot Guna Milan — select a second client below', emoji: '❤️' },
];

export default function ReportsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/astrologer/clients').then(r => r.json()).then(d => setClients(d.clients ?? []));
  }, []);

  const generate = async (reportType: string) => {
    if (!selectedClient) { toast.error('Select a client first'); return; }
    setGenerating(reportType);
    try {
      const res = await fetch('/api/astrologer/reports/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: reportType, customer_id: selectedClient }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? 'PDF generation failed');
        return;
      }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      const clientName = clients.find(c => c.id === selectedClient)?.name ?? 'client';
      a.href     = url;
      a.download = `${reportType}-report-${clientName.replace(/\s+/g, '-')}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Failed to generate PDF');
    } finally {
      setGenerating(null);
    }
  };

  const shareWhatsApp = (clientId: string, reportType: string) => {
    const client = clients.find(c => c.id === clientId);
    const msg = `Hello! Your ${reportType} report from our astrology consultation is ready. Please contact us to receive your personalized PDF report.`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
  };

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="j-display text-2xl text-text font-bold">Reports & White-Label Export</h1>
        <p className="text-sm text-text-muted mt-1">Generate branded PDF reports for your clients.</p>
      </div>

      {/* Branding CTA */}
      <div className="j-card p-4 border-accent/30 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-text">Personalise with your branding</div>
          <div className="text-xs text-text-muted">Logo, brand name, and primary color appear on every PDF.</div>
        </div>
        <Link href="/astrologer/settings" className="j-btn text-xs border border-accent text-accent no-underline shrink-0">Settings →</Link>
      </div>

      {/* Client picker */}
      <div className="j-card p-4 space-y-2">
        <label className="block text-sm font-semibold text-text">Select client</label>
        {clients.length === 0 ? (
          <div className="text-sm text-text-muted">
            No clients yet. <Link href="/astrologer/clients/new" className="text-accent no-underline">Add a client →</Link>
          </div>
        ) : (
          <select
            value={selectedClient}
            onChange={e => setSelectedClient(e.target.value)}
            className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-sm text-text"
          >
            <option value="">Choose a client…</option>
            {clients.map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.dob ? ` (${c.dob})` : ''}</option>
            ))}
          </select>
        )}
      </div>

      {/* Report cards */}
      <div className="space-y-3">
        {REPORT_TYPES.map(rt => (
          <div key={rt.type} className="j-card p-5">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{rt.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-text">{rt.title}</div>
                <div className="text-xs text-text-muted mt-0.5">{rt.desc}</div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => generate(rt.type)}
                disabled={!selectedClient || generating === rt.type}
                className="flex-1 j-btn j-btn-primary text-sm disabled:opacity-40"
              >
                {generating === rt.type ? 'Generating…' : 'Download PDF'}
              </button>
              <button
                onClick={() => selectedClient ? shareWhatsApp(selectedClient, rt.title) : toast.error('Select a client first')}
                className="px-4 j-btn border border-border text-text-2 text-sm"
                title="Share via WhatsApp"
              >
                💬
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
