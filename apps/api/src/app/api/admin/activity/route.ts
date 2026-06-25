import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

// GET /api/admin/activity
// Query params:
//   user_id     string   filter by user (optional — omit to get all users)
//   event_type  string   filter by event type (optional)
//   from        ISO      start date (optional)
//   to          ISO      end date (optional)
//   limit       number   default 50, max 200
//   offset      number   default 0
export async function GET(req: NextRequest) {
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
  const { searchParams } = new URL(req.url);

  const userId    = searchParams.get('user_id');
  const eventType = searchParams.get('event_type');
  const fromDate  = searchParams.get('from');
  const toDate    = searchParams.get('to');
  const limit     = Math.min(parseInt(searchParams.get('limit') ?? '50'), 200);
  const offset    = parseInt(searchParams.get('offset') ?? '0');

  let query = admin
    .from('user_activity_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (userId)    query = query.eq('user_id', userId);
  if (eventType) query = query.eq('event_type', eventType);
  if (fromDate)  query = query.gte('created_at', fromDate);
  if (toDate)    query = query.lte('created_at', toDate);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data, count });
}
