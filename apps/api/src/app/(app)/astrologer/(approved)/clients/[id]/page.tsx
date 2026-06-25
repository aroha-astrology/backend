import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { InteractionTimeline } from '@/components/astrologer/InteractionTimeline';
import { ContactActions } from '@/components/astrologer/ContactActions';

export const dynamic = 'force-dynamic';

interface Props { params: Promise<{ id: string }> }

export default async function ClientDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: client } = await supabase
    .from('astrologer_customers')
    .select('id, name, dob, birth_time, birth_place, gender, phone, whatsapp, email, notes, chart_data, created_at')
    .eq('id', id)
    .eq('astrologer_id', user.id)
    .maybeSingle();

  if (!client) notFound();

  const { data: interactions } = await supabase
    .from('interaction_log')
    .select('id, kind, direction, duration_sec, tag, body, occurred_at')
    .eq('customer_id', id)
    .eq('astrologer_id', user.id)
    .order('occurred_at', { ascending: false });

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto space-y-5">
      <Link href="/astrologer/clients" className="text-text-muted text-sm no-underline">← All clients</Link>

      {/* Identity header */}
      <header className="j-card p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="j-display text-2xl text-text font-bold">{client.name}</h1>
            <p className="text-sm text-text-muted">
              {client.dob ? new Date(client.dob).toLocaleDateString('en-IN') : '—'}
              {client.birth_time ? ` · ${client.birth_time}` : ''}
              {client.birth_place ? ` · ${client.birth_place}` : ''}
            </p>
            {client.notes && <p className="text-sm text-text-2 mt-2">{client.notes}</p>}
          </div>
        </div>
        <div className="mt-4">
          <ContactActions
            customerId={client.id}
            phone={client.phone ?? null}
            whatsapp={client.whatsapp ?? null}
          />
        </div>
      </header>

      {/* Chart preview (placeholder — full chart tabs in v2) */}
      <section className="j-card p-5">
        <h2 className="text-sm font-bold text-text mb-2">Birth Chart</h2>
        {client.chart_data ? (
          <pre className="text-xs text-text-muted overflow-x-auto">{JSON.stringify(client.chart_data, null, 2).slice(0, 600)}…</pre>
        ) : (
          <div className="text-sm text-text-muted">
            Chart not built yet. Build-chart tooling lands in the next release — for now you can use the
            client&apos;s DoB above to generate via the public Kundli tool.
          </div>
        )}
      </section>

      {/* Premium AI consultation CTA */}
      <section className="j-card p-5">
        <h2 className="text-sm font-bold text-text mb-1">Premium AI Consultation</h2>
        <p className="text-xs text-text-muted mb-3">Run an AI consult using this client&apos;s chart. Deducts Dhanam at the premium rate; the conversation is logged on the timeline.</p>
        <Link href={`/astrologer/clients/${client.id}/ai-chat`} className="j-btn j-btn-primary no-underline">Open Premium AI</Link>
      </section>

      {/* Interaction History — Screen 3 timeline */}
      <section>
        <h2 className="text-sm font-bold text-text mb-3 px-1">Interaction History</h2>
        <InteractionTimeline interactions={interactions ?? []} />
      </section>
    </div>
  );
}
