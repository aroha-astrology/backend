const PLANET_COLORS: Record<string, string> = {
  Sun: 'Gold',
  Moon: 'Silver',
  Mars: 'Red',
  Mercury: 'Green',
  Jupiter: 'Yellow',
  Venus: 'Pink',
  Saturn: 'Blue',
  Rahu: 'Charcoal',
  Ketu: 'Brown',
};

export function getDailyLuckyElements(
  chartData: any,
  dashaData: any,
  dateString: string,
): { luckyColor: string; luckyNumber: number } {
  const moon = (chartData?.planets ?? []).find((p: any) => p.planet === 'Moon');
  const moonNakshatra = moon?.nakshatraIndex ?? 0;
  const moonPada = moon?.nakshatraPada ?? 1;

  let activeLord = 'Sun';
  const now = new Date(dateString).getTime();
  const mahadashas = dashaData?.vimshottari?.mahadashas ?? [];
  const activeMaha = mahadashas.find(
    (m: any) => new Date(m.startDate).getTime() <= now && new Date(m.endDate).getTime() > now,
  );
  if (activeMaha) {
    activeLord = activeMaha.planet;
  }

  const baseColor = PLANET_COLORS[activeLord] ?? 'Gold';

  // Shade variation
  const shades = ['Light ', '', 'Dark ', 'Deep '];
  const shadePrefix = shades[(moonPada - 1) % 4] ?? '';

  const luckyColor = shadePrefix + baseColor;
  const luckyNumber = ((moonNakshatra * 4 + moonPada) % 9) + 1;

  return { luckyColor, luckyNumber };
}
