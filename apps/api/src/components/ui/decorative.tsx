'use client';

import { cn } from '@/lib/utils';

interface ConstellationProps {
  width?: number;
  height?: number;
  opacity?: number;
  className?: string;
}

export function Constellation({
  width = 140,
  height = 80,
  opacity = 0.4,
  className,
}: ConstellationProps) {
  const pts: [number, number][] = [
    [10, 60],
    [40, 30],
    [70, 50],
    [90, 20],
    [120, 40],
    [130, 70],
  ];
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 140 80"
      style={{ opacity, color: 'var(--text)' }}
      className={className}
    >
      <polyline
        points={pts.map((p) => p.join(',')).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.6"
        strokeDasharray="2 3"
      />
      {pts.map(([x, y], i) => (
        <circle
          key={i}
          cx={x}
          cy={y}
          r={i === 1 || i === 4 ? 2.5 : 1.5}
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function TokenGlyph({ size = 11 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      style={{ display: 'inline-block', verticalAlign: '-1px' }}
    >
      <polygon
        points="6,1 11,10 1,10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="6" cy="7.2" r="1.1" fill="currentColor" />
    </svg>
  );
}

interface OrbProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Orb({ size = 280, className, style }: OrbProps) {
  return (
    <span
      aria-hidden
      className={cn('j-orb', className)}
      style={{ width: size, height: size, ...style }}
    />
  );
}

export function Starfield({ className }: { className?: string }) {
  return <span aria-hidden className={cn('j-starfield', className)} />;
}
