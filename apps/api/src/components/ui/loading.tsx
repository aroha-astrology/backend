'use client';

import { WisdomLoader, WisdomLoaderBlock } from './wisdom-loader';
import type { WisdomSection } from './wisdom-loader';
import { PageSkeleton, Skeleton } from './skeleton';
import type { PlanetKey } from '@/components/3d/planet-registry';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  section?: WisdomSection;
  className?: string;
  /** Optional 3D planet rendered above the loader (size=lg only). */
  planet?: PlanetKey | string;
}

export function Loading({ size = 'md', section = 'dashboard', className, planet }: LoadingProps) {
  if (size === 'lg') {
    return (
      <WisdomLoaderBlock
        section={section}
        planet={planet}
        className={className}
      />
    );
  }
  const dims = size === 'sm' ? { width: 60, height: 12 } : { width: 80, height: 16 };
  return (
    <div className={`flex items-center justify-center p-4 ${className ?? ''}`}>
      <Skeleton {...dims} />
    </div>
  );
}

export function PageLoading({
  section,
  planet,
}: {
  section?: WisdomSection;
  planet?: PlanetKey | string;
}) {
  return (
    <div className="bg-bg">
      <WisdomLoaderBlock section={section ?? 'dashboard'} planet={planet} />
    </div>
  );
}

export { PageSkeleton };
