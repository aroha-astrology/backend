// Client-side helper to register the service worker, request notification
// permission, and POST the resulting push subscription to the backend.
// Idempotent: calling it multiple times is safe.

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buffer = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buffer;
}

export type PushSubscribeReason =
  | 'ssr'
  | 'unsupported'
  | 'no-vapid-key'
  | 'denied'
  | 'error';

export interface PushSubscribeResult {
  ok: boolean;
  reason?: PushSubscribeReason;
}

export async function ensurePushSubscribed(): Promise<PushSubscribeResult> {
  if (typeof window === 'undefined') return { ok: false, reason: 'ssr' };
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return { ok: false, reason: 'unsupported' };
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) return { ok: false, reason: 'no-vapid-key' };

  try {
    let reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };
    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') return { ok: false, reason: 'denied' };
    }

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(vapidKey),
      });
    }

    const json = sub.toJSON();
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: {
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        },
        userAgent: navigator.userAgent,
      }),
    });

    return { ok: true };
  } catch (err) {
    console.error('[push/client] subscribe failed:', err);
    return { ok: false, reason: 'error' };
  }
}
