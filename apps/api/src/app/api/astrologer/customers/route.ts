import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

// GET /api/astrologer/customers — list own customers
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('astro_status')
    .eq('id', user.id)
    .single();

  if (profile?.astro_status !== 'approved') {
    return NextResponse.json({ error: 'Not an approved astrologer' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('astrologer_customers')
    .select('*')
    .eq('astrologer_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data });
}

// POST /api/astrologer/customers — add a customer
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('astro_status, customer_limit')
    .eq('id', user.id)
    .single();

  if (profile?.astro_status !== 'approved') {
    return NextResponse.json({ error: 'Not an approved astrologer' }, { status: 403 });
  }

  // Check current customer count against limit
  const { count } = await supabase
    .from('astrologer_customers')
    .select('id', { count: 'exact', head: true })
    .eq('astrologer_id', user.id);

  if ((count ?? 0) >= (profile?.customer_limit ?? 0)) {
    return NextResponse.json(
      { error: 'Customer limit reached. Upgrade your plan to add more.' },
      { status: 403 }
    );
  }

  const body = await req.json();
  const { name, dob, birth_time, birth_place, gender, notes } = body;

  if (!name || !dob) {
    return NextResponse.json({ error: 'name and dob are required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('astrologer_customers')
    .insert({ astrologer_id: user.id, name, dob, birth_time, birth_place, gender, notes })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, data });
}
