import webpush from 'web-push';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { sendFcm } from './fcm';

let configured = false;
function configureWebPush(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  icon?: string;
  tag?: string;
  route?: string; // for FCM tap-to-navigate
}

// Sends a push notification to every active subscription belonging to user_id.
// Fans out by platform: web-push for 'web', FCM for 'android-fcm'.
// Silently no-ops if VAPID keys aren't configured (web-push only).
// Removes 404/410 expired subs and UNREGISTERED FCM tokens.
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  const webPushReady = configureWebPush();

  const supabase = createAdminSupabase();
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, platform, endpoint, p256dh, auth, fcm_token')
    .eq('user_id', userId);

  if (!subs?.length) return;

  const data = JSON.stringify(payload);
  const expiredIds: string[] = [];
  let webCount = 0, fcmCount = 0;

  await Promise.all(subs.map(async (s) => {
    if (s.platform === 'android-fcm' && s.fcm_token) {
      const result = await sendFcm({
        fcm_token: s.fcm_token,
        title: payload.title,
        body: payload.body,
        route: payload.route ?? payload.url,
        icon: payload.icon,
        tag: payload.tag,
      });
      if (result.ok) {
        fcmCount++;
        await supabase
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', s.id);
      } else if (result.unregistered) {
        expiredIds.push(s.id);
      }
    } else if (s.platform === 'web' && s.endpoint && webPushReady) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          data,
        );
        webCount++;
        await supabase
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', s.id);
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          expiredIds.push(s.id);
        } else {
          console.error('[push] web-push send failed:', err);
        }
      }
    }
  }));

  if (expiredIds.length) {
    await supabase.from('push_subscriptions').delete().in('id', expiredIds);
  }

  console.log(`[push] dispatched to user ${userId}: web=${webCount} fcm=${fcmCount} expired=${expiredIds.length}`);
}
