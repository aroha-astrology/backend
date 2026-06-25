import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';

const insertSchema = z.object({
  name:        z.string().trim().min(1).max(120),
  dob:         z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  birth_time:  z.string().trim().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
  birth_place: z.string().trim().max(200).optional().nullable(),
  gender:      z.enum(['male', 'female', 'other']).optional().nullable(),
  phone:       z.string().trim().max(40).optional().nullable(),
  whatsapp:    z.string().trim().max(40).optional().nullable(),
  email:       z.string().email().optional().nullable(),
  notes:       z.string().trim().max(2000).optional().nullable(),
});

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const { data, error } = await supabase
    .from('astrologer_customers')
    .select('id, name, dob, birth_time, birth_place, gender, phone, whatsapp, email, notes, created_at')
    .eq('astrologer_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ clients: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  // Enforce customer_limit
  const [{ count }, { data: me }] = await Promise.all([
    supabase.from('astrologer_customers').select('id', { count: 'exact', head: true }).eq('astrologer_id', user.id),
    supabase.from('users').select('customer_limit').eq('id', user.id).maybeSingle(),
  ]);
  const limit = me?.customer_limit ?? 0;
  if ((count ?? 0) >= limit) {
    return NextResponse.json({ error: 'LIMIT_REACHED', detail: `You've reached your plan limit of ${limit} clients.` }, { status: 402 });
  }

  const parsed = insertSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_PAYLOAD', details: parsed.error.flatten() }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('astrologer_customers')
    .insert({ astrologer_id: user.id, ...parsed.data })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, id: data.id });
}
