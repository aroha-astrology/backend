import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

// GET /api/chat/sessions — list user's sessions newest first
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('chat_sessions')
    .select('id, title, message_count, last_message_at, created_at')
    .eq('user_id', user.id)
    .order('last_message_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}

// POST /api/chat/sessions — create a new session
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Block chat until background generation is complete
  const { data: chart } = await supabase
    .from('kundli_charts')
    .select('id, chat_ready')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!chart?.chat_ready) {
    return NextResponse.json(
      { error: 'Chat is not available yet. Your reading is still being prepared.', code: 'CHAT_NOT_READY' },
      { status: 423 },
    );
  }

  const body = await request.json() as { title?: string; chart_id?: string; language?: string };
  const title = (body.title ?? 'Chat with Yogi Baba').slice(0, 80);

  const { data, error } = await supabase
    .from('chat_sessions')
    .insert({ user_id: user.id, title, chart_id: body.chart_id ?? null, language: body.language ?? 'en' })
    .select('id, title')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
