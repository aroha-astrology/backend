'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useLowEndDevice } from './useLowEndDevice';
import { getPlanetDataUrl } from './procedural-planet-textures';
import type { PlanetKey } from './planet-registry';

interface SceneProps {
  selected?: PlanetKey | null;
  onSelect?: (k: PlanetKey | null) => void;
}

const Scene = dynamic(
  () => import('./ZodiacWheel3DScene').then((m) => m.ZodiacWheel3DScene),
  { ssr: false },
) as React.ComponentType<SceneProps>;

// ── Deity mythology data ───────────────────────────────────────────────────
const PLANET_INFO: Record<string, {
  title: string;
  nameSa: string;
  role: string;
  line1: string;
  line2: string;
  accent: string;
  glow: string;
}> = {
  Sun:     { title: 'Surya',      nameSa: 'सूर्य',   role: 'King of Planets',       line1: 'Rides a blazing chariot drawn by 7 horses across the sky.', line2: 'Grants vitality, authority, confidence, and divine radiance.', accent: '#F2CA50', glow: 'rgba(242,202,80,0.4)' },
  Moon:    { title: 'Chandra',    nameSa: 'चंद्र',   role: 'Lord of Emotions',      line1: 'Born from Samudra Manthan, the churning of the cosmic ocean.', line2: 'Governs mind, emotions, memory, and the rhythm of tides.', accent: '#C0C8D8', glow: 'rgba(192,200,216,0.4)' },
  Mars:    { title: 'Mangal',     nameSa: 'मंगल',    role: 'Son of Earth',          line1: 'Commander of celestial armies, born from Prithvi (Earth) herself.', line2: 'Rules courage, war, ambition, and the warrior\'s fierce resolve.', accent: '#FF6B55', glow: 'rgba(255,107,85,0.4)' },
  Mercury: { title: 'Budha',      nameSa: 'बुध',     role: 'Prince of Intellect',   line1: 'Born of Moon (Chandra) and Tara\'s forbidden celestial union.', line2: 'Commands speech, intellect, commerce, and swift adaptability.', accent: '#5DD4A4', glow: 'rgba(93,212,164,0.4)' },
  Jupiter: { title: 'Brihaspati', nameSa: 'बृहस्पति',role: 'Preceptor of Devas',   line1: 'Divine teacher of the gods, eternal keeper of dharma and wisdom.', line2: 'The most benevolent force — bestows knowledge, luck, and grace.', accent: '#F2CA50', glow: 'rgba(242,202,80,0.4)' },
  Venus:   { title: 'Shukra',     nameSa: 'शुक्र',   role: 'Master of Asuras',      line1: 'Guru of the demons, sole knower of Mritasanjivani — the art of life.', line2: 'Commands love, beauty, luxury, and the healing of all wounds.', accent: '#F091B8', glow: 'rgba(240,145,184,0.4)' },
  Saturn:  { title: 'Shani',      nameSa: 'शनि',     role: 'Lord of Karma',         line1: 'Son of Surya and Chhaya; rides a crow chariot in patient silence.', line2: 'Delivers perfect karmic justice — reward and hardship alike.', accent: '#9CA8BC', glow: 'rgba(156,168,188,0.4)' },
  Rahu:    { title: 'Rahu',       nameSa: 'राहु',    role: 'Serpent\'s Head',        line1: 'Severed head of Svarbhanu who drank amrita (nectar of immortality).', line2: 'Causes solar eclipses; governs maya, illusion, and obsession.', accent: '#AA44EE', glow: 'rgba(170,68,238,0.4)' },
  Ketu:    { title: 'Ketu',       nameSa: 'केतु',    role: 'Serpent\'s Tail',        line1: 'The headless body of Svarbhanu — forever seeking its missing head.', line2: 'Rules past-life karma, spirituality, and liberation (moksha).', accent: '#E0506B', glow: 'rgba(224,80,107,0.4)' },
};

// ── Info Card Overlay ──────────────────────────────────────────────────────
function PlanetInfoCard({ planet, onClose }: { planet: PlanetKey; onClose: () => void }) {
  const info = PLANET_INFO[planet];
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    // Load planet texture as data URL on client
    setImgUrl(getPlanetDataUrl(planet));
  }, [planet]);

  if (!info) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 20,
        padding: '0 8px 10px',
        pointerEvents: 'none',
      }}
    >
      <div
        onClick={onClose}
        style={{
          background: 'rgba(4,10,26,0.90)',
          border: `1px solid ${info.accent}55`,
          borderRadius: '14px',
          padding: '14px 16px',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          boxShadow: `0 0 30px ${info.glow}, 0 4px 30px rgba(0,0,0,0.6)`,
          cursor: 'pointer',
          pointerEvents: 'auto',
        }}
      >
        {/* Planet image circle */}
        <div style={{
          flexShrink: 0,
          width: 62,
          height: 62,
          borderRadius: '50%',
          border: `2px solid ${info.accent}88`,
          boxShadow: `0 0 18px ${info.glow}`,
          overflow: 'hidden',
          background: 'rgba(20,40,80,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {imgUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imgUrl}
              alt={info.title}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '50%',
              }}
            />
          ) : (
            <div style={{ width: 62, height: 62, borderRadius: '50%', background: `radial-gradient(circle, ${info.accent}44, transparent)` }} />
          )}
        </div>

        {/* Text content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Eyebrow */}
          <div style={{
            fontSize: '9px',
            letterSpacing: '0.14em',
            color: info.accent,
            textTransform: 'uppercase',
            marginBottom: '2px',
            opacity: 0.9,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            {info.nameSa} · {info.role}
          </div>
          {/* Name */}
          <div style={{
            fontSize: '18px',
            fontWeight: 800,
            color: '#F0F4FF',
            lineHeight: 1.1,
            marginBottom: '5px',
            fontFamily: 'Cinzel, Georgia, serif',
            letterSpacing: '0.04em',
          }}>
            {info.title}
          </div>
          {/* Two mythology lines */}
          <div style={{
            fontSize: '10px',
            color: '#8AAECE',
            lineHeight: 1.5,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            {info.line1}
          </div>
          <div style={{
            fontSize: '10px',
            color: '#6A90B8',
            lineHeight: 1.5,
            marginTop: '2px',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            {info.line2}
          </div>
        </div>

        {/* Dismiss hint */}
        <div style={{
          flexShrink: 0,
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: `1px solid ${info.accent}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: info.accent,
          fontSize: '14px',
          opacity: 0.7,
        }}>
          ✕
        </div>
      </div>
    </div>
  );
}

/** Rotating solar system with interactive Navagraha — landing hero. */
export function ZodiacWheel3D({ className }: { className?: string }) {
  const low = useLowEndDevice();
  const [selected, setSelected] = useState<PlanetKey | null>(null);

  if (low) return <ZodiacWheelFallback className={className} />;

  return (
    <div className={className} style={{ position: 'relative' }}>
      <Scene selected={selected} onSelect={setSelected} />
      {selected && (
        <PlanetInfoCard planet={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}

function ZodiacWheelFallback({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <div className="relative w-full h-full flex items-center justify-center">
        <div className="j-zodiac-ring j-rotate-slow" style={{ width: '70%', height: '70%', position: 'relative' }} />
        <div
          className="absolute j-float"
          style={{
            width: 80,
            height: 80,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #F2CA50 0%, #D4AF37 40%, transparent 75%)',
            boxShadow: '0 0 50px rgba(242,202,80,0.55)',
          }}
        />
      </div>
    </div>
  );
}
