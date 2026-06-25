import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

// POST /api/admin/logout-all
// Invalidates all sessions for every user (admin only)
export async function POST() {
  const userSupabase = await createServerSupabase();
  const { data: { user } } = await userSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: caller } = await userSupabase
    .from('users')
    .select('is_admin')
    .eq('id', user.id)
    .single();

  if (!caller?.is_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createAdminSupabase();

  // Paginate through all users and sign each out globally
  let page = 1;
  const perPage = 1000;
  let totalSignedOut = 0;
  const errors: string[] = [];

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    for (const u of data.users) {
      const { error: signOutError } = await admin.auth.admin.signOut(u.id, 'global');
      if (signOutError) {
        errors.push(`${u.id}: ${signOutError.message}`);
      } else {
        totalSignedOut++;
      }
    }

    if (data.users.length < perPage) break;
    page++;
  }

  return NextResponse.json({ success: true, totalSignedOut, errors });
}
