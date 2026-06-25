import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function ClientsListPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: clients } = await supabase
    .from('astrologer_customers')
    .select('id, name, dob, birth_place, phone, whatsapp, created_at')
    .eq('astrologer_id', user.id)
    .order('created_at', { ascending: false });

  const rows = clients ?? [];

  return (
    <div className="px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="j-display text-2xl text-text font-bold">Clients</h1>
        <Link href="/astrologer/clients/new" className="j-btn j-btn-primary no-underline text-sm">+ Add</Link>
      </div>
      {rows.length === 0 ? (
        <div className="j-card p-8 text-center text-text-muted text-sm">
          No clients yet. <Link href="/astrologer/clients/new" className="text-accent no-underline">Add your first →</Link>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(c => (
            <Link key={c.id} href={`/astrologer/clients/${c.id}`} className="j-card p-4 flex items-center justify-between block no-underline hover:border-accent/40">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text truncate">{c.name}</div>
                <div className="text-xs text-text-muted">
                  {c.dob ? new Date(c.dob).toLocaleDateString('en-IN') : '—'}{c.birth_place ? ` · ${c.birth_place}` : ''}
                </div>
              </div>
              {c.phone && <span className="text-xs text-text-muted">{c.phone}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
