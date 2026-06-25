'use client';

interface SkeletonProps {
  className?: string;
  width?: number | string;
  height?: number | string;
  rounded?: boolean | string;
  style?: React.CSSProperties;
}

export function Skeleton({ className = '', width, height, rounded = true, style }: SkeletonProps) {
  return (
    <div
      className={className}
      style={{
        background: 'linear-gradient(90deg, var(--surface) 25%, var(--surface-2) 50%, var(--surface) 75%)',
        backgroundSize: '200% 100%',
        animation: 'j-shimmer 1.5s infinite',
        borderRadius: rounded === true ? 8 : rounded === false ? 0 : rounded,
        width,
        height,
        ...style,
      }}
    />
  );
}

export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} height={12} style={{ width: i === lines - 1 ? '65%' : '100%' }} />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`rounded-2xl p-4 space-y-3 bg-surface border border-border ${className}`}>
      <Skeleton height={16} width="60%" />
      <SkeletonText lines={3} />
    </div>
  );
}

export function SkeletonAvatar({ size = 40 }: { size?: number }) {
  return <Skeleton width={size} height={size} rounded="50%" />;
}

export function PageSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`flex min-h-screen flex-col px-4 pt-14 pb-6 gap-4 bg-bg ${className}`}>
      <Skeleton height={28} width="55%" style={{ marginBottom: 8 }} />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <div className="flex gap-3">
        <Skeleton height={12} width="40%" />
        <Skeleton height={12} width="30%" />
      </div>
    </div>
  );
}

export function ButtonSkeleton({ width = 48, height = 14 }: { width?: number; height?: number }) {
  return <Skeleton width={width} height={height} rounded="99px" />;
}

export function DotsSkeleton() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} width={7} height={7} rounded="50%" style={{ animationDelay: `${i * 0.2}s` }} />
      ))}
    </div>
  );
}
