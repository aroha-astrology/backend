'use client';

import Image from 'next/image';

interface AstrologerAvatarProps {
  imagePath: string;
  name: string;
  size?: number;
  rounded?: 'xl' | 'full';
  bordered?: boolean;
  className?: string;
}

export function AstrologerAvatar({
  imagePath,
  name,
  size = 76,
  rounded = 'xl',
  bordered = true,
  className = '',
}: AstrologerAvatarProps) {
  return (
    <div
      className={`overflow-hidden ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: rounded === 'full' ? '9999px' : '12px',
        border: bordered ? '1.5px solid var(--border-strong)' : 'none',
        flexShrink: 0,
      }}
    >
      <Image
        src={imagePath}
        alt={name}
        width={size}
        height={size}
        className="w-full h-full object-cover object-top"
      />
    </div>
  );
}
