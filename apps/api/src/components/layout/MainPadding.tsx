'use client';

import { useStore } from '@/store/useStore';
import type { ReactNode } from 'react';

export function MainPadding({ children }: { children: ReactNode }) {
  const theme = useStore((s) => s.theme);
  const isVedic = theme === 'vedic';
  return (
    <main
      className="flex-1 md:pb-0"
      style={{ paddingBottom: isVedic ? 68 : 100 }}
    >
      {children}
    </main>
  );
}
