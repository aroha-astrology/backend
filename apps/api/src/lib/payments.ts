'use client';

// On Android (Capacitor), payment CTAs must open in the device browser so
// Razorpay runs in a real Chrome tab — not inside the WebView.
// This module is the single entry point for all payment initiations.
// Never import Capacitor types statically — dynamic import keeps the web bundle clean.

function isNativePlatform(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform();
}

async function openExternal(url: string): Promise<void> {
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}

export type PaymentTarget = 'tokens' | 'plan';

// Opens the payment flow for the given target.
// On native: opens the production URL in the device browser.
// On web: navigates within the same tab (existing behaviour).
export async function startPayment(
  target: PaymentTarget,
  _params?: Record<string, string>,
): Promise<void> {
  const path = target === 'tokens' ? '/credits' : '/pricing';

  if (isNativePlatform()) {
    // Production URL — user completes Razorpay in real browser, returns to app.
    const rawBase = process.env.NEXT_PUBLIC_APP_URL ?? 'https://arohaastrology.in';
    const base = rawBase.startsWith('http') ? rawBase : `https://${rawBase}`;
    await openExternal(`${base}${path}`);
    return;
  }

  // Web — existing behaviour: navigate within tab.
  window.location.href = path;
}
