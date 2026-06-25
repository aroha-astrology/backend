import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';

// PATCH for the post-call "log the consultation" flow — fills in duration / tag / body
// on a row that was created as a pending placeholder when the dialer launched.
const patchSchema = z.object({
  duration_sec: z.number().int().min(0).max(86400).optional(),
  tag:          z.string().trim().max(200).optional(),
  body:         z.string().trim().max(4000).optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const parsed = patchSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });

  const { error } = await supabase
    .from('interaction_log')
    .update(parsed.data)
    .eq('id', id)
    .eq('astrologer_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const { error } = await supabase.from('interaction_log').delete().eq('id', id).eq('astrologer_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
