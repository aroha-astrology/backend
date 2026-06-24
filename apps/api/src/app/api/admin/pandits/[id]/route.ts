import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { createAdminSupabase } from '@/lib/supabase/admin';

const bodySchema = z.object({
  verified: z.boolean().optional(),
  active:   z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { data: me } = await supabase.from('users').select('is_admin').eq('id', user.id).maybeSingle();
  if (!me?.is_admin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success || (parsed.data.verified === undefined && parsed.data.active === undefined)) {
    return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const admin = createAdminSupabase();
  const { error } = await admin.from('pandit_profiles').update(parsed.data).eq('user_id', id);
  if (error) return NextResponse.json({ error: 'UPDATE_FAILED', detail: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
