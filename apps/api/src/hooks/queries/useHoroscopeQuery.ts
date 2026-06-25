import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export type HoroscopePrediction = {
  headline?: string;
  summary?: [string, string, string];
  positive_points?: string[];
  issues?: string[];
  general: string;
  career: string;
  love: string;
  health: string;
  luckyColor?: string;
  luckyNumber?: number;
  luckyDirection?: string;
  remedy?: string;
  remedy_mantra?: string;
  rating?: number;
};

function getISTDate() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
}

export type HoroscopeQueryResult = {
  data: Record<string, HoroscopePrediction>;
  /** True when today's content is still being generated server-side. UI should keep showing the skeleton. */
  pending: boolean;
};

export function useHoroscopeQuery(date?: string) {
  const resolvedDate = date ?? getISTDate();
  const isToday = resolvedDate === getISTDate();

  return useQuery<HoroscopeQueryResult>({
    queryKey: queryKeys.horoscope(resolvedDate),
    queryFn: async () => {
      const url = date ? `/api/horoscope/daily?date=${date}` : '/api/horoscope/daily';
      const r = await fetch(url);
      if (!r.ok && r.status !== 202) throw new Error('Failed to fetch horoscope');
      const json = await r.json();
      const pending = Boolean(json.pending);
      return {
        data: (json.data ?? {}) as Record<string, HoroscopePrediction>,
        pending,
      };
    },
    staleTime: isToday ? 12 * 60 * 60 * 1000 : 5 * 60 * 1000,
    gcTime: isToday ? 24 * 60 * 60 * 1000 : 10 * 60 * 1000,
    // While the server is still generating today's content, poll every 30s so the dashboard
    // auto-swaps from skeleton to real data the moment generation completes.
    refetchInterval: (query) => (query.state.data?.pending ? 30_000 : false),
  });
}

export function useMonthlyHoroscopeQuery(year: number, month: number, enabled = true) {
  return useQuery({
    queryKey: ['horoscope', 'monthly', year, month],
    queryFn: async () => {
      const r = await fetch(`/api/horoscope/monthly?year=${year}&month=${month}`);
      if (!r.ok) throw new Error('Monthly horoscope not yet available');
      const json = await r.json();
      return (json.data ?? {}) as Record<string, unknown>;
    },
    staleTime: 60 * 60 * 1000,
    enabled,
  });
}
