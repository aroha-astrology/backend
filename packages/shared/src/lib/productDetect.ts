/* -------------------------------------------------------------------------- */
/*  Product detection for AI chat remedies.                                   */
/*  When the assistant mentions a buyable Vedic remedy item (gemstone,         */
/*  rudraksha, yantra, mala, idol), the client renders a small card under the */
/*  message that opens a Google Shopping search in a new tab/window.          */
/* -------------------------------------------------------------------------- */

export type ProductCategory = 'gemstone' | 'rudraksha' | 'yantra' | 'mala' | 'idol' | 'puja-item';

export interface DetectedProduct {
  name: string;
  searchQuery: string;
  category: ProductCategory;
}

interface StaticRule {
  pattern: RegExp;
  name: string;
  searchQuery: string;
  category: ProductCategory;
}

const STATIC_RULES: StaticRule[] = [
  // Gemstones (Vedic nine — Navaratna)
  { pattern: /\b(ruby|manik|maanik)\b/i,                                      name: 'Ruby (Manik)',               searchQuery: 'ruby manik gemstone certified',         category: 'gemstone' },
  { pattern: /\b(pearl|moti)\b/i,                                             name: 'Pearl (Moti)',               searchQuery: 'pearl moti gemstone certified',         category: 'gemstone' },
  { pattern: /\b(red\s*coral|moonga|munga|praval)\b/i,                        name: 'Red Coral (Moonga)',         searchQuery: 'red coral moonga gemstone certified',   category: 'gemstone' },
  { pattern: /\b(emerald|panna|markat)\b/i,                                   name: 'Emerald (Panna)',            searchQuery: 'emerald panna gemstone certified',      category: 'gemstone' },
  { pattern: /\b(yellow\s*sapphire|pukhraj|pushparagam|pushyaraga)\b/i,       name: 'Yellow Sapphire (Pukhraj)',  searchQuery: 'yellow sapphire pukhraj gemstone certified', category: 'gemstone' },
  { pattern: /\b(diamond|heera|heerak|vajra)\b/i,                             name: 'Diamond (Heera)',            searchQuery: 'diamond heera gemstone certified',      category: 'gemstone' },
  { pattern: /\b(blue\s*sapphire|neelam|neela|indraneel)\b/i,                 name: 'Blue Sapphire (Neelam)',     searchQuery: 'blue sapphire neelam gemstone certified', category: 'gemstone' },
  { pattern: /\b(hessonite|gomed|gomedh|gomedhakam)\b/i,                      name: 'Hessonite (Gomed)',          searchQuery: 'hessonite gomed gemstone certified',    category: 'gemstone' },
  { pattern: /\b(cat'?s?\s*eye|lehsuniya|lahsuniya|vaidurya)\b/i,             name: "Cat's Eye (Lehsuniya)",      searchQuery: 'cats eye lehsuniya gemstone certified', category: 'gemstone' },

  // Substitute / semi-precious gems often suggested
  { pattern: /\b(citrine|sunela|sunehla|sunhela)\b/i,                         name: 'Citrine (Sunela)',           searchQuery: 'citrine sunela gemstone',               category: 'gemstone' },
  { pattern: /\b(amethyst|katela|jamunia)\b/i,                                name: 'Amethyst',                   searchQuery: 'amethyst katela gemstone',              category: 'gemstone' },
  { pattern: /\b(turquoise|firoza|firoze)\b/i,                                name: 'Turquoise (Firoza)',         searchQuery: 'turquoise firoza gemstone',             category: 'gemstone' },
  { pattern: /\b(opal)\b/i,                                                   name: 'Opal',                       searchQuery: 'opal gemstone certified',               category: 'gemstone' },

  // Yantras
  { pattern: /\b(shri|sri)\s*yantra\b/i,                                      name: 'Shri Yantra',                searchQuery: 'shri yantra brass copper',              category: 'yantra' },
  { pattern: /\bkuber(a)?\s*yantra\b/i,                                       name: 'Kuber Yantra',               searchQuery: 'kuber yantra wealth prosperity',        category: 'yantra' },
  { pattern: /\bnavagraha\s*yantra\b/i,                                       name: 'Navagraha Yantra',           searchQuery: 'navagraha yantra brass',                category: 'yantra' },
  { pattern: /\bmahamrityunjaya\s*yantra\b/i,                                 name: 'Mahamrityunjaya Yantra',     searchQuery: 'mahamrityunjaya yantra brass',          category: 'yantra' },
  { pattern: /\bvastu\s*yantra\b/i,                                           name: 'Vastu Yantra',               searchQuery: 'vastu yantra brass',                    category: 'yantra' },
  { pattern: /\bhanuman\s*yantra\b/i,                                         name: 'Hanuman Yantra',             searchQuery: 'hanuman yantra brass',                  category: 'yantra' },
  { pattern: /\bsaraswati\s*yantra\b/i,                                       name: 'Saraswati Yantra',           searchQuery: 'saraswati yantra brass',                category: 'yantra' },
  { pattern: /\bganesh(a)?\s*yantra\b/i,                                      name: 'Ganesh Yantra',              searchQuery: 'ganesh yantra brass',                   category: 'yantra' },
  { pattern: /\bdurga\s*yantra\b/i,                                           name: 'Durga Yantra',               searchQuery: 'durga yantra brass',                    category: 'yantra' },
  { pattern: /\blakshmi\s*yantra\b/i,                                         name: 'Lakshmi Yantra',             searchQuery: 'lakshmi yantra brass wealth',           category: 'yantra' },
  { pattern: /\bbagalamukhi\s*yantra\b/i,                                     name: 'Bagalamukhi Yantra',         searchQuery: 'bagalamukhi yantra brass',              category: 'yantra' },

  // Mala
  { pattern: /\btulsi\s*mala\b/i,                                             name: 'Tulsi Mala',                 searchQuery: 'tulsi mala original 108 beads',         category: 'mala' },
  { pattern: /\b(sphatik|sphatic|crystal)\s*mala\b/i,                         name: 'Sphatik (Crystal) Mala',     searchQuery: 'sphatik crystal mala 108 beads',        category: 'mala' },
  { pattern: /\brudraksha\s*mala\b/i,                                         name: 'Rudraksha Mala',             searchQuery: 'rudraksha mala 108 beads original',     category: 'mala' },
  { pattern: /\b(red\s*chandan|raktachandan)\s*mala\b/i,                      name: 'Red Sandalwood Mala',        searchQuery: 'red sandalwood chandan mala 108 beads', category: 'mala' },
  { pattern: /\b(chandan|sandalwood)\s*mala\b/i,                              name: 'Sandalwood Mala',            searchQuery: 'chandan sandalwood mala 108 beads',     category: 'mala' },

  // Idols / Murti
  { pattern: /\b(ganesh|ganesha|ganpati)\s+(idol|murti|statue)\b/i,           name: 'Ganesha Idol',               searchQuery: 'ganesha brass idol murti',              category: 'idol' },
  { pattern: /\b(lakshmi|laxmi)\s+(idol|murti|statue)\b/i,                    name: 'Lakshmi Idol',               searchQuery: 'lakshmi brass idol murti',              category: 'idol' },
  { pattern: /\bhanuman\s+(idol|murti|statue)\b/i,                            name: 'Hanuman Idol',               searchQuery: 'hanuman brass idol murti',              category: 'idol' },
  { pattern: /\b(shiva|shiv)\s+(idol|murti|statue|lingam|linga)\b/i,          name: 'Shiva / Shivling',           searchQuery: 'shiva lingam idol murti',               category: 'idol' },
  { pattern: /\b(krishna)\s+(idol|murti|statue)\b/i,                          name: 'Krishna Idol',               searchQuery: 'krishna brass idol murti',              category: 'idol' },
  { pattern: /\bnataraj(a)?\s+(idol|murti|statue)\b/i,                        name: 'Nataraja Idol',              searchQuery: 'nataraja brass idol',                   category: 'idol' },

  // Puja items
  { pattern: /\b(copper|tamba)\s*(kalash|lota|patra)\b/i,                     name: 'Copper Kalash',              searchQuery: 'copper kalash puja',                    category: 'puja-item' },
  { pattern: /\b(camphor|kapoor|karpura)\b/i,                                 name: 'Camphor (Kapoor)',           searchQuery: 'camphor kapoor puja',                   category: 'puja-item' },
  { pattern: /\b(ghee\s*diya|diya|deepak)\b/i,                                name: 'Brass Diya',                 searchQuery: 'brass diya deepak puja',                category: 'puja-item' },
  { pattern: /\b(parad|paarad|mercury)\s+(shivling|shivlinga|lingam)\b/i,     name: 'Parad Shivling',             searchQuery: 'parad shivling mercury',                category: 'puja-item' },
];

const MUKHI_WORD: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, cheh: 6, saat: 7, aath: 8, nau: 9, das: 10, dus: 10,
};

export function detectProducts(text: string): DetectedProduct[] {
  if (!text || typeof text !== 'string') return [];
  const out: DetectedProduct[] = [];
  const seen = new Set<string>();
  const add = (p: DetectedProduct) => {
    if (seen.has(p.name)) return;
    seen.add(p.name);
    out.push(p);
  };

  // N-mukhi rudraksha (digits or English/Hindi number words)
  const mukhiRe = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|ek|do|teen|char|chaar|paanch|panch|chhe|cheh|saat|aath|nau|das|dus)[\s\-]*mukhi\s*rudraksh(a|am)?\b/gi;
  let hadSpecificRudraksha = false;
  let m: RegExpExecArray | null;
  while ((m = mukhiRe.exec(text)) !== null) {
    const raw = m[1].toLowerCase();
    const n = /^\d+$/.test(raw) ? parseInt(raw, 10) : MUKHI_WORD[raw];
    if (!n || n < 1 || n > 21) continue;
    hadSpecificRudraksha = true;
    add({
      name: `${n}-Mukhi Rudraksha`,
      searchQuery: `${n} mukhi rudraksha original certified`,
      category: 'rudraksha',
    });
  }

  if (/\bgauri[\s\-]*shankar(\s*rudraksh(a|am)?)?\b/i.test(text)) {
    hadSpecificRudraksha = true;
    add({ name: 'Gauri Shankar Rudraksha', searchQuery: 'gauri shankar rudraksha original', category: 'rudraksha' });
  }

  if (!hadSpecificRudraksha && /\brudraksh(a|am)?\b/i.test(text)) {
    add({ name: 'Rudraksha', searchQuery: 'rudraksha original certified', category: 'rudraksha' });
  }

  for (const rule of STATIC_RULES) {
    if (rule.pattern.test(text)) {
      add({ name: rule.name, searchQuery: rule.searchQuery, category: rule.category });
    }
  }

  return out;
}

export function buildProductSearchUrl(query: string): string {
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query + ' buy online')}`;
}
