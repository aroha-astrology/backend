'use client';

import dynamic from 'next/dynamic';
import { useLowEndDevice } from './useLowEndDevice';
import { PLANET_VISUAL, resolvePlanetKey, type PlanetKey } from './planet-registry';

const Scene = dynamic(
  () => import('./Planet3DInlineScene').then(m => m.Planet3DInlineScene),
  { ssr: false, loading: () => null },
);

interface Planet3DInlineProps {
  /** Canonical key ('Sun'|'Mars'|...) OR any free-form name resolved via registry. */
  planet: PlanetKey | string;
  /** Square pixel size of the orb wrapper. Default 40px. */
  size?: number;
  /** Rotation speed multiplier. */
  speed?: number;
  className?: string;
  title?: string;
}

/**
 * Compact rotating 3D orb suitable for inline placement next to a planet
 * name, inside table cells, or as a card corner glyph. Falls back to a
 * pure-CSS radial-gradient orb on low-end devices / prefers-reduced-motion.
 */
export function Planet3DInline({
  planet,
  size = 40,
  speed = 1,
  className,
  title,
}: Planet3DInlineProps) {
  const key = (resolvePlanetKey(planet as string) ?? 'Sun') as PlanetKey;
  const low = useLowEndDevice();
  const v = PLANET_VISUAL[key];

  return (
    <span
      className={className}
      title={title ?? v.nameEn}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        position: 'relative',
        verticalAlign: 'middle',
        flexShrink: 0,
      }}
      aria-label={v.nameEn}
    >
      {low ? <InlineFallback planet={key} /> : <Scene planet={key} speed={speed} />}
    </span>
  );
}

const FALLBACK_TEXTURE: Record<PlanetKey, string> = {
  Sun:     '/textures/planets/sunmap.jpg',
  Moon:    '/textures/planets/moonmap.jpg',
  Mars:    '/textures/planets/marsmap.jpg',
  Mercury: '/textures/planets/mercurymap.jpg',
  Jupiter: '/textures/planets/jupitermap.jpg',
  Venus:   '/textures/planets/venusmap.jpg',
  Saturn:  '/textures/planets/saturnmap.jpg',
  Rahu:    '/textures/planets/moonmap.jpg',
  Ketu:    '/textures/planets/moonmap.jpg',
  Earth:   '/textures/planets/moonmap.jpg',
};

function InlineFallback({ planet }: { planet: PlanetKey }) {
  const v = PLANET_VISUAL[planet];
  const isShadow = planet === 'Rahu' || planet === 'Ketu';
  const isSaturn = planet === 'Saturn';
  return (
    <span
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: '50%',
        backgroundImage: `url(${FALLBACK_TEXTURE[planet]})`,
        backgroundSize: '200% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        boxShadow: `inset -6px -6px 14px rgba(0,0,0,0.5), 0 0 12px ${v.glow}`,
        filter: isShadow ? 'brightness(0.55) saturate(0.6)' : undefined,
      }}
    >
      {isSaturn && (
        <span
          aria-hidden
          style={{
            position: 'absolute',
            left: '-10%',
            right: '-10%',
            top: '38%',
            height: 'auto',
            backgroundImage: 'url(/textures/planets/saturnringalpha.png)',
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
            paddingTop: '6%',
            transform: 'rotate(-18deg) scaleY(0.7)',
            opacity: 0.95,
          }}
        />
      )}
    </span>
  );
}
