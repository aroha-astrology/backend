import { CosmicBackground } from '@/components/CosmicBackground';
import { AuthOrb3D } from '@/components/3d/AuthOrb3D';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CosmicBackground />
      {/* 3D gold orb floats behind the form */}
      <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        <AuthOrb3D />
      </div>
      <div className="relative min-h-screen" style={{ zIndex: 1 }}>
        {children}
      </div>
    </>
  );
}
