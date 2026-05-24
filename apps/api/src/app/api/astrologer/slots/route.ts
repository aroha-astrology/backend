import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  customer_id: z.string().uuid().optional().nullable(),
  start_at:    z.string().datetime(),
  end_at:      z.string().datetime(),
  status:      z.enum(['open','booked','completed','cancelled','no_show']).default('open'),
  notes:       z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get('from') ?? new Date().toISOString().split('T')[0];
  const to   = searchParams.get('to')   ?? new Date(Date.now() + 30 * 86_400_000).toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('consultation_slots')
    .select('id, customer_id, start_at, end_at, status, notes, astrologer_customers(name)')
    .eq('astrologer_id', user.id)
    .gte('start_at', from + 'T00:00:00Z')
    .lte('start_at', to   + 'T23:59:59Z')
    .order('start_at');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ slots: data });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabase
    .from('consultation_slots')
    .insert({ ...parsed.data, astrologer_id: user.id })
    .select('id, start_at, end_at, status, customer_id, notes')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
