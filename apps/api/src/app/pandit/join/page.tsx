'use client';

import dynamic from 'next/dynamic';

const PanditJoinClient = dynamic(() => import('./_client'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  ),
});

export default function PanditJoinPage() {
  return <PanditJoinClient />;
}
