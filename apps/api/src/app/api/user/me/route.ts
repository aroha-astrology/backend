import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

    const { data } = await supabase.from('users').select('*').eq('id', authUser.id).single();

    const metaName =
      (authUser.user_metadata?.full_name as string | undefined)?.trim() ||
      (authUser.user_metadata?.name as string | undefined)?.trim() ||
      authUser.email?.split('@')[0] ||
      '';

    const avatar =
      (authUser.user_metadata?.avatar_url as string | undefined) ||
      (authUser.user_metadata?.picture as string | undefined) ||
      null;

    return NextResponse.json({
      success: true,
      data: {
        ...(data ?? {}),
        id: authUser.id,
        email: data?.email || authUser.email || '',
        name: data?.name?.trim() || metaName,
        avatar,
      },
    });
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to fetch user' }, { status: 500 });
  }
}
