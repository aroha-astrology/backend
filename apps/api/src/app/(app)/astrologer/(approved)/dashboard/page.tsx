import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { WalkInButton } from '@/components/astrologer/WalkInButton';

export const dynamic = 'force-dynamic';

export default async function AstrologerHubPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [meRes, clientsRes, slotsRes, logsRes] = await Promise.all([
    supabase.from('users').select('name, astro_plan, customer_limit, astro_status').eq('id', user.id).maybeSingle(),
    supabase.from('astrologer_customers').select('id, name', { count: 'exact' }).eq('astrologer_id', user.id).limit(5).order('created_at', { ascending: false }),
    supabase.from('consultation_slots').select('id, start_at, customer_id, status').eq('astrologer_id', user.id)
      .gte('start_at', new Date().toISOString())
      .lte('start_at', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
      .order('start_at').limit(10),
    supabase.from('interaction_log').select('id, kind, tag, occurred_at, customer_id').eq('astrologer_id', user.id).order('occurred_at', { ascending: false }).limit(5),
  ]);

  const me = meRes.data;
  const clients = clientsRes.data ?? [];
  const slots = slotsRes.data ?? [];
  const logs = logsRes.data ?? [];

  return (
    <div className="px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="j-display text-2xl text-text font-bold">Welcome, {me?.name ?? 'Astrologer'}</h1>
          <p className="text-sm text-text-muted">Plan: {me?.astro_plan ?? '—'} · {clientsRes.count ?? 0} / {me?.customer_limit ?? 0} clients</p>
        </div>
        <WalkInButton />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile href="/astrologer/clients/new" emoji="➕" title="Add Client" hint="Capture DoB + auto-build chart" />
        <Tile href="/astrologer/calendar"    emoji="📅" title="Calendar"   hint="Today's consultations" />
        <Tile href="/astrologer/matchmaking" emoji="🤝" title="Matchmaking" hint="Compatibility analysis" />
        <Tile href="/astrologer/reports"     emoji="📄" title="Reports"     hint="White-label PDFs" />
      </div>

      <section>
        <h2 className="text-sm font-bold text-text mb-2">Today&apos;s Consultations</h2>
        {slots.length === 0 ? (
          <div className="j-card p-5 text-text-muted text-sm text-center">Nothing scheduled today. <Link href="/astrologer/calendar" className="text-accent no-underline">Plan slots →</Link></div>
        ) : (
          <div className="space-y-2">
            {slots.map(s => (
              <Link key={s.id} href={s.customer_id ? `/astrologer/clients/${s.customer_id}` : '/astrologer/calendar'} className="j-card p-4 block no-underline">
                <div className="text-sm font-semibold text-text">{new Date(s.start_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {s.status}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-bold text-text mb-2">Recent Clients</h2>
        {clients.length === 0 ? (
          <div className="j-card p-5 text-text-muted text-sm text-center">No clients yet. <Link href="/astrologer/clients/new" className="text-accent no-underline">Add your first →</Link></div>
        ) : (
          <div className="space-y-2">
            {clients.map(c => (
              <Link key={c.id} href={`/astrologer/clients/${c.id}`} className="j-card p-3 block no-underline">
                <span className="text-sm font-semibold text-text">{c.name}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {logs.length > 0 && (
        <section>
          <h2 className="text-sm font-bold text-text mb-2">Recent Interactions</h2>
          <div className="space-y-2">
            {logs.map(l => (
              <div key={l.id} className="j-card p-3 text-sm">
                <div className="text-text-muted text-xs">{new Date(l.occurred_at).toLocaleString('en-IN')}</div>
                <div className="text-text">{l.kind === 'call' ? '📞' : l.kind === 'whatsapp' ? '💬' : '✉️'} {l.tag ?? l.kind}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Tile({ href, emoji, title, hint }: { href: string; emoji: string; title: string; hint: string }) {
  return (
    <Link href={href} className="j-card p-4 block no-underline hover:border-accent/40">
      <div className="text-2xl mb-1">{emoji}</div>
      <div className="text-sm font-semibold text-text">{title}</div>
      <div className="text-[11px] text-text-muted mt-0.5">{hint}</div>
    </Link>
  );
}
