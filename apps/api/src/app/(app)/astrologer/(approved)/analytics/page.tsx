import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { AnalyticsCharts } from '@/components/astrologer/AnalyticsCharts';

export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [clientsRes, interactionsRes, recentRes, slotsRes] = await Promise.all([
    supabase.from('astrologer_customers').select('id', { count: 'exact', head: true }).eq('astrologer_id', user.id),
    supabase.from('interaction_log').select('kind, tag, occurred_at', { count: 'exact' }).eq('astrologer_id', user.id),
    supabase.from('interaction_log').select('kind, tag, occurred_at').eq('astrologer_id', user.id).gte('occurred_at', thirtyDaysAgo).order('occurred_at'),
    supabase.from('consultation_slots').select('customer_id, status').eq('astrologer_id', user.id),
  ]);

  const totalClients      = clientsRes.count ?? 0;
  const totalConsultations = interactionsRes.count ?? 0;

  // Top tags
  const byTag: Record<string, number> = {};
  for (const row of interactionsRes.data ?? []) {
    const t = row.tag ?? 'Untagged';
    byTag[t] = (byTag[t] ?? 0) + 1;
  }
  const topTags = Object.entries(byTag).sort(([, a], [, b]) => b - a).slice(0, 8);

  // Consultations per day — last 30 days
  const dayMap: Record<string, number> = {};
  for (const row of recentRes.data ?? []) {
    const day = row.occurred_at.slice(0, 10);
    dayMap[day] = (dayMap[day] ?? 0) + 1;
  }
  const last30 = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().split('T')[0];
    return { date: d, label: d.slice(5), count: dayMap[d] ?? 0 };
  });

  // Completed consultations count
  const completedSlots = (slotsRes.data ?? []).filter(s => s.status === 'completed').length;

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto space-y-5">
      <h1 className="j-display text-2xl text-text font-bold">Business Analytics</h1>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="j-card p-5">
          <div className="text-3xl font-extrabold text-text">{totalConsultations}</div>
          <div className="text-xs text-text-muted">Total interactions</div>
        </div>
        <div className="j-card p-5">
          <div className="text-3xl font-extrabold text-text">{totalClients}</div>
          <div className="text-xs text-text-muted">Total clients</div>
        </div>
        <div className="j-card p-5">
          <div className="text-3xl font-extrabold text-text">{completedSlots}</div>
          <div className="text-xs text-text-muted">Completed sessions</div>
        </div>
      </div>

      {/* Charts (client component) */}
      <AnalyticsCharts last30={last30} topTags={topTags} />

      {/* Raw top-tags table */}
      <section className="j-card p-5">
        <h2 className="text-sm font-bold text-text mb-3">Top Services / Tags</h2>
        {topTags.length === 0 ? (
          <div className="text-sm text-text-muted">Log interactions with tags (e.g. &quot;Jupiter transit&quot;) to see your top focus areas.</div>
        ) : (
          <div className="space-y-2">
            {topTags.map(([tag, count]) => (
              <div key={tag} className="flex items-center gap-3">
                <div className="flex-1 bg-border rounded-full h-1.5 overflow-hidden">
                  <div className="bg-accent h-1.5 rounded-full" style={{ width: `${(count / (topTags[0]?.[1] ?? 1)) * 100}%` }} />
                </div>
                <span className="text-sm text-text w-48 truncate">{tag}</span>
                <span className="text-accent font-semibold text-sm w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
