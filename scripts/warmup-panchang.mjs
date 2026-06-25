/**
 * One-shot panchang bulk warmup script.
 * Runs directly against production Supabase — no HTTP, no auth.
 *
 * Usage:
 *   node scripts/warmup-panchang.mjs
 *
 * Processes: today - 180 days → today + 730 days (910 total)
 * Location:  India geographic centre (20.59°N 78.96°E)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));

// Load env from apps/web/.env.local
const envPath = join(__dir, '../apps/web/.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, '')];
    })
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const LAT = 20.5937;
const LNG = 78.9629;
const DAYS_BACK   = 180;
const DAYS_AHEAD  = 730;

const VARA_NAMES = [
  'Ravivaar (Sunday)','Somvaar (Monday)','Mangalvaar (Tuesday)',
  'Budhvaar (Wednesday)','Guruvaar (Thursday)','Shukravaar (Friday)','Shanivaar (Saturday)',
];

function to12Hour(time) {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${h12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function buildChoghadiya(sunriseTime, sunsetTime, dayOfWeek) {
  const parseMin = t => { const [h, m] = t.split(':').map(Number); return h*60+m; };
  const sr = parseMin(sunriseTime), ss = parseMin(sunsetTime);
  const slotD = (ss - sr) / 8, slotN = (24*60 - (ss-sr)) / 8;
  const fmt = totalMin => {
    let m = Math.round(totalMin);
    if (m < 0) m += 24*60; if (m >= 24*60) m -= 24*60;
    const h = Math.floor(m/60), min = m%60;
    const ampm = h>=12?'PM':'AM', h12 = h>12?h-12:h===0?12:h;
    return `${h12}:${String(min).padStart(2,'0')} ${ampm}`;
  };
  const names = ['Udveg','Char','Labh','Amrit','Kaal','Shubh','Rog','Udveg'];
  const types = ['bad','neutral','good','good','bad','good','bad','bad'];
  const off = dayOfWeek * 2;
  return {
    day:   Array.from({length:8},(_,i)=>({ name:names[(i+off)%8],   start:fmt(sr+i*slotD),   end:fmt(sr+(i+1)*slotD),   type:types[(i+off)%8]   })),
    night: Array.from({length:8},(_,i)=>({ name:names[(i+off+4)%8], start:fmt(ss+i*slotN),   end:fmt(ss+(i+1)*slotN),   type:types[(i+off+4)%8] })),
  };
}

function buildHora(dayOfWeek) {
  const order = ['Sun','Venus','Mercury','Moon','Saturn','Jupiter','Mars'];
  const start = [0,1,6,2,5,3,4][dayOfWeek];
  return Array.from({length:24},(_,i)=>({ planet:order[(start+i)%7], start:`${String(i).padStart(2,'0')}:00`, end:`${String((i+1)%24).padStart(2,'0')}:00`, isCurrent:false }));
}

// Lazy-load astro engine once
let astroEngine = null;
async function getAstro() {
  if (!astroEngine) astroEngine = await import('@aroha-astrology/astro-engine');
  return astroEngine;
}

async function processDate(date) {
  const dateKey = date.toISOString().split('T')[0];
  const locationKey = `${LAT.toFixed(2)},${LNG.toFixed(2)}`;

  // Check Supabase cache first
  const { data: cached } = await supabase
    .from('panchang_cache')
    .select('date')
    .eq('date', dateKey)
    .eq('location', locationKey)
    .maybeSingle();
  if (cached) return 'hit';

  try {
    const { calculateChart, calculateFullPanchang } = await getAstro();
    const yr = date.getFullYear(), mo = date.getMonth()+1, dy = date.getDate(), dow = date.getDay();
    const chart = await calculateChart(yr, mo, dy, 6, 0, 5.5, LAT, LNG, 'lahiri', 'W');
    const sun  = chart.planets.find(p => p.planet === 'Sun');
    const moon = chart.planets.find(p => p.planet === 'Moon');
    if (!sun || !moon) return 'error';

    const p = calculateFullPanchang(date, LAT, LNG, sun.longitude, moon.longitude);
    const result = {
      date: dateKey,
      tithi: `${p.tithi.paksha} ${p.tithi.name} (${p.tithi.number})`,
      nakshatra: `${p.nakshatra.name} Pada ${p.nakshatra.pada} (${p.nakshatra.lord})`,
      yoga: `${p.yoga.name}${p.yoga.isAuspicious ? ' ✓' : ''}`,
      karana: p.karana.name,
      vara: VARA_NAMES[dow],
      rahuKaal:     { start: to12Hour(p.rahuKaal.start),     end: to12Hour(p.rahuKaal.end) },
      gulikaKaal:   { start: to12Hour(p.gulikaKaal.start),   end: to12Hour(p.gulikaKaal.end) },
      yamagandaKaal:{ start: to12Hour(p.yamagandaKaal.start),end: to12Hour(p.yamagandaKaal.end) },
      abhijitMuhurta:{ start: to12Hour(p.abhijitMuhurta.start), end: to12Hour(p.abhijitMuhurta.end) },
      choghadiya: buildChoghadiya(p.sunriseTime, p.sunsetTime, dow),
      hora: buildHora(dow),
      sunrise: to12Hour(p.sunriseTime),
      sunset:  to12Hour(p.sunsetTime),
      ayanamsa: 'Lahiri',
      ayanamsaValue: parseFloat(chart.ayanamsaValue?.toFixed(4) ?? '0'),
      regionalMonths: p.regionalMonths,
    };

    const { error } = await supabase.from('panchang_cache').upsert(
      { date: dateKey, location: locationKey, data: result },
      { onConflict: 'date,location' },
    );
    if (error) { console.error(`  DB error for ${dateKey}:`, error.message); return 'error'; }
    return 'generated';
  } catch (err) {
    console.error(`  Calc error for ${dateKey}:`, err.message);
    return 'error';
  }
}

async function main() {
  const today = new Date(); today.setHours(0,0,0,0);
  const dates = [];
  for (let d = -DAYS_BACK; d <= DAYS_AHEAD; d++) {
    const dt = new Date(today); dt.setDate(today.getDate() + d);
    dates.push(dt);
  }

  console.log(`Warming ${dates.length} dates (${dates[0].toISOString().split('T')[0]} → ${dates.at(-1).toISOString().split('T')[0]})`);
  console.log(`Location: India default (${LAT}, ${LNG})\n`);

  let hit=0, generated=0, error=0;
  const start = Date.now();

  for (let i=0; i<dates.length; i++) {
    const result = await processDate(dates[i]);
    if (result==='hit') hit++; else if (result==='generated') generated++; else error++;

    if ((i+1) % 30 === 0 || i===dates.length-1) {
      const pct = Math.round((i+1)/dates.length*100);
      const elapsed = ((Date.now()-start)/1000).toFixed(0);
      console.log(`[${String(i+1).padStart(3)}/${dates.length}] ${pct}% — hit:${hit} generated:${generated} error:${error} (${elapsed}s)`);
    }
  }

  console.log(`\nDone. Total: hit=${hit} generated=${generated} error=${error}`);
  console.log(`Time: ${((Date.now()-start)/1000/60).toFixed(1)} minutes`);
}

main().catch(err => { console.error(err); process.exit(1); });
