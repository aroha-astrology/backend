'use client';

import { Scene3DProvider } from './Scene3DProvider';
import { PlanetOrb3D } from './PlanetOrb3D';
import { Stars3D } from './Stars3D';

export function DashboardHero3DScene() {
  return (
    <Scene3DProvider cameraPosition={[0, 0, 5]}>
      <ambientLight intensity={0.45} />
      <pointLight position={[4, 4, 4]} intensity={1.0} color="#F2CA50" />
      <pointLight position={[-4, -2, 2]} intensity={0.35} color="#9050E0" />
      <Stars3D count={350} radius={10} size={0.028} />
      <PlanetOrb3D color="#C0C8D8" radius={0.85} position={[1.6, 0.2, 0]} speed={0.7} />
      <PlanetOrb3D color="#F2CA50" radius={0.4} position={[-1.6, -0.4, 0.5]} speed={1.4} emissiveIntensity={0.75} />
    </Scene3DProvider>
  );
}
