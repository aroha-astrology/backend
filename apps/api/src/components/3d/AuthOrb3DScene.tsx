'use client';

import { Scene3DProvider } from './Scene3DProvider';
import { PlanetOrb3D } from './PlanetOrb3D';
import { Stars3D } from './Stars3D';

export function AuthOrb3DScene() {
  return (
    <Scene3DProvider cameraPosition={[0, 0, 6]}>
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={1.2} color="#F2CA50" />
      <pointLight position={[-5, -3, 2]} intensity={0.5} color="#9050E0" />
      <Stars3D count={500} radius={14} size={0.035} />
      <PlanetOrb3D color="#D4AF37" radius={1.4} speed={0.8} emissiveIntensity={0.55} />
    </Scene3DProvider>
  );
}
