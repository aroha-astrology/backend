function getISTDate() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().split('T')[0];
}

export const queryKeys = {
  profiles: ['profiles'] as const,
  charts: ['charts'] as const,
  credits: ['credits'] as const,
  userSettings: ['user', 'settings'] as const,
  panchang: (date: string) => ['panchang', date] as const,
  panchangToday: () => queryKeys.panchang(getISTDate()),
  panchangMonth: (year: number, month: number) => ['panchang', 'month', year, month] as const,
  horoscope: (date: string) => ['horoscope', 'daily', date] as const,
  horoscopeToday: () => queryKeys.horoscope(getISTDate()),
  reports: ['reports'] as const,
  videos: ['videos'] as const,
};
