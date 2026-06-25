'use client';

import { useRef, useEffect, useState } from 'react';

export function ZodiacHero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = 0.75; // slightly slower for dramatic effect
  }, []);

  return (
    <div className="relative w-full overflow-hidden rounded-2xl" style={{ height: 220 }}>
      {/* Video background */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        src="/videos/zodiac-wheel.mp4"
        autoPlay
        loop
        muted
        playsInline
        onLoadedData={() => setLoaded(true)}
        style={{ opacity: loaded ? 1 : 0, transition: 'opacity 0.8s ease' }}
      />

      {/* Gradient overlays for integration with UI */}
      <div className="absolute inset-0" style={{
        background: `
          linear-gradient(to bottom, rgba(5,5,16,0.3) 0%, rgba(5,5,16,0.1) 40%, rgba(5,5,16,0.6) 85%, rgba(5,5,16,0.95) 100%),
          linear-gradient(to right, rgba(5,5,16,0.4) 0%, transparent 30%, transparent 70%, rgba(5,5,16,0.4) 100%)
        `,
      }} />

      {/* Subtle glass border effect */}
      <div className="absolute inset-0 rounded-2xl" style={{
        border: '1px solid rgba(226,179,64,0.15)',
        boxShadow: 'inset 0 1px 0 rgba(226,179,64,0.08), 0 4px 32px rgba(0,0,0,0.4)',
      }} />

      {/* Loading shimmer placeholder */}
      {!loaded && (
        <div className="absolute inset-0 rounded-2xl shimmer" style={{
          background: 'linear-gradient(135deg, rgba(212,168,67,0.06) 0%, rgba(212,168,67,0.10) 50%, rgba(212,168,67,0.06) 100%)',
        }} />
      )}
    </div>
  );
}
