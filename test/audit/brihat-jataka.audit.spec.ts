import { describe, it, expect } from 'vitest';
import type { ChartData, Planet } from '@aroha-astrology/shared';
import {
  PLANET_DEBILITATION,
  PLANET_ENEMIES,
  PLANET_EXALTATION,
  PLANET_FRIENDS,
  SIGN_LORDS,
  ZODIAC_SIGNS,
} from '@aroha-astrology/shared';
import { aspectedOrdinals } from '../../src/lib/astro-engine/rules/houses.js';
import { BENEFIC_POINTS } from '../../src/lib/astro-engine/calculations/ashtakavarga.js';
import { calculateD30 } from '../../src/lib/astro-engine/charts/divisionalCharts.js';
import { detectAllYogas } from '../../src/lib/astro-engine/yogas/index.js';

// =============================================================================
// Rules read from the Bṛhat Jātaka of Varāhamihira (6th century)
// =============================================================================
// Source register ids BJ-* in docs/engine-audit/D-source-register.md. Each
// expectation below was written from the verse (GRETIL e-text of the Sanskrit,
// cross-read with N. Chidambaram Iyer's 1885 translation), never from the
// engine's output.
// =============================================================================

const SEVEN: Planet[] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

describe('[BJ 1.13] exaltation signs and degrees', () => {
  // aja-vṛṣabha-mṛga-aṅganā-kulīrā jhaṣa-vaṇijā ca divākarādi-tuṅgāḥ /
  // daśa-śikhi-manuyuk-tithi-indriya-aṃśais tri-navaka-viṃśatibhiś ca te asta-nīcāḥ
  // Sun onward: Aries 10, Taurus 3, Capricorn 28, Virgo 15, Cancer 5,
  // Pisces 27, Libra 20; debilitation in the seventh sign from each.
  const verse: Array<[Planet, string, number]> = [
    ['Sun', 'Aries', 10],
    ['Moon', 'Taurus', 3],
    ['Mars', 'Capricorn', 28],
    ['Mercury', 'Virgo', 15],
    ['Jupiter', 'Cancer', 5],
    ['Venus', 'Pisces', 27],
    ['Saturn', 'Libra', 20],
  ];

  it('the shared table holds the verse’s seven exaltations', () => {
    for (const [planet, sign, degree] of verse) {
      expect(PLANET_EXALTATION[planet], planet).toEqual({ sign, degree });
    }
  });

  it('debilitation is the same degree of the seventh sign', () => {
    for (const [planet, sign, degree] of verse) {
      const seventh = ZODIAC_SIGNS[(ZODIAC_SIGNS.indexOf(sign as never) + 6) % 12];
      expect(PLANET_DEBILITATION[planet], planet).toEqual({ sign: seventh, degree });
    }
  });
});

describe('[BJ 2.16-17] natural friends, neutrals and enemies of the seven planets', () => {
  // 2.16: śatrū manda-sitau samaś ca śaśijo mitrāṇi śeṣā raveḥ ...
  // 2.17: sūraḥ (read sūreḥ) saumya-sitāv arī ravi-suto madhyo ...
  const verse: Record<string, { friends: Planet[]; enemies: Planet[] }> = {
    Sun: { friends: ['Moon', 'Mars', 'Jupiter'], enemies: ['Venus', 'Saturn'] },
    Moon: { friends: ['Sun', 'Mercury'], enemies: [] },
    Mars: { friends: ['Sun', 'Moon', 'Jupiter'], enemies: ['Mercury'] },
    Mercury: { friends: ['Sun', 'Venus'], enemies: ['Moon'] },
    Jupiter: { friends: ['Sun', 'Moon', 'Mars'], enemies: ['Mercury', 'Venus'] },
    Venus: { friends: ['Mercury', 'Saturn'], enemies: ['Sun', 'Moon'] },
    Saturn: { friends: ['Mercury', 'Venus'], enemies: ['Sun', 'Moon', 'Mars'] },
  };

  it('the shared table is the verse’s table', () => {
    for (const planet of SEVEN) {
      expect([...PLANET_FRIENDS[planet]].sort(), `${planet} friends`).toEqual(
        [...verse[planet]!.friends].sort(),
      );
      expect([...PLANET_ENEMIES[planet]].sort(), `${planet} enemies`).toEqual(
        [...verse[planet]!.enemies].sort(),
      );
    }
  });
});

describe('[BJ 2.13] aspects', () => {
  // tri-daśa-trikoṇa-caturasra-saptamāny avalokayanti caraṇa-abhivṛddhitaḥ /
  // ravija-amarejya-rudhirāḥ pare ca ye kramaśo bhavanti kila vīkṣaṇe adhikāḥ
  // All aspect the 7th in full; Saturn the 3rd and 10th, Jupiter the 5th and
  // 9th, Mars the 4th and 8th in full.
  it('the full aspects are the 7th for all, with the three special pairs', () => {
    expect([...aspectedOrdinals('Sun')].sort((a, b) => a - b)).toEqual([7]);
    expect([...aspectedOrdinals('Saturn')].sort((a, b) => a - b)).toEqual([3, 7, 10]);
    expect([...aspectedOrdinals('Jupiter')].sort((a, b) => a - b)).toEqual([5, 7, 9]);
    expect([...aspectedOrdinals('Mars')].sort((a, b) => a - b)).toEqual([4, 7, 8]);
  });
});

describe('[BJ 1.7] the thirtieth-parts and their lords', () => {
  // kuja-ravija-guru-jña-śukra-bhāgāḥ pavana-samīraṇa-kaurpi-jūka-leyāḥ /
  // ayuji yuji tu bhe viparyayasthaḥ
  // Odd signs: Mars 5, Saturn 5, Jupiter 8, Mercury 7, Venus 5 degrees.
  // Even signs: the reverse. The verse names LORDS; it assigns no sign.
  const lordAt = (signIndex: number, degree: number) =>
    SIGN_LORDS[ZODIAC_SIGNS[calculateD30(signIndex * 30 + degree)]!];

  it('odd sign (Aries): Mars to 5, Saturn to 10, Jupiter to 18, Mercury to 25, Venus to 30', () => {
    expect(lordAt(0, 2)).toBe('Mars');
    expect(lordAt(0, 7)).toBe('Saturn');
    expect(lordAt(0, 14)).toBe('Jupiter');
    expect(lordAt(0, 21)).toBe('Mercury');
    expect(lordAt(0, 27)).toBe('Venus');
  });

  it('even sign (Taurus): Venus to 5, Mercury to 12, Jupiter to 20, Saturn to 25, Mars to 30', () => {
    expect(lordAt(1, 2)).toBe('Venus');
    expect(lordAt(1, 8)).toBe('Mercury');
    expect(lordAt(1, 16)).toBe('Jupiter');
    expect(lordAt(1, 22)).toBe('Saturn');
    expect(lordAt(1, 27)).toBe('Mars');
  });
});

describe('[BJ 9.1-9.7] Ashtakavarga: the places each contributor makes auspicious', () => {
  // Transcribed verse by verse. House words: ādya/udaya/lagna 1, sva/dhana/
  // artha 2, tri 3, bandhu/sukha 4, suta/dhī/ātmaja 5, ari/śatru/ripu 6,
  // dyūna/smara/asta/jāyā/mada 7, nidhana/randhra/mṛtyu/chidra 8, tapas/
  // dharma 9, ājñā/karma/āspada/dik 10, āya/lābha/prāpti 11, antya/vyaya 12;
  // kendra = 1 4 7 10, upacaya = 3 6 10 11.
  const verse: Record<string, Record<string, number[]>> = {
    // 9.1 svād arkaḥ prathama-āya-bandhu-nidhana-dvy-ājñā-tapo-dyūnago ...
    Sun: {
      Sun: [1, 2, 4, 7, 8, 9, 10, 11],
      Mars: [1, 2, 4, 7, 8, 9, 10, 11], // vakrāt svād iva
      Saturn: [1, 2, 4, 7, 8, 9, 10, 11], // tadvad eva ravijāt
      Venus: [6, 7, 12], // śukrāt smara-antya-ariṣu
      Jupiter: [5, 6, 9, 11], // jīvād dharma-suta-āya-śatruṣu
      Moon: [3, 6, 10, 11], // daśa-try-āya-arigaḥ śītagoḥ
      Mercury: [3, 5, 6, 9, 10, 11, 12], // eṣv eva antya-tapaḥ-suteṣu ca budhāt
      Asc: [3, 4, 6, 10, 11, 12], // lagnāt sa-bandhv-antyagaḥ
    },
    // 9.2 lagnāt ṣaṭ-tri-daśa-āyagaḥ sa-dhana-dhī-dharmeṣu ca ārāc chaśī ...
    Moon: {
      Asc: [3, 6, 10, 11],
      Mars: [2, 3, 5, 6, 9, 10, 11],
      Moon: [1, 3, 6, 7, 10, 11], // svāt sa-asta-ādiṣu
      Sun: [3, 6, 7, 8, 10, 11], // sa-aṣṭa-saptasu raveḥ
      Saturn: [3, 5, 6, 11], // ṣaṭ-try-āya-dhīstho yamāt
      Mercury: [1, 3, 4, 5, 7, 8, 10, 11], // dhī-try-āya-aṣṭama-kaṇṭakeṣu śaśijāt
      Jupiter: [1, 4, 7, 8, 10, 11, 12], // jīvād vyaya-āya-aṣṭagaḥ kendrasthaś ca
      Venus: [3, 4, 5, 7, 9, 10, 11], // sitāt dharma-sukha-dhī-try-āya-āspada-anaṅgagaḥ
    },
    // 9.3 vakras tu upacayeṣv ināt sa-tanayeṣv ādya-adhikeṣu udayāt ...
    Mars: {
      Sun: [3, 5, 6, 10, 11],
      Asc: [1, 3, 6, 10, 11],
      Moon: [3, 6, 11], // candrād dig-viphaleṣu (the upacayas without the 10th)
      Mars: [1, 2, 4, 7, 8, 10, 11], // kendra-nidhana-prāpty-arthagaḥ svāt
      Saturn: [1, 4, 7, 8, 9, 10, 11], // dharma-āya-aṣṭama-kendrago arka-tanayāt
      Mercury: [3, 5, 6, 11], // jñāt ṣaṭ-tri-dhī-lābhagaḥ
      Venus: [6, 8, 11, 12], // śukrāt ṣaḍ-vyaya-lābha-mṛtyuṣu
      // e-text divides this "karmāny.alābha.ariṣu"; read karma-antya-lābha-ariṣu.
      Jupiter: [6, 10, 11, 12], // guroḥ karma-antya-lābha-ariṣu
    },
    // 9.4 dvy-ādya-āya-aṣṭa-tapaḥ-sukheṣu bhṛgujāt sa-try-ātmajeṣv indujaḥ ...
    Mercury: {
      Venus: [1, 2, 3, 4, 5, 8, 9, 11],
      Saturn: [1, 2, 4, 7, 8, 9, 10, 11], // sa-ājñā-asteṣu yama-ārayoḥ
      Mars: [1, 2, 4, 7, 8, 9, 10, 11],
      Jupiter: [6, 8, 11, 12], // vyaya-ripu-prāpty-aṣṭago vākpateḥ
      Sun: [5, 6, 9, 11, 12], // dharma-āya-ari-suta-vyayeṣu savituḥ
      Mercury: [1, 3, 5, 6, 9, 10, 11, 12], // svāt sa-ādya-karma-trigaḥ
      Moon: [2, 4, 6, 8, 10, 11], // ṣaṭ-sva-āya-aṣṭa-sukha-āspadeṣu himagoḥ
      Asc: [1, 2, 4, 6, 8, 10, 11], // sa-ādyeṣu lagnāt
    },
    // 9.5 dik-sva-ādya-aṣṭa-mada-āya-bandhuṣu kujāt svāt sa-trikeṣv aṅgirāḥ ...
    Jupiter: {
      // e-text divides this "aṣṭama.dāya"; read aṣṭa-mada-āya (8, 7, 11).
      Mars: [1, 2, 4, 7, 8, 10, 11],
      Jupiter: [1, 2, 3, 4, 7, 8, 10, 11],
      Sun: [1, 2, 3, 4, 7, 8, 9, 10, 11], // sūryāt sa-tri-naveṣu
      Venus: [2, 5, 6, 9, 10, 11], // dhī-sva-nava-dig-lābha-arigo bhārgavāt
      // e-text divides this "āya.ratha"; read āya-artha (11, 2).
      Moon: [2, 5, 7, 9, 11], // jāyā-āya-artha-nava-ātmajeṣu himagoḥ
      Saturn: [3, 5, 6, 12], // mandāt tri-ṣaḍ-dhī-vyaye
      Mercury: [1, 2, 4, 5, 6, 9, 10, 11], // dig-dhī-ṣaṭ-sva-sukha-āya-pūrva-navago jñāt
      Asc: [1, 2, 4, 5, 6, 7, 9, 10, 11], // sa-smaraś ca udayāt
    },
    // 9.6 lagnād ā-suta-lābha-randhra-navagaḥ sa-antyaḥ śaśāṅkāt sitaḥ ...
    Venus: {
      Asc: [1, 2, 3, 4, 5, 8, 9, 11],
      Moon: [1, 2, 3, 4, 5, 8, 9, 11, 12],
      Venus: [1, 2, 3, 4, 5, 8, 9, 10, 11], // svāt sa-ājñeṣu
      Saturn: [3, 4, 5, 8, 9, 10, 11], // sukha-tri-dhī-nava-daśa-cchidra-āptigaḥ sūryajāt
      Sun: [8, 11, 12], // randhra-āya-vyayago raveḥ (e-text: "vyago")
      Jupiter: [5, 8, 9, 10, 11], // nava-daśa-prāpty-aṣṭa-dhīstho guroḥ
      Mercury: [3, 5, 6, 9, 11], // jñād dhī-try-āya-nava-arigaḥ
      Mars: [3, 5, 6, 9, 11, 12], // tri-nava-ṣaṭ-putra-āya-sa-antyaḥ kujāt
    },
    // 9.7 mandaḥ svāt tri-suta-āya-śatruṣu śubhaḥ sa-ājñā-antyago bhūmijāt ...
    Saturn: {
      Saturn: [3, 5, 6, 11],
      Mars: [3, 5, 6, 10, 11, 12],
      Sun: [1, 2, 4, 7, 8, 10, 11], // kendra-āya-aṣṭa-dhaneṣv ināt
      Asc: [1, 3, 4, 6, 10, 11], // upacayeṣv ādye sukhe ca udayāt
      Mercury: [6, 8, 9, 10, 11, 12], // dharma-āya-ari-daśa-antya-mṛtyuṣu budhāt
      Moon: [3, 6, 11], // candrāt tri-ṣaḍ-lābhagaḥ
      Venus: [6, 11, 12], // ṣaṣṭha-āya-antya-gataḥ sitāt
      Jupiter: [5, 6, 11, 12], // suraguroḥ prāpty-antya-dhī-śatruṣu
    },
  };

  it('all 56 lists in the engine are the verses’ lists', () => {
    for (const planet of SEVEN) {
      for (const from of [...SEVEN, 'Asc']) {
        expect(
          [...BENEFIC_POINTS[planet]![from]!].sort((a, b) => a - b),
          `${planet} from ${from}`,
        ).toEqual(verse[planet]![from]);
      }
    }
  });

  it('the totals are 48, 49, 39, 54, 56, 52, 39 = 337', () => {
    const totals = SEVEN.map((planet) =>
      Object.values(verse[planet]!).reduce((sum, list) => sum + list.length, 0),
    );
    expect(totals).toEqual([48, 49, 39, 54, 56, 52, 39]);
    expect(totals.reduce((a, b) => a + b, 0)).toBe(337);
  });
});

// -----------------------------------------------------------------------------
// Yogas
// -----------------------------------------------------------------------------

/** Aries Lagna; planets placed by sign index (0 = Aries). */
function chartWith(signOf: Record<string, number>): ChartData {
  const all: Planet[] = [...SEVEN, 'Rahu', 'Ketu'];
  const planets = all.map((planet, i) => {
    const signIndex = signOf[planet] ?? (planet === 'Ketu' ? 8 : 2);
    return {
      planet,
      house: signIndex + 1,
      signIndex,
      sign: ZODIAC_SIGNS[signIndex]!,
      signDegree: 12 + i,
      longitude: signIndex * 30 + 12 + i,
      latitude: 0,
      speed: 1,
      isRetrograde: false,
    };
  });
  const houses = ZODIAC_SIGNS.map((sign, i) => ({
    house: i + 1,
    sign,
    signIndex: i,
    cusp: i * 30,
    lord: SIGN_LORDS[sign],
    planets: planets.filter((p) => p.house === i + 1).map((p) => p.planet),
  }));
  return {
    planets,
    houses,
    ascendant: { sign: 'Aries', signIndex: 0, degree: 10 },
    ayanamsa: 'lahiri',
    ayanamsaValue: 24,
    julianDay: 2451545,
  } as unknown as ChartData;
}

const present = (chart: ChartData, name: string) => {
  const found = detectAllYogas(chart).find((y) => y.name === name);
  if (!found) throw new Error(`yoga "${name}" not returned`);
  return found.present;
};

describe('[BJ 12.2] Rajju, Musala and Nala go with movable, fixed and dual signs', () => {
  // rajjur muśalaṃ nalaś cara-ādyaiḥ: "Rajju, Musala, Nala by the movable and
  // the rest", in the order movable, fixed, dual.
  it('all seven planets in movable signs is Rajju, not Nala', () => {
    // Aries, Cancer, Libra, Capricorn.
    const chart = chartWith({
      Sun: 0,
      Moon: 3,
      Mars: 6,
      Mercury: 0,
      Jupiter: 9,
      Venus: 0,
      Saturn: 6,
    });
    expect(present(chart, 'Rajju Yoga')).toBe(true);
    expect(present(chart, 'Nala Yoga')).toBe(false);
    expect(present(chart, 'Musala Yoga')).toBe(false);
  });

  it('all seven planets in fixed signs is Musala', () => {
    // Taurus, Leo, Scorpio, Aquarius.
    const chart = chartWith({
      Sun: 4,
      Moon: 1,
      Mars: 7,
      Mercury: 4,
      Jupiter: 10,
      Venus: 4,
      Saturn: 1,
    });
    expect(present(chart, 'Musala Yoga')).toBe(true);
  });

  it('all seven planets in dual signs is Nala, not Rajju', () => {
    // Gemini, Virgo, Sagittarius, Pisces.
    const chart = chartWith({
      Sun: 2,
      Moon: 5,
      Mars: 8,
      Mercury: 2,
      Jupiter: 11,
      Venus: 2,
      Saturn: 5,
    });
    expect(present(chart, 'Nala Yoga')).toBe(true);
    expect(present(chart, 'Rajju Yoga')).toBe(false);
  });
});

describe('[BJ 13.3-13.4] Sunapha, Anapha and Durudhura are three separate cases', () => {
  // hitvā arkaṃ sunaphā-anaphā-durudhurāḥ sva-antya-ubhayasthair grahaiḥ:
  // planets (the Sun apart) in the 2nd, the 12th, or both from the Moon.
  // 13.4 counts 31 Sunapha, 31 Anapha and 180 Durudhura forms; 31 + 31 + 180 =
  // 242 = 3^5 - 1, every arrangement of five planets exactly once. So a chart
  // with planets on both sides is Durudhura only.
  // Moon in Leo (house 5): 2nd from it is Virgo (5), 12th is Cancer (3).

  it('planet in the 2nd only: Sunapha', () => {
    const chart = chartWith({ Moon: 4, Mars: 5 });
    expect(present(chart, 'Sunapha Yoga')).toBe(true);
    expect(present(chart, 'Anapha Yoga')).toBe(false);
    expect(present(chart, 'Durudhara Yoga')).toBe(false);
  });

  it('planet in the 12th only: Anapha', () => {
    const chart = chartWith({ Moon: 4, Venus: 3 });
    expect(present(chart, 'Anapha Yoga')).toBe(true);
    expect(present(chart, 'Sunapha Yoga')).toBe(false);
    expect(present(chart, 'Durudhara Yoga')).toBe(false);
  });

  it('planets on both sides: Durudhura, and neither of the other two', () => {
    const chart = chartWith({ Moon: 4, Mars: 5, Venus: 3 });
    expect(present(chart, 'Durudhara Yoga')).toBe(true);
    expect(present(chart, 'Sunapha Yoga')).toBe(false);
    expect(present(chart, 'Anapha Yoga')).toBe(false);
  });

  it('the Sun does not count', () => {
    const chart = chartWith({ Moon: 4, Sun: 5 });
    expect(present(chart, 'Sunapha Yoga')).toBe(false);
  });
});

describe('[BJ 13.2] Adhi Yoga: the benefics in the 6th, 7th and 8th from the Moon', () => {
  // saumyaiḥ smara-ari-nidhaneṣv adhiyoga indoḥ. The benefics are Mercury,
  // Jupiter and Venus; they may share one of the three houses or be spread
  // over them (seven arrangements, as the 1885 translation's note lists).
  // Moon in Aries (house 1): 6th Virgo (5), 7th Libra (6), 8th Scorpio (7).

  it('all three benefics together in the 7th from the Moon', () => {
    const chart = chartWith({ Moon: 0, Mercury: 6, Jupiter: 6, Venus: 6, Sun: 6 });
    expect(present(chart, 'Adhi Yoga')).toBe(true);
  });

  it('spread over the 6th, 7th and 8th', () => {
    const chart = chartWith({ Moon: 0, Mercury: 5, Jupiter: 6, Venus: 7, Sun: 5 });
    expect(present(chart, 'Adhi Yoga')).toBe(true);
  });

  it('only two of the three benefics there: not Adhi Yoga', () => {
    const chart = chartWith({ Moon: 0, Jupiter: 5, Venus: 6, Mercury: 2, Sun: 2 });
    expect(present(chart, 'Adhi Yoga')).toBe(false);
  });
});

describe('[BJ 13.9] Vasumati: all the benefics in the growing houses', () => {
  // lagnād atīva vasumān vasumāñ chaśāṅkāt saumyagrahair upacaya-upagataiḥ
  // samastaiḥ / dvābhyāṃ samaḥ ...: with ALL the benefics (Mercury, Jupiter,
  // Venus) in the 3rd, 6th, 10th or 11th from the Lagna (very wealthy) or
  // from the Moon (wealthy). With two it is only middling, so not the yoga.

  it('all three in the 3rd from the Moon (one house is enough)', () => {
    // Moon in Leo (4); 3rd from it is Libra (6). From the Aries Lagna that is the 7th.
    const chart = chartWith({ Moon: 4, Mercury: 6, Jupiter: 6, Venus: 6, Sun: 6 });
    expect(present(chart, 'Vasumathi Yoga')).toBe(true);
  });

  it('all three in growing houses from the Lagna, though not from the Moon', () => {
    // Aries Lagna: 3rd Gemini (2), 6th Virgo (5), 11th Aquarius (10).
    // Moon in Gemini (2): from it those are the 1st, 4th and 9th.
    const chart = chartWith({ Moon: 2, Mercury: 2, Jupiter: 5, Venus: 10, Sun: 2 });
    expect(present(chart, 'Vasumathi Yoga')).toBe(true);
  });

  it('two benefics only: not the yoga', () => {
    // Moon in Leo (4): 3rd Libra (6), 6th Capricorn (9). Mercury in Leo with the Moon.
    const chart = chartWith({ Moon: 4, Jupiter: 6, Venus: 9, Mercury: 4, Sun: 4 });
    expect(present(chart, 'Vasumathi Yoga')).toBe(false);
  });
});
