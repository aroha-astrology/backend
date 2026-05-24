import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  name:       z.string().min(1),
  caller_id:  z.string().optional().nullable(),
  is_default: z.boolean().optional(),
});

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('astrologer_profiles')
    .select('id, name, caller_id, is_default, created_at')
    .eq('astrologer_id', user.id)
    .order('created_at');

  return NextResponse.json({ profiles: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // If setting as default, unset others first
  if (parsed.data.is_default) {
    await supabase.from('astrologer_profiles').update({ is_default: false }).eq('astrologer_id', user.id);
  }

  const { data, error } = await supabase
    .from('astrologer_profiles')
    .insert({ ...parsed.data, astrologer_id: user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await req.json() as { id: string };
  const { error } = await supabase.from('astrologer_profiles').delete().eq('id', id).eq('astrologer_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
