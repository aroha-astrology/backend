import {
  calculateChart,
  dateToJulianDay,
  calculatePlanetPositions,
} from '../src/lib/astro-engine/calculations/planetPositions.js';

const c = await calculateChart(1990, 5, 20, 6, 30, 5.5, 19.076, 72.8777, 'lahiri', 'W');
console.log('ayanamsa', c.ayanamsaValue.toFixed(6));
console.log(
  'asc',
  c.ascendant.sign,
  c.ascendant.degree.toFixed(4),
  c.ascendant.nakshatra,
  c.ascendant.nakshatraPada,
);
for (const p of c.planets) {
  console.log(
    p.planet,
    p.longitude.toFixed(6),
    p.sign,
    p.house,
    p.nakshatra,
    p.nakshatraPada,
    p.isRetrograde,
  );
}

// Independently checkable reference points.
const jd2000 = await dateToJulianDay(2000, 1, 1, 12, 0, 0);
const p2000 = await calculatePlanetPositions(jd2000, 'lahiri');
console.log('--- 2000-01-01 12:00 UT (lahiri) ---');
console.log('sun', p2000.find((p) => p.planet === 'Sun')!.longitude.toFixed(4));

// Mesha Sankranti: Sun crosses sidereal 0 Aries ~14 April.
for (const day of [13, 14, 15]) {
  const jd = await dateToJulianDay(2024, 4, day, 12, 0, 0);
  const pp = await calculatePlanetPositions(jd, 'lahiri');
  console.log(`2024-04-${day} sun`, pp.find((p) => p.planet === 'Sun')!.longitude.toFixed(4));
}
