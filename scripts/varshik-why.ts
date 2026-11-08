// Which inputs drive a month: mean log-odds contribution by driver, averaged over the 7 areas.
//   tsx scripts/varshik-why.ts <personaIndex 0-2> <month numbers, e.g. 7 8 9>
import { calculateChart } from '../src/lib/astro-engine/calculations/planetPositions.js';
import { zoneOffsetMs } from '../src/lib/astro-engine/varshphal/calendar-year.js';
import { buildVarshikContext } from '../src/lib/astro-engine/reports/varshik-context.js';
import { computeVarshikScores } from '../src/lib/astro-engine/reports/varshik-2027.js';
import { AREAS } from '../src/config/varshik-weights.js';

const P = [
  { date: '2004-08-19', time: '07:40', lat: 18.52, lng: 73.86, tz: 'Asia/Kolkata', a: { relationship: 'single', occupation: 'student', children: 'none', mainDecision: 'study' } },
  { date: '1988-03-14', time: '22:10', lat: 12.97, lng: 77.59, tz: 'Asia/Kolkata', a: { relationship: 'married', occupation: 'working', children: 'have', mainDecision: 'job_change' } },
  { date: '1962-11-02', time: '05:15', lat: 26.85, lng: 80.95, tz: 'Asia/Kolkata', a: { relationship: 'married', occupation: 'retired', children: 'have', mainDecision: 'move_or_travel' } },
][Number(process.argv[2] ?? 1)]!;
const months = process.argv.slice(3).map(Number);
const [y, mo, d] = P.date.split('-').map(Number) as [number, number, number];
const [h, mi] = P.time.split(':').map(Number) as [number, number];
const wall = Date.UTC(y, mo - 1, d, h, mi);
let utc = wall - zoneOffsetMs(wall, P.tz);
utc = wall - zoneOffsetMs(utc, P.tz);
const natal = await calculateChart(y, mo, d, h, mi, (wall - utc) / 3_600_000, P.lat, P.lng, 'lahiri', 'W');
const sun = natal.planets.find((p) => p.planet === 'Sun')!;
const moon = natal.planets.find((p) => p.planet === 'Moon')!;
const ctx = await buildVarshikContext({ natal, year: 2027, inputs: { natalSunLongitude: sun.longitude, natalAscSignIndex: natal.ascendant.signIndex, birthDate: new Date(utc), birthNakshatraIndex: moon.nakshatraIndex, latitude: P.lat, longitude: P.lng, timezone: P.tz } });
const s = computeVarshikScores(ctx, P.a);
const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
for (const m of months) {
  const acc: Record<string, number> = {};
  for (const a of AREAS) for (const [k, v] of Object.entries(s.series.drivers[a][m - 1]!)) acc[k] = (acc[k] ?? 0) + v / AREAS.length;
  const rows = Object.entries(acc).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const total = rows.reduce((t, r) => t + r[1], 0);
  console.log(`\n${names[m - 1]}  score ${s.months[m - 1]!.score}  (base ${0.3}, sum of drivers ${total.toFixed(2)})`);
  for (const [k, v] of rows.slice(0, 9)) console.log(`  ${k.padEnd(22)} ${v >= 0 ? '+' : ''}${v.toFixed(2)}`);
  // by family
  const fam: Record<string, number> = {};
  for (const [k, v] of rows) fam[k.split(':')[0]!] = (fam[k.split(':')[0]!] ?? 0) + v;
  console.log('  by family:', Object.entries(fam).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 7).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', '));
}
process.exit(0);
