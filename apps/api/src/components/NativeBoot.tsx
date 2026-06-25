'use client';

import { useEffect } from 'react';
import { registerForPush, syncCurrentLocation, isNative } from '@/lib/native';

// Runs once per app session on the Android Capacitor build.
// Registers FCM push token and syncs device location to the user profile.
// On web, all calls are no-ops or browser-API fallbacks.
export function NativeBoot() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Drain a pending push route buffered before the WebView was ready.
    const pendingRoute = localStorage.getItem('pending_push_route');
    if (pendingRoute) {
      localStorage.removeItem('pending_push_route');
      window.location.href = pendingRoute;
      return;
    }

    // Run each boot task at most once per browser/app session.
    const pushDone = sessionStorage.getItem('native_boot_push_done');
    if (!pushDone) {
      registerForPush().catch(() => {});
      sessionStorage.setItem('native_boot_push_done', '1');
    }

    const locDone = sessionStorage.getItem('native_boot_loc_done');
    if (!locDone) {
      syncCurrentLocation().catch(() => {});
      sessionStorage.setItem('native_boot_loc_done', '1');
    }

    // Listen for the TTS no-Indian-voice event and surface a toast/alert.
    const handleNoVoice = (e: Event) => {
      const lang = (e as CustomEvent<{ language: string }>).detail.language;
      console.warn(`[tts] No Indian voice found for language: ${lang}. Prompt user to install.`);
      // Simple alert for now — can be replaced with a proper toast in follow-up.
      if (isNative()) {
        alert(
          `For the best experience, please install the "${lang.toUpperCase()}" language pack in your Android Text-to-Speech settings.`,
        );
      }
    };
    window.addEventListener('tts:no-indian-voice', handleNoVoice);
    return () => window.removeEventListener('tts:no-indian-voice', handleNoVoice);
  }, []);

  return null;
}
