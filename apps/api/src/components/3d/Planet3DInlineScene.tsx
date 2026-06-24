'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  DoubleSide,
  RingGeometry,
  SRGBColorSpace,
  type Group,
  type Mesh,
} from 'three';
import { Scene3DProvider } from './Scene3DProvider';
import { PLANET_VISUAL, type PlanetKey } from './planet-registry';

// Same 2K equirectangular maps the big DashaPlanet3DScene uses — Solar System
// Scope, CC BY 4.0 (see public/textures/planets/README.txt).
const PLANET_TEXTURE: Record<PlanetKey, string> = {
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
const RING_TEXTURE = '/textures/planets/saturnringalpha.png';

// three.js's default RingGeometry maps every vertex to a corner of the texture,
// which makes the SSS ring strip never tile across the radius. Rebuild UVs so
// the strip spans inner→outer along the U axis.
function makeRingGeometry(inner: number, outer: number, segments = 128): RingGeometry {
  const geo = new RingGeometry(inner, outer, segments);
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const radius = Math.hypot(x, y);
    const t = (radius - inner) / (outer - inner);
    uv[i * 2] = t;
    uv[i * 2 + 1] = 1;
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  return geo;
}

function PlanetMesh({ planet, speed }: { planet: PlanetKey; speed: number }) {
  const v = PLANET_VISUAL[planet];
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);

  const map = useTexture(PLANET_TEXTURE[planet]);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;

  const hasRing = planet === 'Saturn';
  const ringMap = useTexture(RING_TEXTURE);
  ringMap.colorSpace = SRGBColorSpace;
  ringMap.anisotropy = 8;

  const r = 1.2;
  const isSun = planet === 'Sun';
  const isShadow = planet === 'Rahu' || planet === 'Ketu';
  const shadowTint = planet === 'Rahu' ? '#5a4a8a' : '#7a3a48';

  const ringGeometry = useMemo(
    () => (hasRing ? makeRingGeometry(r * 1.45, r * 2.30, 128) : null),
    [hasRing],
  );

  useFrame((state, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.35 * speed;
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.7) * 0.05;
    }
  });

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} rotation={[0, 0, isSun ? 0 : 0.22]}>
        <sphereGeometry args={[r, 48, 48]} />
        <meshStandardMaterial
          map={map}
          color={isShadow ? shadowTint : '#ffffff'}
          emissive={isSun ? '#F2CA50' : '#000000'}
          emissiveMap={isSun ? map : undefined}
          emissiveIntensity={isSun ? 0.95 : 0}
          roughness={isSun ? 1 : 0.78}
          metalness={isShadow ? 0.25 : 0.08}
          transparent={v.ghostly}
          opacity={v.ghostly ? 0.82 : 1}
        />
      </mesh>

      {/* Saturn ring — same alpha-driven setup as the hero scene */}
      {hasRing && ringGeometry && (
        <mesh ref={ringRef} geometry={ringGeometry} rotation={[Math.PI / 2 - 0.47, 0, 0.18]}>
          <meshBasicMaterial
            map={ringMap}
            alphaMap={ringMap}
            side={DoubleSide}
            transparent
            depthWrite={false}
            opacity={1}
          />
        </mesh>
      )}

      {/* Atmospheric rim — back-side additive sphere */}
      <mesh scale={1.07}>
        <sphereGeometry args={[r, 32, 32]} />
        <meshBasicMaterial
          color={isShadow ? '#7a5fb0' : isSun ? '#FFD27A' : v.color}
          transparent
          opacity={isShadow ? 0.18 : isSun ? 0.30 : 0.13}
          side={BackSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Sun corona */}
      {v.corona && (
        <mesh>
          <sphereGeometry args={[r * 1.4, 24, 24]} />
          <meshBasicMaterial color={v.color} transparent opacity={0.16} blending={AdditiveBlending} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

export function Planet3DInlineScene({
  planet,
  speed = 1,
}: {
  planet: PlanetKey;
  speed?: number;
}) {
  const isSun = planet === 'Sun';
  return (
    <Scene3DProvider cameraPosition={[0, 0.2, 4.2]}>
      {/* Mirror the hero scene's lighting recipe so small inline planets share
          the same chunky terminator + warm key / cool fill look. */}
      <ambientLight intensity={isSun ? 0.6 : 0.3} />
      <directionalLight position={[4, 3, 4]} intensity={isSun ? 0.55 : 1.5} color="#FFF4DC" />
      <pointLight position={[-3, -1, 2]} intensity={0.5} color="#7A8CFF" />
      <PlanetMesh planet={planet} speed={speed} />
    </Scene3DProvider>
  );
}
