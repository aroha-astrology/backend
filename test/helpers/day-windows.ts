import { clock, toMin, type DayWindows, type MoonSample } from '../../src/lib/astro-tools/daily-hooks/windows';

// A Monday in Delhi-like numbers: sunrise 06:10, sunset 18:20.
export const SUNRISE = toMin('06:10');
export const SUNSET = toMin('18:20');
const HORA_ORDER = ['Moon', 'Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury'];
const DAY_CHOG = ['Amrit', 'Kaal', 'Shubh', 'Rog', 'Udveg', 'Char', 'Labh', 'Amrit'];
const NIGHT_CHOG = ['Char', 'Rog', 'Kaal', 'Labh', 'Udveg', 'Shubh', 'Amrit', 'Char'];
const TYPE: Record<string, 'good' | 'bad' | 'neutral'> = {
  Amrit: 'good', Shubh: 'good', Labh: 'good', Char: 'neutral', Udveg: 'bad', Kaal: 'bad', Rog: 'bad',
};

export function day(over: Partial<DayWindows> = {}, vara = 'Monday'): DayWindows {
  const hora = Array.from({ length: 24 }, (_, i) => {
    const a = SUNRISE + i * 60;
    return { planet: HORA_ORDER[i % 7]!, startTime: clock(a), endTime: clock(a + 60) };
  });
  const dayLen = SUNSET - SUNRISE;
  const nightLen = 1440 - dayLen;
  const chogDay = DAY_CHOG.map((name, i) => ({
    name, type: TYPE[name]!, startTime: clock(SUNRISE + (dayLen / 8) * i), endTime: clock(SUNRISE + (dayLen / 8) * (i + 1)),
  }));
  const chogNight = NIGHT_CHOG.map((name, i) => ({
    name, type: TYPE[name]!, startTime: clock(SUNSET + (nightLen / 8) * i), endTime: clock(SUNSET + (nightLen / 8) * (i + 1)),
  }));
  return {
    date: '2026-10-26',
    vara,
    sunrise: '06:10',
    sunset: '18:20',
    hora,
    choghadiya: { day: chogDay, night: chogNight },
    rahuKaal: { start: '07:30', end: '09:00' },
    gulikaKaal: { start: '13:30', end: '15:00' },
    yamagandaKaal: { start: '10:30', end: '12:00' },
    abhijit: { start: '11:40', end: '12:28' },
    tithiNumber: 8,
    ...over,
  };
}

export const MOON: MoonSample[] = [{ atMin: SUNRISE, signIndex: 4, nakshatraIndex: 9 }];

