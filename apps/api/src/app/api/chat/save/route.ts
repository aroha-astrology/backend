import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

// POST /api/chat/save — persist a completed Q&A exchange into a session
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json() as {
    session_id: string;
    question: string;
    response: string;
    chart_id?: string;
    language?: string;
    is_voice?: boolean;
  };

  if (!body.session_id || !body.question || !body.response) {
    return NextResponse.json({ error: 'session_id, question, and response required' }, { status: 400 });
  }

  // Verify session belongs to user
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('id', body.session_id)
    .eq('user_id', user.id)
    .single();
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  // Insert the exchange
  const { error: insertError } = await supabase
    .from('chat_conversations')
    .insert({
      user_id: user.id,
      session_id: body.session_id,
      question: body.question,
      response: body.response,
      chart_id: body.chart_id ?? null,
      language: body.language ?? 'en',
      is_voice: body.is_voice ?? false,
    });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Count total messages in this session and update metadata
  const { count } = await supabase
    .from('chat_conversations')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', body.session_id);

  await supabase
    .from('chat_sessions')
    .update({ last_message_at: new Date().toISOString(), message_count: count ?? 1 })
    .eq('id', body.session_id)
    .eq('user_id', user.id);

  return NextResponse.json({ success: true });
}
