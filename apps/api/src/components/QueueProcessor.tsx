'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '@/store/useStore';
import { createClient } from '@/lib/supabase/client';

/**
 * Realtime listener for the user's generation_queue rows.
 *
 * The queue is drained server-side (apps/web/src/app/api/queue/drain) — the
 * browser no longer claims, runs, or polls jobs. This component only:
 *  - subscribes to UPDATE events on generation_queue scoped to this user, and
 *  - invalidates the right react-query keys when a job flips to 'done', so
 *    the UI refetches without needing a manual reload.
 *
 * Mounted once in the (app) layout. Renders nothing.
 */
export function QueueProcessor() {
  const userId = useStore((s) => s.user?.id);
  const dataReady = useStore((s) => s.dataReady);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!dataReady || !userId) return;

    // Kick the server drainer once on mount. If the user closed the tab during
    // a previous drain, this picks up the leftover pending jobs immediately
    // instead of waiting for an external cron (which we don't have on Hobby).
    // Fire-and-forget — failure is silent, the realtime listener below still
    // surfaces any subsequent UPDATE events.
    fetch('/api/queue/kick', { method: 'POST' }).catch(() => { /* non-fatal */ });

    const supabase = createClient();
    const channel = supabase
      .channel(`queue:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'generation_queue',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            status?: string;
            job_type?: string;
            payload?: Record<string, unknown>;
          };
          if (row.status !== 'done') return;

          const p = row.payload ?? {};
          const chartId = p.chart_id as string | undefined;
          const phaseIndex = p.phase_index as number | undefined;

          switch (row.job_type) {
            case 'life_journey_phase':
              if (chartId) {
                queryClient.invalidateQueries({ queryKey: ['life-journey', chartId] });
              }
              if (chartId && typeof phaseIndex === 'number') {
                queryClient.invalidateQueries({ queryKey: ['life-journey-phase', chartId, phaseIndex] });
                queryClient.invalidateQueries({ queryKey: ['life-areas', chartId, phaseIndex] });
              }
              break;

            case 'palm_reading':
              queryClient.invalidateQueries({ queryKey: ['palm-latest'] });
              queryClient.invalidateQueries({ queryKey: ['palm-list'] });
              break;
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [dataReady, userId, queryClient]);

  return null;
}
