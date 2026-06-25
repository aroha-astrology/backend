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
import { Stars3D } from './Stars3D';
import { PLANET_META } from './NavagrahaTransit3D';

// 2K equirectangular maps from Solar System Scope (CC BY 4.0).
// See public/textures/planets/README.txt for attribution.
const PLANET_TEXTURE: Record<string, string> = {
  Sun:     '/textures/planets/sunmap.jpg',
  Moon:    '/textures/planets/moonmap.jpg',
  Mars:    '/textures/planets/marsmap.jpg',
  Mercury: '/textures/planets/mercurymap.jpg',
  Jupiter: '/textures/planets/jupitermap.jpg',
  Venus:   '/textures/planets/venusmap.jpg',
  Saturn:  '/textures/planets/saturnmap.jpg',
  // Rahu/Ketu are shadow grahas — reuse moon texture, dark-tinted in the shader.
  Rahu:    '/textures/planets/moonmap.jpg',
  Ketu:    '/textures/planets/moonmap.jpg',
};
// Single 2048×125 RGBA strip from Solar System Scope. Used both as colour map
// (warm gold tones) AND alphaMap (transparency cutout) so the ring has a real
// inner hole and a true outer fade instead of a blanket 0.85 opacity blur.
const RING_TEXTURE = '/textures/planets/saturnringalpha.png';

// `ringGeometry` from three.js has trash UVs — every vertex maps to a corner
// of the texture, so the ring strip never tiles radially. This helper rebuilds
// the UVs so the texture spans inner→outer radius along the U axis, which is
// how Solar System Scope (and almost every other planet pack) ships the strip.
function makeRingGeometry(inner: number, outer: number, segments = 128): RingGeometry {
  const geo = new RingGeometry(inner, outer, segments);
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const radius = Math.hypot(x, y);
    const t = (radius - inner) / (outer - inner); // 0 at inner edge, 1 at outer
    uv[i * 2] = t;
    uv[i * 2 + 1] = 1;
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  return geo;
}

function DashaPlanet({ name }: { name: string }) {
  const meta = PLANET_META[name] ?? PLANET_META.Sun;
  const groupRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);
  const haloRef = useRef<Mesh>(null);

  const url = PLANET_TEXTURE[name] ?? PLANET_TEXTURE.Sun;
  const map = useTexture(url);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 8;
  const ringMap = useTexture(RING_TEXTURE);
  ringMap.colorSpace = SRGBColorSpace;
  ringMap.anisotropy = 8;

  useFrame((state, delta) => {
    if (meshRef.current) meshRef.current.rotation.y += delta * 0.15;
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.06;
    }
    if (haloRef.current) {
      const s = 1 + Math.sin(state.clock.elapsedTime * 0.9) * 0.03;
      haloRef.current.scale.set(s, s, s);
    }
  });

  const r = 1.35;
  const hasRing = name === 'Saturn';
  const isSun = name === 'Sun';
  const isShadow = name === 'Rahu' || name === 'Ketu';
  const shadowTint = name === 'Rahu' ? '#5a4a8a' : '#7a3a48';

  const ringGeometry = useMemo(
    () => (hasRing ? makeRingGeometry(r * 1.45, r * 2.30, 192) : null),
    [hasRing],
  );

  return (
    <group ref={groupRef}>
      {/* Sphere — slight Z-tilt to give a recognisable axial pose */}
      <mesh ref={meshRef} rotation={[0, 0, 0.22]}>
        <sphereGeometry args={[r, 96, 96]} />
        <meshStandardMaterial
          map={map}
          color={isShadow ? shadowTint : '#ffffff'}
          emissive={isSun ? '#F2CA50' : '#000000'}
          emissiveMap={isSun ? map : undefined}
          emissiveIntensity={isSun ? 0.95 : 0}
          roughness={isSun ? 1 : 0.78}
          metalness={isShadow ? 0.25 : 0.08}
          transparent={isShadow}
          opacity={isShadow ? 0.82 : 1}
        />
      </mesh>

      {/* Saturn ring — alphaMap carves the hole, transparent material gives the
          soft outer falloff. tilt ≈ 27° matches the real planet. */}
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

      {/* Inner glow for the Sun's photosphere */}
      {isSun && (
        <mesh>
          <sphereGeometry args={[r * 1.08, 48, 48]} />
          <meshBasicMaterial color="#F2CA50" transparent opacity={0.18} blending={AdditiveBlending} />
        </mesh>
      )}

      {/* Atmospheric rim — back-side sphere with additive blending gives the
          fresnel-style soft halo without needing a custom shader. */}
      <mesh scale={1.06}>
        <sphereGeometry args={[r, 48, 48]} />
        <meshBasicMaterial
          color={isShadow ? '#7a5fb0' : isSun ? '#FFD27A' : meta.color}
          transparent
          opacity={isShadow ? 0.18 : isSun ? 0.28 : 0.12}
          side={BackSide}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Larger outer halo — slow gentle pulse */}
      <mesh ref={haloRef}>
        <sphereGeometry args={[r * 1.22, 32, 32]} />
        <meshBasicMaterial
          color={meta.color}
          transparent
          opacity={isShadow ? 0.16 : isSun ? 0.18 : 0.07}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

export function DashaPlanet3DScene({ planet }: { planet: string }) {
  const isSun = planet === 'Sun';
  return (
    <Scene3DProvider cameraPosition={[0, 0.4, 5]}>
      {/* Lower ambient + stronger keylight = chunkier terminator + more depth.
          The cool fill kills the flat brown-blob look the earlier setup had. */}
      <ambientLight intensity={isSun ? 0.6 : 0.28} />
      <directionalLight position={[5, 3, 4]} intensity={isSun ? 0.6 : 1.6} color="#FFF4DC" />
      <pointLight position={[-4, -1, 3]} intensity={0.55} color="#7A8CFF" />
      <pointLight position={[0, 4, -4]} intensity={0.35} color="#9050E0" />
      <Stars3D count={300} radius={9} size={0.022} />
      <DashaPlanet name={planet} />
    </Scene3DProvider>
  );
}
