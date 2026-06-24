// =============================================================================
// Lal Kitab Karmic Debt (Rin) Detection
// =============================================================================
// Lal Kitab identifies 8 types of ancestral/karmic debts based on planetary
// afflictions. Each debt type has specific indicators and traditional remedies.

import type { ChartData, LalKitabDebt, Planet } from '@aroha-astrology/shared';
import { NATURAL_MALEFICS } from '@aroha-astrology/shared';

/**
 * Check whether a planet is afflicted: conjunct with or aspected by malefics,
 * or placed in an unfavorable house.
 */
function isPlanetAfflicted(
  planet: Planet,
  chartData: ChartData,
  housesToCheck: number[]
): boolean {
  const planetPos = chartData.planets.find(p => p.planet === planet);
  if (!planetPos) return false;

  // Check if the planet is in any of the specified houses
  const inTargetHouse = housesToCheck.includes(planetPos.house);
  if (!inTargetHouse) return false;

  // Check for conjunction with malefics in the same house
  const houseData = chartData.houses[planetPos.house - 1];
  const maleficsInHouse = houseData.planets.filter(
    p => p !== planet && NATURAL_MALEFICS.includes(p)
  );

  if (maleficsInHouse.length > 0) return true;

  // Check if planet is retrograde (weakened)
  if (planetPos.isRetrograde && planet !== 'Rahu' && planet !== 'Ketu') return true;

  // Check if malefics aspect the planet's house
  // In Vedic astrology: Mars aspects 4,7,8th; Saturn aspects 3,7,10th; Jupiter aspects 5,7,9th
  // Rahu/Ketu aspect 5,7,9th
  for (const mp of chartData.planets) {
    if (!NATURAL_MALEFICS.includes(mp.planet)) continue;
    if (mp.planet === planet) continue;
    const aspectHouses = getAspectHouses(mp.planet, mp.house);
    if (aspectHouses.includes(planetPos.house)) return true;
  }

  return false;
}

/**
 * Get houses aspected by a planet from a given house.
 */
function getAspectHouses(planet: Planet, fromHouse: number): number[] {
  const aspects: number[] = [];

  // All planets aspect the 7th house from their position
  aspects.push(((fromHouse - 1 + 6) % 12) + 1);

  switch (planet) {
    case 'Mars':
      aspects.push(((fromHouse - 1 + 3) % 12) + 1); // 4th
      aspects.push(((fromHouse - 1 + 7) % 12) + 1); // 8th
      break;
    case 'Jupiter':
      aspects.push(((fromHouse - 1 + 4) % 12) + 1); // 5th
      aspects.push(((fromHouse - 1 + 8) % 12) + 1); // 9th
      break;
    case 'Saturn':
      aspects.push(((fromHouse - 1 + 2) % 12) + 1); // 3rd
      aspects.push(((fromHouse - 1 + 9) % 12) + 1); // 10th
      break;
    case 'Rahu':
    case 'Ketu':
      aspects.push(((fromHouse - 1 + 4) % 12) + 1); // 5th
      aspects.push(((fromHouse - 1 + 8) % 12) + 1); // 9th
      break;
  }

  return aspects;
}

/**
 * Check if a planet is in specific houses (simple presence check).
 */
function isPlanetInHouses(planet: Planet, chartData: ChartData, houses: number[]): boolean {
  const pos = chartData.planets.find(p => p.planet === planet);
  return pos !== undefined && houses.includes(pos.house);
}

/**
 * Detect all 8 types of karmic debts (Rin) in a Lal Kitab chart.
 */
export function detectDebts(chartData: ChartData): LalKitabDebt[] {
  const debts: LalKitabDebt[] = [];

  // 1. Pitra Rin (Ancestral/Father's debt)
  // Sun afflicted in houses 2, 5, 9, or 10
  {
    const sunAfflicted = isPlanetAfflicted('Sun', chartData, [2, 5, 9, 10]);
    const sunPos = chartData.planets.find(p => p.planet === 'Sun');
    const indicators: string[] = [];
    if (sunAfflicted && sunPos) {
      indicators.push(`Sun is afflicted in house ${sunPos.house}`);
    }
    // Additional indicator: Rahu in 9th house
    if (isPlanetInHouses('Rahu', chartData, [9])) {
      indicators.push('Rahu is placed in the 9th house (house of father/ancestors)');
    }
    // Saturn aspecting or conjunct Sun
    const satPos = chartData.planets.find(p => p.planet === 'Saturn');
    if (sunPos && satPos && sunPos.house === satPos.house) {
      indicators.push('Saturn conjunct Sun indicates ancestral debt burden');
    }

    debts.push({
      type: 'Pitra Rin',
      present: indicators.length > 0,
      indicators,
      remedies: [
        'Offer water to the Sun every morning at sunrise',
        'Feed jaggery and wheat to cows on Sundays',
        'Keep a solid gold piece or square of copper in your pocket',
        'Perform Pitra Tarpan on Amavasya (new moon days)',
        'Donate red or saffron-colored items to the needy',
      ],
    });
  }

  // 2. Matri Rin (Mother's debt)
  // Moon afflicted in house 4
  {
    const moonAfflicted = isPlanetAfflicted('Moon', chartData, [4]);
    const moonPos = chartData.planets.find(p => p.planet === 'Moon');
    const indicators: string[] = [];
    if (moonAfflicted && moonPos) {
      indicators.push(`Moon is afflicted in house ${moonPos.house}`);
    }
    // Ketu in 4th house
    if (isPlanetInHouses('Ketu', chartData, [4])) {
      indicators.push('Ketu in the 4th house indicates separation from maternal happiness');
    }
    // Moon conjunct Rahu
    if (moonPos) {
      const rahuPos = chartData.planets.find(p => p.planet === 'Rahu');
      if (rahuPos && moonPos.house === rahuPos.house) {
        indicators.push('Moon conjunct Rahu (Grahan Yoga) indicates maternal debt');
      }
    }

    debts.push({
      type: 'Matri Rin',
      present: indicators.length > 0,
      indicators,
      remedies: [
        'Keep a silver square piece or silver ornament with you',
        'Offer milk or rice to a Shiva temple on Mondays',
        'Serve and respect your mother and elderly women',
        'Donate white items (milk, rice, silver) on Mondays',
        'Keep rainwater in a silver vessel at home',
      ],
    });
  }

  // 3. Stri Rin (Wife/Spouse debt)
  // Venus afflicted in houses 2, 7, or 11
  {
    const venusAfflicted = isPlanetAfflicted('Venus', chartData, [2, 7, 11]);
    const venusPos = chartData.planets.find(p => p.planet === 'Venus');
    const indicators: string[] = [];
    if (venusAfflicted && venusPos) {
      indicators.push(`Venus is afflicted in house ${venusPos.house}`);
    }
    // Rahu in 7th house
    if (isPlanetInHouses('Rahu', chartData, [7])) {
      indicators.push('Rahu in the 7th house indicates issues in marital relations from past life');
    }
    // Saturn in 7th
    if (isPlanetInHouses('Saturn', chartData, [7])) {
      indicators.push('Saturn in the 7th house indicates delayed or troubled marriage from past karma');
    }

    debts.push({
      type: 'Stri Rin',
      present: indicators.length > 0,
      indicators,
      remedies: [
        'Donate cow or items of comfort to married women',
        'Offer white sandalwood and camphor at a Lakshmi temple on Fridays',
        'Keep a diamond or opal if Venus is weak',
        'Treat your spouse with respect and generosity',
        'Donate sweets and white clothes on Fridays',
      ],
    });
  }

  // 4. Swa Rin (Self debt)
  // Jupiter afflicted in house 5
  {
    const jupAfflicted = isPlanetAfflicted('Jupiter', chartData, [5]);
    const jupPos = chartData.planets.find(p => p.planet === 'Jupiter');
    const indicators: string[] = [];
    if (jupAfflicted && jupPos) {
      indicators.push(`Jupiter is afflicted in house ${jupPos.house}`);
    }
    // Rahu/Ketu axis across 5-11
    if (isPlanetInHouses('Rahu', chartData, [5]) || isPlanetInHouses('Ketu', chartData, [5])) {
      indicators.push('Rahu/Ketu axis involves the 5th house of past merit and children');
    }

    debts.push({
      type: 'Swa Rin',
      present: indicators.length > 0,
      indicators,
      remedies: [
        'Apply saffron tilak on the forehead daily',
        'Donate turmeric, gold, or yellow items to temples on Thursdays',
        'Serve saints, teachers, and Brahmins',
        'Keep a solid piece of gold in your safe',
        'Recite Vishnu Sahasranama or Guru mantras regularly',
      ],
    });
  }

  // 5. Naani/Dadi Rin (Grandmother's debt - maternal/paternal)
  // Moon + Saturn afflicted or Moon/Saturn in 4th/8th houses
  {
    const indicators: string[] = [];
    const moonPos = chartData.planets.find(p => p.planet === 'Moon');
    const satPos = chartData.planets.find(p => p.planet === 'Saturn');

    if (moonPos && satPos && moonPos.house === satPos.house) {
      indicators.push(`Moon and Saturn are conjunct in house ${moonPos.house}, indicating grandmother's debt`);
    }
    if (isPlanetAfflicted('Moon', chartData, [8])) {
      indicators.push('Moon afflicted in the 8th house indicates maternal grandmother debt');
    }
    if (isPlanetAfflicted('Saturn', chartData, [4])) {
      indicators.push('Saturn afflicted in the 4th house indicates paternal grandmother debt');
    }

    debts.push({
      type: 'Naani/Dadi Rin',
      present: indicators.length > 0,
      indicators,
      remedies: [
        'Donate food and clothes to old women on Saturdays',
        'Offer milk mixed with water at a Peepal tree',
        'Keep an iron item (nail, ring) in your pocket',
        'Feed crows and stray dogs on Saturdays',
        'Perform Shraadh for grandmothers on their death anniversary',
      ],
    });
  }

  // 6. Behen/Bua Rin (Sister/Father's sister debt)
  // Mercury afflicted in houses 3, 6, or 11
  {
    const mercAfflicted = isPlanetAfflicted('Mercury', chartData, [3, 6, 11]);
    const mercPos = chartData.planets.find(p => p.planet === 'Mercury');
    const indicators: string[] = [];
    if (mercAfflicted && mercPos) {
      indicators.push(`Mercury is afflicted in house ${mercPos.house}, indicating sister/aunt debt`);
    }
    // Ketu in 3rd or 6th house
    if (isPlanetInHouses('Ketu', chartData, [3, 6])) {
      indicators.push('Ketu in 3rd/6th house creates imbalance in sibling karma');
    }

    debts.push({
      type: 'Behen/Bua Rin',
      present: indicators.length > 0,
      indicators,
      remedies: [
        'Help sisters and paternal aunts financially when possible',
        'Donate green items (vegetables, clothes) on Wednesdays',
        'Feed green grass to cows on Wednesdays',
        'Keep a bronze vessel filled with water at home',
        'Plant green plants and care for them',
      ],
    });
  }

  // 7. Kanya Rin (Daughter/unmarried girl debt)
  // Venus + Mercury afflicted, or Venus in 6th/8th/12th
  {
    const indicators: string[] = [];
    const venusPos = chartData.planets.find(p => p.planet === 'Venus');
    if (venusPos && [6, 8, 12].includes(venusPos.house)) {
      indicators.push(`Venus in house ${venusPos.house} (dusthana) indicates unmarried girl/daughter debt`);
    }
    const mercPos = chartData.planets.find(p => p.planet === 'Mercury');
    if (venusPos && mercPos && venusPos.house === mercPos.house) {
      const houseData = chartData.houses[venusPos.house - 1];
      const hasMalefic = houseData.planets.some(p => NATURAL_MALEFICS.includes(p));
      if (hasMalefic) {
        indicators.push(`Venus-Mercury conjunction afflicted by malefics in house ${venusPos.house}`);
      }
    }

    debts.push({
      type: 'Kanya Rin',
      present: indicators.length > 0,
      indicators,
      remedies: [
        'Help in the marriage of poor girls (Kanya Daan)',
        'Donate white and green items to young girls on Fridays',
        'Offer sweets and fruits at a Durga/Lakshmi temple',
        'Gift clothes and utensils to daughters/nieces',
        'Feed and educate underprivileged girls',
      ],
    });
  }

  // 8. Jeev Hatya Rin (Debt from harming living beings)
  // Mars afflicted in 1st, 4th, 7th, or 10th; or Rahu-Mars conjunction
  {
    const indicators: string[] = [];
    const marsAfflicted = isPlanetAfflicted('Mars', chartData, [1, 4, 7, 10]);
    const marsPos = chartData.planets.find(p => p.planet === 'Mars');
    if (marsAfflicted && marsPos) {
      indicators.push(`Mars is afflicted in kendra house ${marsPos.house}, indicating debt from harming living beings`);
    }
    const rahuPos = chartData.planets.find(p => p.planet === 'Rahu');
    if (marsPos && rahuPos && marsPos.house === rahuPos.house) {
      indicators.push(`Mars-Rahu conjunction in house ${marsPos.house} (Angarak Yoga) indicates violence-related past karma`);
    }

    debts.push({
      type: 'Jeev Hatya Rin',
      present: indicators.length > 0,
      indicators,
      remedies: [
        'Feed stray animals and birds daily',
        'Donate red lentils (masoor dal) on Tuesdays',
        'Keep a pet dog and care for it lovingly',
        'Avoid non-vegetarian food on Tuesdays and Saturdays',
        'Float red flowers or red items in flowing water on Tuesdays',
      ],
    });
  }

  return debts;
}
