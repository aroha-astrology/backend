'use client';

import { useEffect, useMemo } from 'react';
import { useStore } from '@/store/useStore';

export function useActiveChart() {
  const charts = useStore((s) => s.charts);
  const profiles = useStore((s) => s.profiles);
  const dataReady = useStore((s) => s.dataReady);
  const activeChartId = useStore((s) => s.activeChartId);
  const setActiveChartId = useStore((s) => s.setActiveChartId);

  useEffect(() => {
    if (!dataReady) return;
    if (charts.length === 0) {
      if (activeChartId !== null) setActiveChartId(null);
      return;
    }
    const stillExists = activeChartId && charts.some((c) => c.id === activeChartId);
    if (!stillExists) setActiveChartId(charts[0].id);
  }, [dataReady, charts, activeChartId, setActiveChartId]);

  const activeChart = useMemo(
    () => charts.find((c) => c.id === activeChartId) ?? charts[0] ?? null,
    [charts, activeChartId],
  );

  const activeProfile = useMemo(
    () => (activeChart ? profiles.find((p) => p.id === activeChart.profile_id) ?? null : null),
    [profiles, activeChart],
  );

  return {
    activeChartId: activeChart?.id ?? null,
    activeChart,
    activeProfile,
    setActiveChartId,
    charts,
    profiles,
    dataReady,
  };
}
