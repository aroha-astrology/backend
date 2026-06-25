'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import { GUNA_AXIS_SHORT_LABELS, GUNA_AXIS_LABELS, GUNA_AXIS_ORDER, type GunaAxes, type GunaAxisKey } from '@/lib/guna/mapShadbalaToAxes';

interface Props {
  chartId: string | null;
}

interface GunaApiResponse {
  success: boolean;
  data?: { axes: GunaAxes };
}

function useGunaAxesQuery(chartId: string | null) {
  return useQuery<GunaAxes | null>({
    queryKey: ['gunaChakra', 'axes', chartId],
    queryFn: async () => {
      const r = await fetch(`/api/guna-chakra/${chartId}`);
      if (!r.ok) return null;
      const json = (await r.json()) as GunaApiResponse;
      return json.data?.axes ?? null;
    },
    enabled: !!chartId,
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
}

export function GunaChakraCard({ chartId }: Props) {
  const { data: axes, isLoading } = useGunaAxesQuery(chartId);

  if (!chartId) return null;
  if (isLoading) {
    return (
      <Link
        href="/guna-chakra"
        className="block w-full p-3 rounded-2xl mb-3 bg-surface border border-border no-underline"
      >
        <div className="flex gap-3 items-center">
          <div className="w-[88px] h-[88px] rounded-xl flex-shrink-0 animate-pulse bg-surface-2" />
          <div className="flex-1 flex flex-col gap-2">
            <div className="h-3 w-28 rounded animate-pulse bg-surface-2" />
            <div className="h-3 w-40 rounded animate-pulse bg-surface-2" />
            <div className="h-3 w-32 rounded animate-pulse bg-surface-2" />
          </div>
        </div>
      </Link>
    );
  }
  if (!axes) return null;

  const radarData = GUNA_AXIS_ORDER.map((key) => ({
    axis: GUNA_AXIS_SHORT_LABELS[key],
    score: axes[key] ?? 0,
  }));

  const topKey = (Object.keys(axes) as GunaAxisKey[]).reduce((a, b) =>
    (axes[a] ?? 0) >= (axes[b] ?? 0) ? a : b,
  );
  const topLabel = GUNA_AXIS_LABELS[topKey];
  const topScore = Math.round(axes[topKey] ?? 0);

  return (
    <Link
      href="/guna-chakra"
      className="block w-full p-3 rounded-2xl mb-3 bg-surface border border-border no-underline transition-all active:scale-[0.98]"
    >
      <div className="flex gap-3 items-center">
        <div className="w-[88px] h-[88px] flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radarData} outerRadius="80%">
              <PolarGrid stroke="rgba(60,72,88,0.18)" />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <PolarAngleAxis dataKey="axis" tick={false} />
              <Radar
                dataKey="score"
                stroke="var(--primary-ink)"
                fill="var(--primary)"
                fillOpacity={0.4}
                strokeWidth={1.5}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold tracking-widest uppercase text-primary/70 mb-0.5">
            🕸️ Guna Chakra
          </p>
          <p className="text-[14px] font-bold text-text leading-tight mb-1">
            Your personality radar
          </p>
          <p className="text-[11px] text-text-muted leading-snug">
            Strongest trait: <span className="font-semibold text-text">{topLabel}</span> · {topScore}/100
          </p>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-text-muted flex-shrink-0">
          <path d="M9 18l6-6-6-6" />
        </svg>
      </div>
    </Link>
  );
}
