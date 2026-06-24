'use client';

import Image from 'next/image';
import { useState, useEffect } from 'react';

function sanitizeUrl(raw: string | undefined, fallback: string): string {
  const v = (raw ?? '').trim();
  if (!v) return fallback;
  if (v.startsWith('/') || /^https?:\/\//i.test(v)) return v;
  return fallback;
}

const APK_URL = sanitizeUrl(process.env.NEXT_PUBLIC_APK_URL, '/downloads/aroha-astrology.apk');
const IPA_URL = sanitizeUrl(process.env.NEXT_PUBLIC_IPA_URL, '/downloads/aroha-astrology.ipa');

type Sheet = null | 'android' | 'ios';

export function AppDownloadCard() {
  const [sheet, setSheet] = useState<Sheet>(null);

  useEffect(() => {
    if (sheet) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [sheet]);

  return (
    <>
      <div className="j-card p-4 md:p-5 flex flex-col md:flex-row items-center gap-4 md:gap-5">
        <div className="relative w-16 h-16 md:w-[72px] md:h-[72px] shrink-0 rounded-2xl overflow-hidden border border-border shadow-[0_0_20px_var(--glow-soft)]">
          <Image
            src="/icons/icon-192.png"
            alt="Aroha Astrology app icon"
            fill
            sizes="72px"
            className="object-cover"
          />
        </div>

        <div className="flex-1 min-w-0 text-center md:text-left">
          <div className="j-display j-text-gold text-[15px] md:text-base font-semibold leading-tight">
            Aroha Astrology — on your phone
          </div>
          <div className="text-[12px] md:text-[13px] text-text-muted leading-snug mt-1">
            Daily panchang · faster kundli · works offline
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto shrink-0">
          <button
            type="button"
            onClick={() => setSheet('android')}
            className="j-btn j-btn-primary inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <AndroidGlyph />
            <span>Install for Android</span>
          </button>
          <button
            type="button"
            onClick={() => setSheet('ios')}
            className="j-btn j-btn-secondary inline-flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <AppleGlyph />
            <span>Install for iPhone</span>
          </button>
        </div>
      </div>

      {sheet && (
        <InstallSheet platform={sheet} onClose={() => setSheet(null)} />
      )}
    </>
  );
}

function InstallSheet({ platform, onClose }: { platform: 'android' | 'ios'; onClose: () => void }) {
  const isAndroid = platform === 'android';
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-3 sm:p-4"
      style={{ background: 'rgba(8, 10, 16, 0.72)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="j-card w-full max-w-md p-5 md:p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full text-text-muted hover:text-text transition-colors"
          style={{ background: 'transparent' }}
        >
          ✕
        </button>

        <div className="flex items-center gap-3 mb-4">
          <span className="text-accent text-2xl">
            {isAndroid ? <AndroidGlyph large /> : <AppleGlyph large />}
          </span>
          <h3 className="j-display j-text-gold text-lg font-semibold">
            {isAndroid ? 'Install on Android' : 'Install on iPhone'}
          </h3>
        </div>

        {isAndroid ? (
          APK_URL ? (
            <ol className="text-[13px] text-text-muted space-y-2 mb-5 list-decimal pl-5 leading-relaxed">
              <li>Tap <span className="text-text font-semibold">Download APK</span> below.</li>
              <li>Open the downloaded file from your notification tray or Downloads folder.</li>
              <li>If prompted, allow <span className="text-text">Install unknown apps</span> for your browser — Android needs this for direct installs.</li>
              <li>Tap <span className="text-text font-semibold">Install</span> and open Aroha Astrology.</li>
            </ol>
          ) : (
            <div className="text-[13px] text-text-muted space-y-2 mb-5 leading-relaxed">
              <p>
                Our Android app is launching very soon on the Play Store ✨
              </p>
              <p className="text-[11px] opacity-70">
                Sign in with your phone number — we&rsquo;ll send you a one-tap install link the moment it&rsquo;s ready.
              </p>
            </div>
          )
        ) : (
          IPA_URL ? (
            <div className="text-[13px] text-text-muted space-y-3 mb-5 leading-relaxed">
              <p>
                The iOS app is coming to the App Store. For now you can sideload it on any iPhone — no jailbreak needed.
              </p>
              <ol className="space-y-2 list-decimal pl-5">
                <li>Install <a href="https://altstore.io" target="_blank" rel="noopener noreferrer" className="text-accent underline">AltStore</a> (free) or <a href="https://sideloadly.io" target="_blank" rel="noopener noreferrer" className="text-accent underline">Sideloadly</a> on your computer.</li>
                <li>Download the IPA below.</li>
                <li>Open the IPA with AltStore / Sideloadly and follow the prompts to install on your iPhone.</li>
              </ol>
            </div>
          ) : (
            <div className="text-[13px] text-text-muted space-y-2 mb-5 leading-relaxed">
              <p>
                Our iPhone app is launching very soon on the App Store ✨
              </p>
              <p className="text-[11px] opacity-70">
                Sign in with your phone number — we&rsquo;ll let you know the moment it&rsquo;s live.
              </p>
            </div>
          )
        )}

        {(isAndroid ? APK_URL : IPA_URL) ? (
          <a
            href={isAndroid ? APK_URL : IPA_URL}
            download
            className="j-btn j-btn-primary w-full inline-flex items-center justify-center gap-2 no-underline"
          >
            {isAndroid ? 'Download APK' : 'Download IPA'}
          </a>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="j-btn j-btn-primary w-full inline-flex items-center justify-center gap-2 opacity-60 cursor-not-allowed"
          >
            Coming Soon
          </button>
        )}
      </div>
    </div>
  );
}

function AndroidGlyph({ large = false }: { large?: boolean }) {
  const size = large ? 22 : 16;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.523 15.341a1.001 1.001 0 1 1 1.001-1.001 1 1 0 0 1-1.001 1.001m-11.046 0a1.001 1.001 0 1 1 1.001-1.001 1 1 0 0 1-1.001 1.001m11.405-6.02 1.997-3.46a.416.416 0 0 0-.72-.416l-2.022 3.503A12.59 12.59 0 0 0 12 7.866a12.59 12.59 0 0 0-5.137 1.082L4.841 5.445a.416.416 0 1 0-.72.416l1.997 3.46A11.78 11.78 0 0 0 0 18h24a11.78 11.78 0 0 0-6.118-8.679" />
    </svg>
  );
}

function AppleGlyph({ large = false }: { large?: boolean }) {
  const size = large ? 22 : 16;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25" />
    </svg>
  );
}
