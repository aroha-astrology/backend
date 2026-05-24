// Samagri (ritual materials) checklist per puja slug.
// Used by the pandit booking detail page to show what to prep.
// Falls back to DEFAULT_SAMAGRI if a slug isn't listed.

export const DEFAULT_SAMAGRI = [
  'Roli (kumkum)',
  'Akshat (rice)',
  'Diya + ghee',
  'Agarbatti',
  'Camphor',
  'Flowers',
  'Naivedya (sweets)',
];

export const SAMAGRI: Record<string, string[]> = {
  'rudra-abhishek':       ['Panchamrit', 'Milk', 'Bel Patra', 'Ganga Jal', 'Bhasma', 'Bhang flower', 'Sandalwood paste'],
  'maha-mrityunjaya-jaap':['Rudraksh mala', 'Bel Patra', 'White flowers', 'Ghee diya', 'Sandalwood', 'Bhasma'],
  'ganapathi-homam':      ['Modak', 'Durva', 'Red flowers', 'Samidha (palasha)', 'Ghee', 'Coconut'],
  'navagraha-shanti':     ['9 grains', '9 cloths (5-colour)', 'Samidha', 'Ghee', 'Each-graha mantra book'],
  'mangal-shanti':        ['Masoor dal', 'Red flowers', 'Red chandan', 'Copper kalash', 'Red cloth'],
  'kaal-sarp-shanti':     ['Silver naga jodi', 'Milk', 'Rudraksh', 'Bel Patra', 'White flowers'],
  'sade-sati-shanti':     ['Til oil', 'Black sesame', 'Black cloth', 'Iron utensils', 'Shani mantra book'],
  'pitra-tarpan':         ['Black sesame', 'White flowers', 'Pinda (rice balls)', 'Kush grass', 'Ganga Jal'],
  'maha-lakshmi-puja':    ['Lotus flowers', 'Red cloth', 'Gold/silver coin', 'Kheer', 'Camphor', 'Kuber yantra'],
  'saraswati-puja':       ['White flowers', 'White cloth', 'Pen/book', 'Tulsi', 'Yellow chandan'],
  'durga-saptashati':     ['Red chunari', 'Red flowers', 'Coconut', 'Saptashati pothi', 'Akhand jyot'],
  'hanuman-puja':         ['Sindoor', 'Chameli oil', 'Red cloth', 'Boondi laddoo', 'Rose flowers'],
  'satya-narayan-katha':  ['Panchamrit', 'Banana leaves', 'Chana atta sheera', 'Tulsi leaves', 'Yellow cloth'],
  'vastu-shanti':         ['9 kalash', 'Mango leaves', 'Vastu yantra', 'Red cloth', 'Coconut'],
  'griha-pravesh':        ['Kalash', 'Mango leaves', 'Coconut', 'Mango/jasmine garland', 'Red cloth'],
  'sundarkand-path':      ['Sundarkand pothi', 'Hanuman idol', 'Ghee diya', 'Sindoor', 'Red cloth'],
  'hanuman-chalisa-path': ['Chalisa pothi', 'Hanuman idol', 'Sindoor', 'Boondi prasad', 'Red cloth'],
  'chandi-homam':         ['64 samidha types', 'Red flowers', 'Coconut', 'Devi pothi', 'Akhand jyot'],
  'lakshmi-kuber-puja':   ['Sri yantra', 'Kuber yantra', 'Gold coin', 'Lotus', 'Yellow cloth'],
  'trayambakeshwar-puja': ['11 kalash', 'Panchamrit', 'Rudri pothi', 'Bel Patra (108)', 'Bhasma'],
  'bhairav-puja':         ['Black sesame', 'Mustard oil', 'Black cloth', 'Bhairav idol', 'Camphor'],
  'ayyappa-puja':         ['Ghee', 'Coconut', 'Banana', 'Vibhuti', 'Black cloth'],
  'subramanya-abhishek':  ['Milk', 'Panchamrit', 'Vibhuti', 'Red flowers', 'Coconut'],
  'tulsi-vivah':          ['Tulsi pot', 'Shaligram', 'Yellow cloth', 'Sugarcane stalks', 'Mango leaves'],
  'go-puja':              ['Green fodder', 'Banana', 'Jaggery', 'Roli, akshat', 'Tilak items'],
  'annapurna-puja':       ['Cooked rice', 'Lotus flowers', 'Silver/copper utensil', 'Coconut', 'Yellow cloth'],
};

export function samagriFor(slug: string): string[] {
  return SAMAGRI[slug] ?? DEFAULT_SAMAGRI;
}
