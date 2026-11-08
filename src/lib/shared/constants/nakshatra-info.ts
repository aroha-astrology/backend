// =============================================================================
// Nakshatra meaning data (deity, symbol, nature, shakti), shared by chat, the kundli screen and reports
// =============================================================================
// Index 0-26 follows NAKSHATRAS in astrology.ts. Every field has ONE named source, read on 2026-11-08
// (see NAKSHATRA_INFO_SOURCES). A field with no checked source is left out, not filled from memory:
//   - body part, purushartha and element are NOT here. The pages found disagree with each other and none
//     is a classical text (Muhurta Chintamani and the Taittiriya Brahmana were not opened).
//   - the word "death" is kept out of every string below (owner rule: no death outputs in reports). The
//     sources use it for Bharani's deity and shakti, Magha's shakti and a bier symbol; those entries are
//     written without it and say so here.
// Gana, yoni and nadi stay in astrology.ts (NAKSHATRA_GANA / _YONI / _NADI).
// =============================================================================

export type NakshatraNature =
  | 'kshipra'
  | 'mridu'
  | 'tikshna'
  | 'ugra'
  | 'sthira'
  | 'chara'
  | 'mishra';

export interface NakshatraInfo {
  /** Presiding deity. */
  deity: string;
  /** Traditional symbol. */
  symbol: string;
  /** One of the seven groups (kshipra swift, mridu gentle, tikshna sharp, ugra fierce, sthira fixed, chara moving, mishra mixed). */
  nature: NakshatraNature;
  /** The shakti (power) of the star: its Sanskrit name and a plain meaning. */
  shakti: { name: string; meaning: string };
}

export const NAKSHATRA_INFO: readonly NakshatraInfo[] = [
  { deity: 'Ashvins', symbol: "Horse's head", nature: 'kshipra', shakti: { name: 'shidhra vyapani', meaning: 'the power to reach things quickly' } },
  { deity: 'Yama', symbol: 'Yoni', nature: 'ugra', shakti: { name: 'apabharani', meaning: 'the power to carry things away' } },
  { deity: 'Agni', symbol: 'Knife or spear', nature: 'mishra', shakti: { name: 'dahana', meaning: 'the power to burn and purify' } },
  { deity: 'Prajapati', symbol: 'Cart or chariot', nature: 'sthira', shakti: { name: 'rohana', meaning: 'the power of growth' } },
  { deity: 'Soma', symbol: "Deer's head", nature: 'mridu', shakti: { name: 'prinana', meaning: 'the power to give fulfilment' } },
  { deity: 'Rudra', symbol: 'Teardrop', nature: 'tikshna', shakti: { name: 'yatna', meaning: 'the power of effort' } },
  { deity: 'Aditi', symbol: 'Bow and quiver', nature: 'chara', shakti: { name: 'vasutva prapana', meaning: 'the power to gain wealth or substance' } },
  { deity: 'Brihaspati', symbol: "Cow's udder, lotus", nature: 'kshipra', shakti: { name: 'brahmavarchasa', meaning: 'the power to create spiritual energy' } },
  { deity: 'Sarpas (the Nagas)', symbol: 'Serpent', nature: 'tikshna', shakti: { name: 'visasleshana', meaning: 'the power to cling and entangle' } },
  { deity: 'Pitrs (the ancestors)', symbol: 'Royal throne', nature: 'ugra', shakti: { name: 'tyage kshepani', meaning: 'the power to let go and cast off' } },
  { deity: 'Bhaga', symbol: 'Front legs of a bed', nature: 'ugra', shakti: { name: 'prajanana', meaning: 'the power of creation' } },
  { deity: 'Aryaman', symbol: 'Back legs of a bed', nature: 'sthira', shakti: { name: 'chayani', meaning: 'the power to give prosperity through union' } },
  { deity: 'Savitar', symbol: 'Hand or fist', nature: 'kshipra', shakti: { name: 'hasta sthapaniya agama', meaning: 'the power to place what we seek in our own hands' } },
  { deity: 'Tvashtar', symbol: 'Bright jewel or pearl', nature: 'mridu', shakti: { name: 'punya cayani', meaning: 'the power to gather merit' } },
  { deity: 'Vayu', symbol: 'Shoot of a plant', nature: 'chara', shakti: { name: 'pradhvamsa', meaning: 'the power to scatter like the wind' } },
  { deity: 'Indra and Agni', symbol: "Triumphal arch, potter's wheel", nature: 'mishra', shakti: { name: 'vyapana', meaning: 'the power to reach many fruits' } },
  { deity: 'Mitra', symbol: 'Triumphal archway, lotus', nature: 'mridu', shakti: { name: 'radhana', meaning: 'the power of worship and devotion' } },
  { deity: 'Indra', symbol: 'Circular amulet, umbrella, earring', nature: 'tikshna', shakti: { name: 'arohana', meaning: 'the power to rise and conquer' } },
  { deity: 'Nirrti', symbol: 'Bunch of roots tied together', nature: 'tikshna', shakti: { name: 'barhana', meaning: 'the power to break things apart to the root' } },
  { deity: 'Apah (the waters)', symbol: 'Elephant tusk, fan', nature: 'ugra', shakti: { name: 'varchograhana', meaning: 'the power of invigoration' } },
  { deity: 'Vishvedevas', symbol: 'Elephant tusk, small bed', nature: 'sthira', shakti: { name: 'apradhrisya', meaning: 'the power of unchallenged victory' } },
  { deity: 'Vishnu', symbol: 'Ear, three footprints', nature: 'chara', shakti: { name: 'samhanana', meaning: 'the power of connection' } },
  { deity: 'The eight Vasus', symbol: 'Drum or flute', nature: 'chara', shakti: { name: 'khyapayitri', meaning: 'the power to give abundance and fame' } },
  { deity: 'Varuna', symbol: 'Empty circle', nature: 'chara', shakti: { name: 'bheshaja', meaning: 'the power of healing' } },
  { deity: 'Aja Ekapad', symbol: 'Swords, front legs of a cot', nature: 'ugra', shakti: { name: 'yajamana udyamana', meaning: 'the power to lift a person up spiritually' } },
  { deity: 'Ahir Budhnya', symbol: 'Twins, back legs of a cot', nature: 'sthira', shakti: { name: 'varshodyamana', meaning: 'the power to bring rain' } },
  { deity: 'Pushan', symbol: 'Fish, a pair of fish', nature: 'mridu', shakti: { name: 'kshiradyapani', meaning: 'the power of nourishment' } },
];

/** Where each field came from. All pages were read on 2026-11-08. */
export const NAKSHATRA_INFO_SOURCES = {
  deity: 'Wikipedia, List of Nakshatras (en.wikipedia.org/wiki/List_of_Nakshatras), the "Deity" line of each star',
  symbol:
    'Wikipedia, List of Nakshatras, the "Symbol" line of each star. The bier wording for the two Bhadrapada stars is shortened to "cot".',
  nature:
    'Drik Panchang, Nakshatra Seven Category Classification (drikpanchang.com/panchang/nakshatra/classification/nakshatra-seven-category.html): Short=kshipra, Gentle=mridu, Ferocious=tikshna, Cruel=ugra, Fixed=sthira, Movable=chara, Ordinary=mishra. The page does not name Muhurta Chintamani.',
  shakti:
    'American Institute of Vedic Studies, "Shaktis of the Nakshatras" (vedanet.com/?p=198). The Sanskrit names are the page names. The English meaning is a plain rewording; for Bharani, Magha and Ashlesha the page uses harsher words, left out on purpose.',
  notIncluded:
    'Body part, purushartha, element: no checked source. The Taittiriya Brahmana (deities) and Muhurta Chintamani (nature groups) were not opened; the pages above are secondary.',
} as const;

/** Abhijit, the 28th star, sits between Uttara Ashadha and Shravana (Wikipedia: 06°40' to 10°53'20" Makara). */
export const ABHIJIT_START_DEG = 276 + 40 / 60;
export const ABHIJIT_END_DEG = 280 + 53 / 60 + 20 / 3600;
