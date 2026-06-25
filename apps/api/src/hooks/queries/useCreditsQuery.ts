import { useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export function useCreditsQuery() {
  return useQuery({
    queryKey: queryKeys.credits,
    queryFn: async () => {
      const r = await fetch('/api/credits/balance');
      if (!r.ok) throw new Error('Failed to fetch credits');
      const json = await r.json();
      return (json.data?.credits ?? 0) as number;
    },
    staleTime: 60 * 1000,
  });
}

export function useInvalidateCredits() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: queryKeys.credits });
}
