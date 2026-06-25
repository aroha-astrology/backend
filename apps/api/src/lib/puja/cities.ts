// City slug vocabulary shared with the seeded pandits + pandit_profiles tables.
// Keep aligned with supabase/migrations/032_pandit_puja.sql.
export const PANDIT_CITIES: { slug: string; label: string }[] = [
  { slug: 'delhi',     label: 'Delhi'     },
  { slug: 'mumbai',    label: 'Mumbai'    },
  { slug: 'bengaluru', label: 'Bengaluru' },
  { slug: 'chennai',   label: 'Chennai'   },
  { slug: 'hyderabad', label: 'Hyderabad' },
  { slug: 'kolkata',   label: 'Kolkata'   },
  { slug: 'pune',      label: 'Pune'      },
  { slug: 'ahmedabad', label: 'Ahmedabad' },
  { slug: 'varanasi',  label: 'Varanasi'  },
  { slug: 'prayagraj', label: 'Prayagraj' },
];

export function citySlugFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  if (n.includes('bangalore') || n.includes('bengaluru')) return 'bengaluru';
  if (n.includes('mumbai') || n.includes('bombay'))       return 'mumbai';
  if (n.includes('delhi'))                                 return 'delhi';
  if (n.includes('chennai') || n.includes('madras'))      return 'chennai';
  if (n.includes('hyderabad'))                             return 'hyderabad';
  if (n.includes('kolkata') || n.includes('calcutta'))    return 'kolkata';
  if (n.includes('pune'))                                  return 'pune';
  if (n.includes('ahmedabad'))                             return 'ahmedabad';
  if (n.includes('varanasi') || n.includes('banaras'))    return 'varanasi';
  if (n.includes('prayagraj') || n.includes('allahabad')) return 'prayagraj';
  return null;
}

export const PANDIT_LANGUAGES = [
  'Hindi', 'Sanskrit', 'English', 'Bengali', 'Marathi', 'Tamil',
  'Telugu', 'Kannada', 'Gujarati', 'Malayalam', 'Punjabi', 'Bhojpuri',
];
