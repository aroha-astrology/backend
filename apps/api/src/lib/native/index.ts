// Native bridge — wraps Capacitor plugins with web fallbacks.
// All Capacitor imports are DYNAMIC so the web bundle never requires them.
// On web, each function either uses a browser API fallback or is a no-op.

export function isNative(): boolean {
  return typeof window !== 'undefined' && !!(window as any).Capacitor?.isNativePlatform();
}

// ─── Geolocation ─────────────────────────────────────────────────────────────

function webGeolocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 15000, enableHighAccuracy: true, maximumAge: 60000 },
    );
  });
}

export async function getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
  if (isNative()) {
    try {
      const mod = await import('@capacitor/geolocation');
      const Geo = mod.Geolocation;
      if (Geo && typeof Geo.requestPermissions === 'function') {
        const perm = await Geo.requestPermissions();
        if (perm.location !== 'granted' && perm.location !== 'prompt') return null;
        const pos = await Geo.getCurrentPosition({ enableHighAccuracy: true });
        return { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
      console.warn('[native] @capacitor/geolocation loaded but Geolocation API unavailable; falling back to navigator.geolocation');
    } catch (e) {
      console.warn('[native] @capacitor/geolocation import failed; falling back to navigator.geolocation', e);
    }
    // fall through to web API — works in Capacitor WebView when plugin isn't registered
  }
  return webGeolocation();
}

export async function syncCurrentLocation(): Promise<void> {
  const loc = await getCurrentLocation();
  if (!loc) return;
  await fetch('/api/user/location', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude: loc.lat, longitude: loc.lng, source: isNative() ? 'device' : 'manual' }),
  });
}

// ─── Camera ──────────────────────────────────────────────────────────────────

export async function capturePhoto(opts: { direction: 'FRONT' | 'REAR' }): Promise<Blob | null> {
  if (!isNative()) return null; // web: callers use their own getUserMedia / file-input

  const { Camera, CameraResultType, CameraSource, CameraDirection } = await import('@capacitor/camera');
  const photo = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    source: CameraSource.Camera,
    direction: opts.direction === 'FRONT' ? CameraDirection.Front : CameraDirection.Rear,
    resultType: CameraResultType.Uri,
  });
  if (!photo.webPath) return null;
  return fetch(photo.webPath).then((r) => r.blob());
}

// ─── External browser ────────────────────────────────────────────────────────

export async function openExternal(url: string): Promise<void> {
  if (!isNative()) { window.location.href = url; return; }
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}

// ─── Push notifications (FCM) ────────────────────────────────────────────────

export async function registerForPush(): Promise<void> {
  if (!isNative()) return;

  const { PushNotifications } = await import('@capacitor/push-notifications');
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return;
  await PushNotifications.register();

  PushNotifications.addListener('registration', async (token) => {
    await fetch('/api/push/subscribe-native', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fcm_token: token.value, platform: 'android-fcm' }),
    });
  });

  // Foreground notification tap — route within the WebView
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const route = (action.notification.data as any)?.route as string | undefined;
    if (route) {
      // Buffer the route in case the WebView isn't ready yet (cold start).
      try { localStorage.setItem('pending_push_route', route); } catch { /* ignore */ }
      window.location.href = route;
    }
  });
}

// ─── STT (Speech Recognition) ────────────────────────────────────────────────

declare global {
  interface Window {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  }
}

function webSpeechFallback(language: string): Promise<string | null> {
  const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Ctor) return Promise.resolve(null);

  return new Promise((resolve) => {
    const sr = new Ctor();
    sr.lang = `${language}-IN`;
    sr.interimResults = false;
    sr.maxAlternatives = 1;
    sr.onresult = (e: any) => resolve(e.results[0][0].transcript);
    sr.onerror = () => resolve(null);
    sr.start();
  });
}

export async function startSpeechRecognition(opts: { language: string }): Promise<string | null> {
  if (!isNative()) return webSpeechFallback(opts.language);

  const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
  const perm = await SpeechRecognition.requestPermissions();
  if ((perm as any).speechRecognition !== 'granted') return null;

  const result = await SpeechRecognition.start({
    language: `${opts.language}-IN`,
    maxResults: 1,
    prompt: '',
    partialResults: false,
    popup: false,
  });
  return (result as any).matches?.[0] ?? null;
}

export async function stopSpeechRecognition(): Promise<void> {
  if (!isNative()) return;
  const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
  await SpeechRecognition.stop();
}

// ─── TTS (Text-to-Speech) — prefers Indian voices ────────────────────────────

const INDIAN_LOCALES = [
  'en-IN', 'hi-IN', 'bn-IN', 'mr-IN', 'ta-IN',
  'te-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN',
] as const;

// voiceURI cache per language so we don't call getSupportedVoices() every time
const voiceCache = new Map<string, string | undefined>();

async function pickIndianVoice(language: string): Promise<string | undefined> {
  const cacheKey = language;
  if (voiceCache.has(cacheKey)) return voiceCache.get(cacheKey);

  const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
  const { voices } = await TextToSpeech.getSupportedVoices();

  const target = `${language}-IN`;
  // Priority 1: exact locale match
  let voice = voices.find((v: any) => v.lang === target);
  // Priority 2: any *-IN locale
  if (!voice) voice = voices.find((v: any) => INDIAN_LOCALES.includes(v.lang));
  // Never fall back to non-Indian (undefined tells caller to show install prompt)

  const uri: string | undefined = voice?.voiceURI;
  voiceCache.set(cacheKey, uri);
  return uri;
}

export async function speak(opts: { text: string; language: string }): Promise<void> {
  if (!isNative()) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    // Cancel any in-flight utterance so the new tap replaces it
    window.speechSynthesis.cancel();
    return new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(opts.text);
      u.lang = `${opts.language}-IN`;
      u.rate = 0.95;
      u.pitch = 1.0;
      u.volume = 1.0;
      // Prefer a regional voice when available
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        const exact = voices.find((v) => v.lang === u.lang);
        const partial = voices.find((v) => v.lang.startsWith(opts.language));
        if (exact) u.voice = exact;
        else if (partial) u.voice = partial;
      }
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
    });
  }

  const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
  const voice = await pickIndianVoice(opts.language);

  if (!voice) {
    // No Indian voice installed — emit an event so the UI can show an install prompt
    window.dispatchEvent(new CustomEvent('tts:no-indian-voice', { detail: { language: opts.language } }));
    // Still attempt to speak with whatever default is available so the user isn't left in silence
  }

  // category: 'playback' routes through media-stream AudioAttributes so volume
  // and routing match the rest of the app's audio. The prior value 'ambient'
  // was a low-priority stream that Android silently suppressed on some devices —
  // the user saw the pause icon but heard nothing.
  try {
    await (TextToSpeech as any).speak({
      text: opts.text,
      lang: `${opts.language}-IN`,
      ...(voice ? { voice } : {}),
      rate: 1.0,
      pitch: 1.0,
      volume: 1.0,
      category: 'playback',
    });
  } catch (err) {
    // Most common cause on Android: requested locale's language data isn't
    // installed. Retry without the strict lang/voice so the system default
    // gets a chance to speak — better than silent failure.
    try {
      await (TextToSpeech as any).speak({
        text: opts.text,
        rate: 1.0,
        pitch: 1.0,
        volume: 1.0,
        category: 'playback',
      });
    } catch {
      throw err;
    }
  }
}

export async function stopSpeaking(): Promise<void> {
  if (!isNative()) { typeof window !== 'undefined' && window.speechSynthesis?.cancel(); return; }
  const { TextToSpeech } = await import('@capacitor-community/text-to-speech');
  await TextToSpeech.stop();
}
