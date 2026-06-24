import { createAdminSupabase } from '@/lib/supabase/admin';

export interface CreateNotificationInput {
  userId: string;
  type: string;             // e.g. 'report_ready' | 'kundli_ready' | 'system'
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Insert an in-app notification row. Uses the admin (service-role) client so
 * it bypasses RLS — only call from trusted server routes that have already
 * verified ownership / authenticity. Realtime broadcasts the INSERT to the
 * user's navbar bell automatically (filtered by user_id via RLS on subscribe).
 *
 * Errors are logged but never thrown — notifications are best-effort and must
 * not break the surrounding flow (report generation, push send, etc.).
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    const supabase = createAdminSupabase();
    const { error } = await supabase.from('notifications').insert({
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      metadata: input.metadata ?? {},
    });
    if (error) console.error('[createNotification] insert failed:', error.message);
  } catch (e) {
    console.error('[createNotification] unexpected error:', e);
  }
}
