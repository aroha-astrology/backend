import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserRow, BirthProfileRow, KundliChartRow } from '@aroha-astrology/shared';

interface AppState {
  // User
  user: UserRow | null;
  setUser: (user: UserRow | null) => void;
  avatarUrl: string | null;
  setAvatarUrl: (url: string | null) => void;

  // Birth profiles
  profiles: BirthProfileRow[];
  setProfiles: (profiles: BirthProfileRow[]) => void;
  addProfile: (profile: BirthProfileRow) => void;

  // Charts
  charts: KundliChartRow[];
  setCharts: (charts: KundliChartRow[]) => void;
  addChart: (chart: KundliChartRow) => void;

  // Active chart — the user's currently-selected birth chart, persisted across pages and reloads.
  // Resolved against `charts[]` by useActiveChart() which falls back to charts[0] when null/stale.
  activeChartId: string | null;
  setActiveChartId: (id: string | null) => void;

  // Data ready — true once AuthProvider finishes loading profiles+charts
  dataReady: boolean;
  setDataReady: (ready: boolean) => void;

  // Theme
  theme: 'dark' | 'light' | 'premium' | 'vedic';
  setTheme: (theme: 'dark' | 'light' | 'premium' | 'vedic') => void;

  // Language
  language: string;
  setLanguage: (lang: string) => void;

  // Chart style
  chartStyle: 'north' | 'south';
  setChartStyle: (style: 'north' | 'south') => void;

  // Animation preference — when true, skip motion/animation effects globally
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;

  // Loading states
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;

  // Credits
  credits: number;
  setCredits: (credits: number) => void;
  deductCredits: (amount: number) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) =>
        set((state) => ({
          user,
          credits:
            user === null
              ? 0
              : typeof user.credits === 'number'
                ? user.credits
                : state.credits,
        })),
      avatarUrl: null,
      setAvatarUrl: (avatarUrl) => set({ avatarUrl }),

      profiles: [],
      setProfiles: (profiles) => set({ profiles }),
      addProfile: (profile) => set((state) => ({ profiles: [...state.profiles, profile] })),

      charts: [],
      setCharts: (charts) => set({ charts }),
      addChart: (chart) => set((state) => ({ charts: [...state.charts, chart] })),

      activeChartId: null,
      setActiveChartId: (activeChartId) => set({ activeChartId }),

      dataReady: false,
      setDataReady: (dataReady) => set({ dataReady }),

      theme: 'vedic',
      setTheme: (theme) => set({ theme }),

      language: 'en',
      setLanguage: (language) => set({ language }),

      chartStyle: 'north',
      setChartStyle: (chartStyle) => set({ chartStyle }),

      reduceMotion: false,
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),

      isLoading: false,
      setIsLoading: (isLoading) => set({ isLoading }),

      credits: 0,
      setCredits: (credits) => set({ credits }),
      deductCredits: (amount) => set((state) => ({ credits: Math.max(0, state.credits - amount) })),
    }),
    {
      name: 'jyotish-ai-storage',
      partialize: (state) => ({
        theme: state.theme,
        language: state.language,
        chartStyle: state.chartStyle,
        reduceMotion: state.reduceMotion,
        activeChartId: state.activeChartId,
      }),
    },
  ),
);
