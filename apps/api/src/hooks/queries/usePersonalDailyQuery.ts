import { useQuery } from '@tanstack/react-query';
import type { PersonalDailyReading } from '@/lib/horoscope/personalDailyGenerate';

export type { PersonalDailyReading };

function getISTDate() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
}

export function usePersonalDailyQuery(chartId: string | null, language = 'en') {
  const today = getISTDate();

  return useQuery<PersonalDailyReading | null>({
    queryKey: ['personalDaily', chartId, language, today],
    queryFn: async () => {
      const params = new URLSearchParams({ language });
      if (chartId) params.set('chartId', chartId);
      const r = await fetch(`/api/horoscope/personal-daily?${params}`);
      if (!r.ok) throw new Error('Failed to fetch personal daily reading');
      const json = await r.json() as { success: boolean; data?: PersonalDailyReading; gated?: boolean };
      if (json.gated) return null;
      return json.data ?? null;
    },
    enabled: !!chartId,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
}
