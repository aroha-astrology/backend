import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';

export function useUserSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.userSettings,
    queryFn: async () => {
      const r = await fetch('/api/user/settings');
      if (!r.ok) throw new Error('Failed to fetch user settings');
      const json = await r.json();
      return json.success ? json.data : null;
    },
  });
}

export function useUpdateSettingsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Record<string, unknown>) => {
      const r = await fetch('/api/user/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!r.ok) throw new Error('Failed to save settings');
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.userSettings });
    },
  });
}
