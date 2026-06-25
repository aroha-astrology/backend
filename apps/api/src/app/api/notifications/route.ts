import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// GET /api/notifications — latest 30 for the current user
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('notifications')
    .select('id, type, title, body, link, metadata, read_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const unreadCount = (data ?? []).filter(n => !n.read_at).length;
  return NextResponse.json({ data: data ?? [], unreadCount });
}

// PATCH /api/notifications — mark all as read, or specific ids via body { ids: [...] }
export async function PATCH(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let ids: string[] | undefined;
  try {
    const body = await request.json() as { ids?: string[] };
    ids = body.ids;
  } catch { /* no body — mark all */ }

  let query = supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);

  if (ids && ids.length > 0) query = query.in('id', ids);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/notifications — clear all (or ids via ?ids=a,b,c)
export async function DELETE(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const idsParam = url.searchParams.get('ids');
  const ids = idsParam ? idsParam.split(',').map(s => s.trim()).filter(Boolean) : undefined;

  let query = supabase.from('notifications').delete().eq('user_id', user.id);
  if (ids && ids.length > 0) query = query.in('id', ids);

  const { error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
