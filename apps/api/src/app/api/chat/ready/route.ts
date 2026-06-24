import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { sendPushToUser } from '@/lib/push/send';
import { createNotification } from '@/lib/notifications/create';

/**
 * GET /api/chat/ready
 * Returns whether the user's active chart is ready for chat.
 * Chat is locked while background generation jobs are pending or a report is still generating.
 */
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check the flag on the latest chart
  const { data: chart } = await supabase
    .from('kundli_charts')
    .select('id, chat_ready')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!chart) return NextResponse.json({ ready: false, reason: 'no_chart' });
  if (chart.chat_ready) return NextResponse.json({ ready: true });

  // Flag not set yet — do a live check so the UI can poll
  const { count: pendingJobs } = await supabase
    .from('generation_queue')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .in('status', ['pending', 'processing']);

  // Report generation is background-only — chat works with just the birth chart.
  const ready = (pendingJobs ?? 0) === 0;

  // Auto-set the flag if everything is done
  if (ready) {
    await supabase
      .from('kundli_charts')
      .update({ chat_ready: true })
      .eq('id', chart.id);

    // Fire-and-forget: push + in-app bell (best-effort, non-blocking)
    void Promise.all([
      sendPushToUser(user.id, {
        title: 'Yogi Baba is ready for you ✨',
        body: 'Your birth chart analysis is complete. Tap to start your reading.',
        url: '/chat',
        tag: 'chat_ready',
      }),
      createNotification({
        userId: user.id,
        type: 'chat_ready',
        title: 'Your AI chat is ready',
        body: 'Birth chart analysis complete. Ask Yogi Baba anything.',
        link: '/chat',
      }),
    ]);
  }

  return NextResponse.json({
    ready,
    pendingJobs: pendingJobs ?? 0,
  });
}
