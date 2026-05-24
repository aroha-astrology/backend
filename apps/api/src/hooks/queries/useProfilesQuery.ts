import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import type { BirthProfileRow } from '@aroha-astrology/shared';

export function useProfilesQuery() {
  return useQuery({
    queryKey: queryKeys.profiles,
    queryFn: async () => {
      const r = await fetch('/api/profiles');
      if (!r.ok) throw new Error('Failed to fetch profiles');
      const json = await r.json();
      return (json.data ?? []) as BirthProfileRow[];
    },
  });
}

export function useDeleteProfileMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profileId: string) => {
      const r = await fetch(`/api/profiles/${profileId}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed to delete profile');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.profiles });
      qc.invalidateQueries({ queryKey: queryKeys.charts });
    },
  });
}
