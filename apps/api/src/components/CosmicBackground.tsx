'use client';

export function CosmicBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {/* Deep obsidian base */}
      <div className="absolute inset-0 bg-bg" />

      {/* Cosmic aurora — animated nebula tints */}
      <div className="j-aurora-bg" />

      {/* Starfield layer */}
      <div className="j-starfield" />

      {/* Drifting gold orbs */}
      <div
        className="j-orb"
        style={{
          width: 420,
          height: 420,
          top: '-12%',
          right: '-10%',
          opacity: 0.55,
          animation: 'j-float 14s ease-in-out infinite',
        }}
      />
      <div
        className="j-orb"
        style={{
          width: 320,
          height: 320,
          bottom: '-10%',
          left: '-8%',
          opacity: 0.45,
          background: 'radial-gradient(circle, rgba(80,30,140,0.45) 0%, transparent 70%)',
          animation: 'j-float 18s ease-in-out 3s infinite',
        }}
      />

      {/* Subtle constellation rings, top right */}
      <div
        className="j-zodiac-ring hidden md:block j-rotate-slow"
        style={{ top: '5%', right: '5%', width: 260, height: 260, opacity: 0.35 }}
      />
    </div>
  );
}
