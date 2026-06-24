'use client';

import { useEffect, useRef, useState } from 'react';

export type ChartReportStatus = 'idle' | 'none' | 'pending' | 'generating' | 'ready' | 'error';

export type ChartReportState = {
  status: ChartReportStatus;
  reportId: string | null;
  progress: string | null;
  downloadUrl: string | null;
};

const POLL_INTERVAL_MS = 3000;
const STALE_PENDING_MS = 10 * 60 * 1000;

export function useChartReport(chartId: string | null | undefined): ChartReportState {
  const [state, setState] = useState<ChartReportState>({
    status: 'idle',
    reportId: null,
    progress: null,
    downloadUrl: null,
  });

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentChartIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;

    if (!chartId) {
      setState({ status: 'idle', reportId: null, progress: null, downloadUrl: null });
      currentChartIdRef.current = null;
      return;
    }

    currentChartIdRef.current = chartId;
    setState({ status: 'idle', reportId: null, progress: null, downloadUrl: null });

    const ctrl = new AbortController();

    const startPoll = (reportId: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        if (currentChartIdRef.current !== chartId) {
          clearInterval(pollRef.current!);
          return;
        }
        try {
          const res = await fetch(`/api/reports/status/${reportId}`, { signal: ctrl.signal });
          if (!res.ok) return;
          const d = await res.json() as { data?: { status: string; progress?: string; download_url?: string } };
          if (currentChartIdRef.current !== chartId) return;
          const s = d.data?.status;
          if (s === 'ready') {
            clearInterval(pollRef.current!);
            setState({ status: 'ready', reportId, progress: null, downloadUrl: d.data?.download_url ?? null });
          } else if (s === 'error') {
            clearInterval(pollRef.current!);
            setState({ status: 'error', reportId, progress: null, downloadUrl: null });
          } else {
            setState((prev) => ({
              ...prev,
              status: (s as ChartReportStatus) ?? 'pending',
              reportId,
              progress: d.data?.progress ?? null,
            }));
          }
        } catch {
          // AbortError or network — keep polling
        }
      }, POLL_INTERVAL_MS);
    };

    // Check if a report already exists for this chart
    fetch(`/api/reports/check?chartId=${encodeURIComponent(chartId)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data: { status: string; reportId?: string; downloadUrl?: string }) => {
        if (currentChartIdRef.current !== chartId) return;
        if (data.status === 'ready') {
          setState({ status: 'ready', reportId: data.reportId ?? null, progress: null, downloadUrl: data.downloadUrl ?? null });
        } else if (data.status === 'none') {
          setState({ status: 'none', reportId: null, progress: null, downloadUrl: null });
        } else if (data.reportId) {
          // pending or generating — check if it's stale (i.e., no created_at guard in check API,
          // so we trust the API's 15-min cutoff and start polling)
          setState({ status: (data.status as ChartReportStatus), reportId: data.reportId, progress: null, downloadUrl: null });
          startPoll(data.reportId);
        } else {
          setState({ status: 'none', reportId: null, progress: null, downloadUrl: null });
        }
      })
      .catch(() => {
        if (currentChartIdRef.current !== chartId) return;
        setState({ status: 'none', reportId: null, progress: null, downloadUrl: null });
      });

    return () => {
      ctrl.abort();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartId]);

  // Stale pending guard — if still pending/generating after STALE_PENDING_MS, surface as error
  useEffect(() => {
    if (state.status !== 'pending' && state.status !== 'generating') return;
    const timer = setTimeout(() => {
      setState((prev) =>
        prev.status === 'pending' || prev.status === 'generating'
          ? { ...prev, status: 'error' }
          : prev,
      );
    }, STALE_PENDING_MS);
    return () => clearTimeout(timer);
  }, [state.status]);

  return state;
}
