'use client';

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'app_banner_dismissed_until';
const DISMISS_DAYS = 7;
const RAW_APK_URL = (process.env.NEXT_PUBLIC_APK_URL ?? '').trim();
const APK_URL = RAW_APK_URL.startsWith('/') || /^https?:\/\//i.test(RAW_APK_URL)
  ? RAW_APK_URL
  : '/downloads/aroha-astrology.apk';
const APP_PACKAGE = 'com.arohaastrology.app';

function shouldHide(): boolean {
  if (typeof window === 'undefined') return true;

  // Already inside the native app
  if ((window as any).Capacitor?.isNativePlatform()) return true;

  // Running as installed PWA in standalone mode
  if (window.matchMedia('(display-mode: standalone)').matches) return true;

  // Only show on Android — iOS has no sideload path yet
  const android = /Android/i.test(navigator.userAgent);
  if (!android) return true;

  // User dismissed recently
  const until = localStorage.getItem(DISMISS_KEY);
  if (until && Date.now() < Number(until)) return true;

  return false;
}

// Opens the installed app if present; fallback to APK URL if set, else just the web URL
function intentUrl(path: string) {
  const host = window.location.hostname;
  const fallback = APK_URL || `https://${host}${path}`;
  return `intent://${host}${path}#Intent;scheme=https;package=${APP_PACKAGE};S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}

export function SmartAppBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!shouldHide()) {
      setVisible(true);
      document.documentElement.style.setProperty('--app-banner-h', '52px');
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      document.documentElement.style.removeProperty('--app-banner-h');
    }
  }, [visible]);

  function dismiss() {
    const until = Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(until));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9998] flex items-center gap-3 px-3 py-2.5 shadow-sm"
      style={{
        background: '#EAE7E2',
        borderBottom: '1px solid rgba(212, 175, 55,0.2)',
      }}
    >
      {/* Close */}
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-[#5a6a75] hover:bg-black/5 transition-colors text-[14px] leading-none"
      >
        ✕
      </button>

      {/* Icon */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-192.png"
        alt="Aroha Astrology"
        className="w-10 h-10 rounded-xl flex-shrink-0 border border-black/10"
      />

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#1a2a35] leading-tight">Aroha Astrology</p>
        <p className="text-[11px] text-[#5a6a75] leading-tight truncate">
          Better in the app — faster &amp; offline
        </p>
      </div>

      {/* CTAs */}
      <div className="flex gap-1.5 flex-shrink-0">
        {/* Open — always shown; Intent URL opens app if installed */}
        <a
          href={intentUrl(window.location.pathname)}
          className="px-3 py-1.5 rounded-lg text-[12px] font-bold no-underline"
          style={{ background: '#7A96AB', color: '#fff' }}
        >
          Open
        </a>

        {/* Install — only shown when APK URL is configured */}
        {APK_URL && (
          <a
            href={APK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg text-[12px] font-semibold no-underline border"
            style={{ borderColor: '#7A96AB', color: '#7A96AB' }}
          >
            Install
          </a>
        )}
      </div>
    </div>
  );
}
