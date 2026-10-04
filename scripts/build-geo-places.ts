/**
 * Builds data/geo/places.tsv, the offline place list behind
 * src/modules/mcp/place-resolver.ts.
 *
 * Source: GeoNames (https://www.geonames.org, CC BY 4.0). Download and unzip
 * into one folder, then pass that folder as the only argument:
 *   https://download.geonames.org/export/dump/cities5000.zip
 *   https://download.geonames.org/export/dump/cities1000.zip
 *   https://download.geonames.org/export/dump/admin1CodesASCII.txt
 *   https://download.geonames.org/export/dump/countryInfo.txt
 *
 *   npx tsx scripts/build-geo-places.ts <folder>
 *
 * Output keeps every place of 5,000+ people worldwide, plus Indian places of
 * 1,000+ (birth places in India are often small towns).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('usage: tsx scripts/build-geo-places.ts <geonames folder>');
  process.exit(1);
}

const TAB = String.fromCharCode(9);
const read = (name: string) => readFileSync(join(src, name), 'utf8').split('\n');

const admin1 = new Map<string, string>();
for (const line of read('admin1CodesASCII.txt')) {
  const [code, , ascii] = line.split(TAB);
  if (code && ascii) admin1.set(code, ascii);
}

const countries = new Map<string, string>();
for (const line of read('countryInfo.txt')) {
  if (!line || line.startsWith('#')) continue;
  const cols = line.split(TAB);
  if (cols[0] && cols[4]) countries.set(cols[0], cols[4]);
}

/** Alternate names are only kept for big cities, and only plain Latin ones (Bombay, Calcutta). */
const ALT_MIN_POPULATION = 100_000;
const MAX_ALTS = 24;
const LATIN_NAME = /^[A-Za-z][A-Za-z .'-]{2,}$/;

const seen = new Set<string>();
const rows: string[] = [];

function take(file: string, keep: (countryCode: string) => boolean) {
  for (const line of read(file)) {
    const c = line.split(TAB);
    if (c.length < 18) continue;
    const id = c[0]!;
    const countryCode = c[8]!;
    if (seen.has(id) || !keep(countryCode)) continue;
    const tz = c[17]!;
    if (!tz) continue;
    seen.add(id);

    const name = c[1]!;
    const ascii = c[2]!;
    const population = Number(c[14]) || 0;
    const alts =
      population >= ALT_MIN_POPULATION
        ? [...new Set(c[3]!.split(',').filter((a) => LATIN_NAME.test(a)))]
            .filter((a) => a !== name && a !== ascii)
            .slice(0, MAX_ALTS)
        : [];

    rows.push(
      [
        name,
        ascii,
        alts.join('|'),
        admin1.get(`${countryCode}.${c[10]}`) ?? '',
        c[10] ?? '',
        countryCode,
        countries.get(countryCode) ?? countryCode,
        Number(c[4]).toFixed(4),
        Number(c[5]).toFixed(4),
        tz,
        String(population),
      ].join(TAB),
    );
  }
}

take('cities5000.txt', () => true);
take('cities1000.txt', (countryCode) => countryCode === 'IN');

mkdirSync('data/geo', { recursive: true });
writeFileSync('data/geo/places.tsv', rows.join('\n') + '\n');
console.log(`wrote ${rows.length} places to data/geo/places.tsv`);
