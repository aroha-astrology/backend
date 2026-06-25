'use client';

import { motion } from 'framer-motion';

type Variant = 'dashboard' | 'life-journey' | 'chat' | 'panchang';

const SHIMMER_BG =
  'linear-gradient(90deg, transparent 0%, rgba(212, 175, 55, 0.10) 50%, transparent 100%)';

function Shimmer() {
  return (
    <motion.div
      aria-hidden
      className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden"
      style={{ background: SHIMMER_BG }}
      animate={{ x: ['-100%', '100%'] }}
      transition={{ duration: 1.6, repeat: Infinity, ease: 'linear' }}
    />
  );
}

function Bar({ w = 'w-full', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`${h} ${w} rounded animate-pulse bg-surface-2`} />;
}

function Card({ children, className = '' }: { children?: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl p-4 border border-border ${className}`}
      style={{ background: 'var(--card-bg)' }}
    >
      <Shimmer />
      <div className="relative space-y-3">{children}</div>
    </div>
  );
}

export function RouteSkeleton({ variant }: { variant: Variant }) {
  return (
    <div className="mx-auto w-full max-w-[448px] px-4 py-4 pb-28">
      <SkeletonBody variant={variant} />
    </div>
  );
}

function SkeletonBody({ variant }: { variant: Variant }) {
  switch (variant) {
    case 'dashboard':
      return (
        <div className="space-y-4">
          {/* Top bar */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full animate-pulse bg-surface-2" />
            <div className="flex-1 space-y-1.5">
              <Bar h="h-3" w="w-32" />
              <Bar h="h-3" w="w-20" />
            </div>
          </div>
          {/* Dasha card */}
          <Card>
            <Bar h="h-3" w="w-40" />
            <Bar h="h-5" w="w-3/4" />
            <Bar h="h-3" w="w-full" />
            <Bar h="h-3" w="w-5/6" />
          </Card>
          {/* Chart card */}
          <Card>
            <div className="flex items-center justify-between">
              <Bar h="h-4" w="w-32" />
              <Bar h="h-3" w="w-16" />
            </div>
            <div className="flex justify-center pt-2">
              <div className="w-full max-w-[320px] aspect-square rounded-2xl animate-pulse bg-surface-2" />
            </div>
          </Card>
          {/* Tabs + horoscope */}
          <Card>
            <div className="flex gap-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex-1 h-8 rounded-full animate-pulse bg-surface-2" />
              ))}
            </div>
            <Bar h="h-4" w="w-1/2" />
            <Bar h="h-3" w="w-full" />
            <Bar h="h-3" w="w-5/6" />
          </Card>
        </div>
      );

    case 'life-journey':
      return (
        <div className="space-y-4">
          <Bar h="h-6" w="w-48" />
          <Bar h="h-3" w="w-64" />
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full animate-pulse bg-surface-2" />
                <div className="flex-1 space-y-2">
                  <Bar h="h-4" w="w-1/2" />
                  <Bar h="h-3" w="w-3/4" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      );

    case 'chat':
      return (
        <div className="flex flex-col gap-3 min-h-[60vh]">
          <Bar h="h-5" w="w-40" />
          <div className="flex-1 space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                <div className="max-w-[80%] space-y-2">
                  <div className="h-12 w-60 rounded-2xl animate-pulse bg-surface-2" />
                </div>
              </div>
            ))}
          </div>
          <div className="h-12 w-full rounded-full animate-pulse bg-surface-2 mt-auto" />
        </div>
      );

    case 'panchang':
      return (
        <div className="space-y-4">
          <Bar h="h-6" w="w-40" />
          <Card>
            <div className="grid grid-cols-2 gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Bar h="h-3" w="w-16" />
                  <Bar h="h-4" w="w-3/4" />
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <Bar h="h-4" w="w-32" />
            <Bar h="h-3" w="w-full" />
            <Bar h="h-3" w="w-5/6" />
            <Bar h="h-3" w="w-2/3" />
          </Card>
        </div>
      );
  }
}
