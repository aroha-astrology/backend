import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { AdminPanditRow } from './AdminPanditRow';

export const dynamic = 'force-dynamic';

export default async function AdminPanditsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('users').select('is_admin').eq('id', user.id).maybeSingle();
  if (!me?.is_admin) redirect('/dashboard');

  // Admin client to bypass RLS on the listing
  const admin = createAdminSupabase();
  const { data: pandits } = await admin
    .from('pandit_profiles')
    .select('user_id, display_name, photo_url, city_label, temple_name, languages, specialisations, years_experience, rating, verified, active, created_at')
    .order('created_at', { ascending: false });

  return (
    <div className="min-h-screen bg-bg px-4 py-6 max-w-5xl mx-auto">
      <Link href="/admin" className="text-text-muted text-sm no-underline">← Admin</Link>
      <h1 className="j-display text-2xl text-text font-bold mt-3 mb-4">Self-onboarded Pandits</h1>
      <p className="text-sm text-text-muted mb-4">
        These pandits signed up via /pandit/join. Toggle off to remove them from user-facing listings.
      </p>

      {!pandits || pandits.length === 0 ? (
        <div className="j-card p-8 text-center text-text-muted text-sm">No self-onboarded pandits yet.</div>
      ) : (
        <div className="space-y-2">
          {pandits.map(p => (
            <AdminPanditRow key={p.user_id} p={p} />
          ))}
        </div>
      )}
    </div>
  );
}
