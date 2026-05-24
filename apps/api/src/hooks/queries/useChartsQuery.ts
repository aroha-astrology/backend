import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { KundliChartRow } from '@aroha-astrology/shared';

export function useChartsQuery() {
  return useQuery({
    queryKey: queryKeys.charts,
    queryFn: async () => {
      const r = await fetch('/api/kundli');
      if (!r.ok) throw new Error('Failed to fetch charts');
      const json = await r.json();
      return (json.data ?? []) as KundliChartRow[];
    },
  });
}

export function useInvalidateCharts() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.charts });
}
