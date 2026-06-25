import { useQuery } from '@tanstack/react-query';

export function useVideosQuery() {
  return useQuery({
    queryKey: ['videos'],
    queryFn: async () => {
      const r = await fetch('/api/video/history');
      if (!r.ok) return [];
      const json = await r.json();
      return json.data ?? [];
    },
  });
}

export function useReportsQuery() {
  return useQuery({
    queryKey: ['reports'],
    queryFn: async () => {
      const r = await fetch('/api/reports/my-reports');
      if (!r.ok) return [];
      const json = await r.json();
      return json.data ?? [];
    },
  });
}
