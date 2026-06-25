import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';

const insertSchema = z.object({
  customer_id:  z.string().uuid(),
  kind:         z.enum(['call', 'whatsapp', 'message', 'note', 'ai_consultation', 'in_person']),
  direction:    z.enum(['outbound', 'inbound']).optional(),
  duration_sec: z.number().int().min(0).max(86400).optional(),
  tag:          z.string().trim().max(200).optional(),
  body:         z.string().trim().max(4000).optional(),
  fee_rs:       z.number().int().min(0).max(999999).optional().nullable(),
  occurred_at:  z.string().datetime().optional(),
});

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const customerId = searchParams.get('customer_id');
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  let q = supabase
    .from('interaction_log')
    .select('id, customer_id, kind, direction, duration_sec, tag, body, fee_rs, occurred_at')
    .eq('astrologer_id', user.id)
    .order('occurred_at', { ascending: false })
    .limit(100);
  if (customerId) q = q.eq('customer_id', customerId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ interactions: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const parsed = insertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_PAYLOAD' }, { status: 400 });

  // Verify the customer belongs to this astrologer (RLS would also enforce, but explicit is clearer).
  const { data: ok } = await supabase
    .from('astrologer_customers')
    .select('id')
    .eq('id', parsed.data.customer_id)
    .eq('astrologer_id', user.id)
    .maybeSingle();
  if (!ok) return NextResponse.json({ error: 'CUSTOMER_NOT_FOUND' }, { status: 404 });

  const { data, error } = await supabase
    .from('interaction_log')
    .insert({ astrologer_id: user.id, ...parsed.data })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}
