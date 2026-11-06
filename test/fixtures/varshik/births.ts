// The test births for the Varshik 2027 engine. Made-up people, not real ones. These are INPUTS
// only: they carry no JHora output. See README.md in this folder for how JHora numbers are added.
import { calculateChart } from '../../../src/lib/astro-engine/calculations/planetPositions.js';
import { zoneOffsetMs } from '../../../src/lib/astro-engine/varshphal/calendar-year.js';
import type { CalendarYearInputs } from '../../../src/lib/astro-engine/varshphal/calendar-year.js';

export interface TestBirth {
  id: string;
  /** Local wall-clock birth, 24h. */
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  place: string;
  latitude: number;
  longitude: number;
  timezone: string; // IANA
  /** Why this birth is in the set. */
  covers: string;
}

export const TEST_BIRTHS: TestBirth[] = [
  { id: 'b01', date: '1990-01-12', time: '06:15', place: 'New Delhi', latitude: 28.61, longitude: 77.21, timezone: 'Asia/Kolkata', covers: 'early winter morning near sunrise; January birthday' },
  { id: 'b02', date: '1985-12-29', time: '21:40', place: 'Mumbai', latitude: 19.08, longitude: 72.88, timezone: 'Asia/Kolkata', covers: 'late December night; the Varsha year straddles New Year' },
  { id: 'b03', date: '1995-03-15', time: '13:05', place: 'Kolkata', latitude: 22.57, longitude: 88.36, timezone: 'Asia/Kolkata', covers: 'midday, far east of the IST meridian' },
  { id: 'b04', date: '1988-06-22', time: '04:30', place: 'Chennai', latitude: 13.08, longitude: 80.27, timezone: 'Asia/Kolkata', covers: 'before sunrise on the solstice' },
  { id: 'b05', date: '1979-08-08', time: '18:50', place: 'Bengaluru', latitude: 12.97, longitude: 77.59, timezone: 'Asia/Kolkata', covers: 'around sunset' },
  { id: 'b06', date: '2000-09-30', time: '11:20', place: 'Jaipur', latitude: 26.91, longitude: 75.79, timezone: 'Asia/Kolkata', covers: 'born in 2000' },
  { id: 'b07', date: '1992-11-11', time: '23:55', place: 'Lucknow', latitude: 26.85, longitude: 80.95, timezone: 'Asia/Kolkata', covers: '5 minutes before civil midnight' },
  { id: 'b08', date: '1970-05-05', time: '09:45', place: 'Pune', latitude: 18.52, longitude: 73.86, timezone: 'Asia/Kolkata', covers: 'an old date, western India' },
  { id: 'b09', date: '1983-07-17', time: '02:10', place: 'London', latitude: 51.51, longitude: -0.13, timezone: 'Europe/London', covers: 'British Summer Time, high latitude, before sunrise' },
  { id: 'b10', date: '1998-02-24', time: '16:30', place: 'Hyderabad', latitude: 17.39, longitude: 78.49, timezone: 'Asia/Kolkata', covers: 'late afternoon, end of February' },
  { id: 'b11', date: '1996-02-29', time: '12:00', place: 'New Delhi', latitude: 28.61, longitude: 77.21, timezone: 'Asia/Kolkata', covers: 'leap day: no 29 Feb in 2026 or 2027' },
  { id: 'b12', date: '1991-10-15', time: '20:30', place: 'New York', latitude: 40.71, longitude: -74.01, timezone: 'America/New_York', covers: 'western hemisphere, daylight saving, UT date is the next day' },
];

/** The engine inputs for a birth: natal Sun, nakshatra, Lagna, the birth instant and the place. */
export async function inputsFor(b: TestBirth): Promise<CalendarYearInputs & { birthUtcMs: number }> {
  const [y, mo, d] = b.date.split('-').map(Number) as [number, number, number];
  const [h, mi] = b.time.split(':').map(Number) as [number, number];
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let utc = wall - zoneOffsetMs(wall, b.timezone);
  utc = wall - zoneOffsetMs(utc, b.timezone);
  const offsetHours = (wall - utc) / 3_600_000;

  const natal = await calculateChart(y, mo, d, h, mi, offsetHours, b.latitude, b.longitude, 'lahiri', 'W');
  const sun = natal.planets.find((p) => p.planet === 'Sun')!;
  const moon = natal.planets.find((p) => p.planet === 'Moon')!;
  return {
    natalSunLongitude: sun.longitude,
    natalAscSignIndex: natal.ascendant.signIndex,
    birthDate: new Date(utc),
    birthNakshatraIndex: moon.nakshatraIndex,
    latitude: b.latitude,
    longitude: b.longitude,
    timezone: b.timezone,
    birthUtcMs: utc,
  };
}
