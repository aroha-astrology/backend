import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const upsertSchema = z.object({
  brand_name:    z.string().optional().nullable(),
  logo_url:      z.string().optional().nullable(),
  tagline:       z.string().optional().nullable(),
  primary_color: z.string().optional().nullable(),
  phone:         z.string().optional().nullable(),
  email:         z.string().optional().nullable(),
  address:       z.string().optional().nullable(),
  website:       z.string().optional().nullable(),
  pdf_footer:    z.string().optional().nullable(),
});

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('astrologer_branding')
    .select('*')
    .eq('astrologer_id', user.id)
    .maybeSingle();

  return NextResponse.json({ branding: data ?? null });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { data, error } = await supabase
    .from('astrologer_branding')
    .upsert({ ...parsed.data, astrologer_id: user.id, updated_at: new Date().toISOString() }, { onConflict: 'astrologer_id' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ branding: data });
}
