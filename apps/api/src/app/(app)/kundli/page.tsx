'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveChart } from '@/hooks/useActiveChart';

export default function KundliPage() {
  const router = useRouter();
  const { dataReady } = useActiveChart();

  useEffect(() => {
    if (!dataReady) return;
    router.replace('/kundli/generate');
  }, [dataReady, router]);

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <p className="text-sm text-text-muted">Loading your chart…</p>
    </div>
  );
}
