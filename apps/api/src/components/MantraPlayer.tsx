'use client';

import { useState, useRef } from 'react';

interface MantraPlayerProps {
  mantraText: string;
  rashi: string;
  date: string;
  lang: string;
  preloadedUrl?: string;
}

export function MantraPlayer({ mantraText, rashi, date, lang, preloadedUrl }: MantraPlayerProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(preloadedUrl ?? null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleToggle = async () => {
    if (loading) return;
    setError(false);

    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }

    let url = audioUrl;
    if (!url) {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/horoscope/daily/mantra-audio?rashi=${encodeURIComponent(rashi)}&date=${date}&lang=${lang}`,
        );
        const data = await res.json();
        if (!data.url) throw new Error('no url');
        url = data.url;
        setAudioUrl(url);
      } catch {
        setError(true);
        setLoading(false);
        return;
      }
      setLoading(false);
    }

    if (!url) return;

    if (!audioRef.current || audioRef.current.src !== url) {
      audioRef.current = new Audio(url);
      audioRef.current.onended = () => setPlaying(false);
      audioRef.current.onerror = () => { setPlaying(false); setError(true); };
    }

    audioRef.current.play().catch(() => { setPlaying(false); setError(true); });
    setPlaying(true);
  };

  return (
    <div className="mt-2 flex items-start gap-2">
      <button
        type="button"
        onClick={handleToggle}
        disabled={loading}
        aria-label={playing ? 'Pause mantra' : 'Play mantra'}
        className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-semibold transition-all active:scale-95 disabled:opacity-60"
        style={{ background: 'rgba(217,119,6,0.10)', borderColor: 'rgba(217,119,6,0.30)', color: '#92400e' }}
      >
        {loading ? (
          <span className="w-3 h-3 border border-amber-600 border-t-transparent rounded-full animate-spin inline-block" />
        ) : playing ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
        )}
        {loading ? 'Generating…' : playing ? 'Pause' : 'Hear Mantra'}
      </button>
      <p className="text-[11px] italic text-amber-700 font-medium leading-relaxed pt-0.5">
        {mantraText}
        {error && <span className="ml-1 not-italic text-[9px] text-red-500">– audio unavailable</span>}
      </p>
    </div>
  );
}
